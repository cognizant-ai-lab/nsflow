
# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# imitations under the License.
#
# END COPYRIGHT
"""
NSFlow -> Neuro-SAN HTTP proxy.

Purpose
-------
Expose a single same-origin endpoint (under /api/proxy/*) from the NSFlow web app
that securely forwards requests to the Neuro-SAN server. This avoids browser CORS
issues and lets you centrally manage which upstream paths/methods are allowed.

Current Mode (default)
----------------------
- Allow ALL paths and forward only the configured HTTP methods (default: GET, POST).
- Passes through query params and body, strips hop-by-hop headers, and can attach
  an Authorization bearer token if NEURO_SAN_SHARED_TOKEN is set.

How to Lock Down Later (no code changes)
----------------------------------------
- Set PROXY_ALLOW_ALL=false to enable a simple allowlist by *first path segment*.
- Provide a comma-separated list in PROXY_ALLOWED_PATHS, e.g.:
    PROXY_ALLOWED_PATHS="list,chat,status,v1"
- Optionally restrict methods via PROXY_ALLOWED_METHODS (e.g. "GET,POST").

Key Environment Variables
-------------------------
- PROXY_ALLOW_ALL          : "true"/"false" (default "true"). When false, only
                             paths whose first segment appears in PROXY_ALLOWED_PATHS
                             are forwarded.
- PROXY_ALLOWED_PATHS      : Comma-separated allowlist of first segments (effective
                             only when PROXY_ALLOW_ALL=false).
- PROXY_ALLOWED_METHODS    : Comma-separated HTTP methods (default "GET,POST").
- PROXY_MAX_BODY_MB        : Max request body size in MB (default 10).
- NEURO_SAN_SERVER_CONNECTION : "http" or "https" (default "https").
- NEURO_SAN_SERVER_HOST    : Upstream host, e.g., "neuro-san.onrender.com".
- NEURO_SAN_SERVER_HTTP_PORT : Upstream port, e.g., "443".
- NEURO_SAN_SHARED_TOKEN   : Optional shared secret; if set, proxy adds
                             "Authorization: Bearer <token>" to forwarded requests.

Notes
-----
- Keep PROXY_ALLOW_ALL=true during early integration, then flip to false and
  populate PROXY_ALLOWED_PATHS when you’re ready to restrict access.
- Upstream (Neuro-SAN) should validate the shared token if you set it here.
"""

import os
from typing import Set
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import Response
import httpx

router_proxy = APIRouter()

AGENT_PROTO = os.getenv("NEURO_SAN_SERVER_CONNECTION", "https")
AGENT_HOST  = os.getenv("NEURO_SAN_SERVER_HOST", "neuro-san.onrender.com")
AGENT_PORT  = os.getenv("NEURO_SAN_SERVER_HTTP_PORT", "443")
SHARED_TOKEN = os.getenv("NEURO_SAN_SHARED_TOKEN")  # set same value on neuro-san

BASE = f"{AGENT_PROTO}://{AGENT_HOST}" + (f":{AGENT_PORT}" if AGENT_PORT not in ("80","443") else "")

# Use simple policy knobs
# Allow ALL paths by default. Later, set PROXY_ALLOW_ALL="false" and list allowed segments.
PROXY_ALLOW_ALL = os.getenv("PROXY_ALLOW_ALL", "true").strip().lower() in {"1","true","yes","on"}

# Comma-separated first-segment allowlist (effective only when PROXY_ALLOW_ALL=false)
# Example: "list,chat,status,v1"
ALLOWED_PATHS: Set[str] = {
    s.strip().strip("/") for s in os.getenv("PROXY_ALLOWED_PATHS", "").split(",") if s.strip()
}

# Methods (keep simple; change via env if needed)
ALLOWED_METHODS: Set[str] = {
    m.strip().upper() for m in os.getenv("PROXY_ALLOWED_METHODS", "GET,POST").split(",")
    if m.strip()
}

# Hop-by-hop headers to strip
HOP_BY_HOP = {
    "connection","keep-alive","proxy-authenticate","proxy-authorization",
    "te","trailers","transfer-encoding","upgrade"
}

# Shared client
client = httpx.AsyncClient(
    follow_redirects=True,
    timeout=httpx.Timeout(15.0, connect=5.0, read=10.0, write=10.0),
    limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
    headers={"User-Agent": "nsflow-proxy/1.0"},
)

@router_proxy.api_route("/proxy/{path:path}", methods=list(ALLOWED_METHODS))
async def proxy(path: str, request: Request):
    # Normalize first segment (e.g., "v1", "list", "chat")
    first_seg = path.split("/", 1)[0].strip()

    # Simple method check
    if request.method not in ALLOWED_METHODS:
        raise HTTPException(status_code=405, detail="Method not allowed")

    # Path policy:
    # - If PROXY_ALLOW_ALL=true -> skip checks
    # - Else require first_seg to be in ALLOWED_PATHS
    if not PROXY_ALLOW_ALL:
        if not first_seg or first_seg not in ALLOWED_PATHS:
            raise HTTPException(status_code=404, detail="Not found")

    url = f"{BASE}/{path}"

    # Copy headers safely
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}
    headers.pop("host", None)
    if SHARED_TOKEN:
        headers["Authorization"] = f"Bearer {SHARED_TOKEN}"

    # Optional body cap (10MB)
    body = await request.body()
    if len(body) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Payload too large")

    # Forward
    upstream = await client.request(
        request.method,
        url,
        headers=headers,
        content=body if body else None,
        params=request.query_params,
    )

    resp_headers = {k: v for k, v in upstream.headers.items() if k.lower() not in HOP_BY_HOP}
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )

## Usage pattern
# 1) Allow weverything (default sate)
#Do nothing, or explicitly set on nsflow:

# PROXY_ALLOW_ALL=true

# 2) Finegrained policy control
# lock it down (no code change)
# PROXY_ALLOW_ALL=false
# PROXY_ALLOWED_PATHS=list,networks,connectivity,sly_data
# PROXY_ALLOWED_METHODS=GET,POST
# # Optional shared token passed to neuro-san (and validated there, if ever needed)
# NEURO_SAN_SHARED_TOKEN=***your-secret***
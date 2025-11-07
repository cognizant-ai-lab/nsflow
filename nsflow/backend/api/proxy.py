
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
import os
from typing import Set
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import Response
import httpx

router_proxy = APIRouter()

NEURO_PROTO = os.getenv("NEURO_SAN_SERVER_CONNECTION", "https")
NEURO_HOST  = os.getenv("NEURO_SAN_SERVER_HOST", "neuro-san.onrender.com")
NEURO_PORT  = os.getenv("NEURO_SAN_SERVER_HTTP_PORT", "443")
SHARED_TOKEN = os.getenv("NEURO_SAN_SHARED_TOKEN")  # set same value on neuro-san

BASE = f"{NEURO_PROTO}://{NEURO_HOST}" + (f":{NEURO_PORT}" if NEURO_PORT not in ("80","443") else "")

ALLOWED_METHODS: Set[str] = {"GET","POST"}  # tighten as needed
ALLOWED_PATHS: Set[str] = { "list", "chat", "status" }  # tighten to your real API

HOP_BY_HOP = {
    "connection","keep-alive","proxy-authenticate","proxy-authorization",
    "te","trailers","transfer-encoding","upgrade"
}

client = httpx.AsyncClient(
    follow_redirects=True,
    timeout=httpx.Timeout(15.0, connect=5.0, read=10.0, write=10.0),
    limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
    headers={"User-Agent": "nsflow-proxy/1.0"},
)

@router_proxy.api_route("/proxy/{path:path}", methods=list(ALLOWED_METHODS))
async def proxy(path: str, request: Request):
    # allow only exact endpoints or a prefix you trust
    first_seg = path.split("/", 1)[0]
    if first_seg not in ALLOWED_PATHS:
        raise HTTPException(status_code=404, detail="Not found")

    if request.method not in ALLOWED_METHODS:
        raise HTTPException(status_code=405, detail="Method not allowed")

    url = f"{BASE}/{path}"

    # copy headers safely
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}
    headers.pop("host", None)
    if SHARED_TOKEN:
        headers["Authorization"] = f"Bearer {SHARED_TOKEN}"

    # optionally cap body size
    body = await request.body()
    if len(body) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(status_code=413, detail="Payload too large")

    # forward
    r = await client.request(
        request.method,
        url,
        headers=headers,
        content=body,
        params=request.query_params
    )

    # pass back response with safe headers
    resp_headers = {k: v for k, v in r.headers.items() if k.lower() not in HOP_BY_HOP}
    return Response(
        content=r.content,
        status_code=r.status_code,
        headers=resp_headers,
        media_type=r.headers.get("content-type")
    )

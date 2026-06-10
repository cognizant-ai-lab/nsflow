# Copyright © 2025 Cognizant Technology Solutions Corp, www.cognizant.com.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# END COPYRIGHT
"""
FastAPI endpoints for connecting nsflow to OAuth-protected MCP servers.

The frontend Connectors tab uses these to start an OAuth flow (returning the
authorization URL it opens in a popup), receive the provider's redirect, and
list/remove stored connections. Tokens themselves are persisted on the backend
and injected into ``sly_data`` at chat time - they are never returned to the UI.
"""

import asyncio
import html
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

from nsflow.backend.utils.mcp.mcp_oauth_manager import mcp_oauth_manager
from nsflow.backend.utils.mcp.mcp_token_storage import FileTokenStorage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/mcp/oauth")


class StartFlowRequest(BaseModel):
    """Body for POST /start."""

    server_url: str
    scope: Optional[str] = None
    # Optional manual client credentials for servers without dynamic client
    # registration (e.g. GitHub). client_secret makes it a confidential client.
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


def _callback_html(status: str, server_url: str, message: str = "") -> str:
    """
    HTML returned to the OAuth popup. It notifies the opener via postMessage and
    closes itself, falling back to a readable message if it cannot close.
    """
    # Values are server-controlled / our own flow data; still JSON-encode for safety.
    import json

    payload = json.dumps(
        {"type": "mcp-oauth", "status": status, "server_url": server_url, "message": message}
    )
    heading = "Connected!" if status == "ok" else "Connection failed"
    detail = message or ("You can close this window." if status == "ok" else "Please try again.")
    # Escape EVERY value that reaches the page with html.escape (the sanitizer
    # CodeQL recognizes). The postMessage payload is carried in a data-attribute
    # and read back with JSON.parse rather than written into executable <script>
    # text, so user-controlled values (server_url, OAuth error_description, etc.)
    # can never break out of the script context. Attribute values are entity-
    # decoded by the HTML parser, so JSON.parse still receives the original JSON.
    safe_heading = html.escape(heading, quote=True)
    safe_detail = html.escape(detail, quote=True)
    safe_payload = html.escape(payload, quote=True)
    return f"""<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>MCP OAuth</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 2rem; text-align: center;">
    <h2>{safe_heading}</h2>
    <p>{safe_detail}</p>
    <div id="mcp-oauth-data" data-payload="{safe_payload}" style="display:none"></div>
    <script>
      try {{
        var el = document.getElementById("mcp-oauth-data");
        var d = JSON.parse(el.getAttribute("data-payload"));
        // Post only to our own origin rather than "*". In production the opener
        // (the nsflow UI) is served by this same backend, so the message is
        // delivered; if the opener is a different origin (e.g. the Vite dev
        // server), the browser drops the message and the opener's status polling
        // completes the flow instead. This prevents leaking the status/message
        // to an arbitrary opener if the callback URL is opened directly.
        if (window.opener) window.opener.postMessage(d, window.location.origin);
      }} catch (e) {{}}
      setTimeout(function () {{ window.close(); }}, 800);
    </script>
  </body>
</html>"""


@router.post("/start")
async def start_oauth_flow(body: StartFlowRequest):
    """
    Begin an OAuth flow for an MCP server.

    Returns the authorization URL for the frontend to open in a popup, or
    ``already_connected`` if a stored token exists for this server.
    """
    server_url = body.server_url.strip()
    if not server_url:
        raise HTTPException(status_code=400, detail="server_url is required.")

    if await asyncio.to_thread(FileTokenStorage.has_connection, server_url):
        return JSONResponse(content={"already_connected": True, "server_url": server_url})

    logger.info("Starting MCP OAuth flow for %s", server_url)
    try:
        flow = await mcp_oauth_manager.start_flow(
            server_url,
            scope=body.scope,
            client_id=(body.client_id or "").strip() or None,
            client_secret=(body.client_secret or "").strip() or None,
        )
    except TimeoutError as exc:
        logger.warning("MCP OAuth flow for %s timed out building the authorization URL.", server_url)
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - map any other failure to a clean 502
        # e.g. a disk write failure persisting pre-seeded client_info, or an
        # unexpected SDK error. Log the stack trace and return a consistent
        # error to the UI instead of a bare 500.
        logger.exception("MCP OAuth flow for %s failed to start.", server_url)
        raise HTTPException(
            status_code=502, detail=f"Could not start OAuth flow with the MCP server: {exc}"
        ) from exc

    if flow.status == "error" or not flow.authorization_url:
        logger.warning("MCP OAuth flow for %s could not start: %s", server_url, flow.error)
        raise HTTPException(
            status_code=502,
            detail=flow.error or "Could not start OAuth flow with the MCP server.",
        )

    return JSONResponse(
        content={
            "flow_id": flow.flow_id,
            "authorization_url": flow.authorization_url,
            "server_url": server_url,
        }
    )


@router.get("/callback")
async def oauth_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
):
    """Redirect target for the MCP authorization server. Completes the flow."""
    if not state:
        return HTMLResponse(content=_callback_html("error", "", "Missing state parameter."), status_code=400)

    # A successful callback must carry an authorization code. If the provider
    # returned neither a code nor an explicit error, treat the missing code as an
    # error so the flow resolves as failed (its future is set with an exception)
    # and the background task unblocks cleanly - rather than passing code=None
    # into the SDK token exchange, which fails or hangs.
    flow_error = error or error_description
    if not flow_error and not code:
        flow_error = "Authorization server did not return an authorization code."

    flow = mcp_oauth_manager.resolve_callback(state=state, code=code, error=flow_error)
    if flow is None:
        # Unknown state -> reject (CSRF / stale flow protection).
        logger.warning("MCP OAuth callback with unknown or expired state.")
        return HTMLResponse(
            content=_callback_html("error", "", "Unknown or expired authorization request."),
            status_code=400,
        )

    if flow_error:
        logger.warning("MCP OAuth callback for %s returned an error: %s", flow.server_url, flow_error)
        return HTMLResponse(
            content=_callback_html("error", flow.server_url, flow_error),
            status_code=400,
        )

    # Wait for the background task to finish the token exchange so we report the
    # real outcome (and the token is persisted before the UI refreshes), rather
    # than an optimistic "connected".
    await mcp_oauth_manager.wait_for_completion(flow)

    # A persisted, usable token is the source of truth for success - not
    # flow.status. wait_for_completion() can time out (returning before the
    # background task records "completed") even though the token exchange already
    # succeeded and stored a token; gating on flow.status alone would then report
    # a false failure. If the token is present, reconcile flow.status so /status
    # polling agrees.
    if await asyncio.to_thread(FileTokenStorage.has_connection, flow.server_url):
        flow.status = "completed"
        logger.info("MCP OAuth flow for %s completed successfully.", flow.server_url)
        return HTMLResponse(content=_callback_html("ok", flow.server_url))

    logger.warning("MCP OAuth flow for %s did not complete: %s", flow.server_url, flow.error)

    return HTMLResponse(
        content=_callback_html(
            "error", flow.server_url, flow.error or "Token exchange did not complete.",
        ),
        status_code=400,
    )


@router.get("/status/{flow_id}")
async def oauth_status(flow_id: str):
    """Poll the status of an in-flight OAuth flow (postMessage fallback)."""
    flow = mcp_oauth_manager.get_flow(flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Unknown flow_id.")
    return JSONResponse(
        content={"status": flow.status, "server_url": flow.server_url, "error": flow.error}
    )


@router.get("/redirect_uri")
async def get_redirect_uri():
    """
    Return the OAuth callback URL nsflow uses. Users must register this exact
    value as the redirect/callback URI of any manually-created OAuth app (for
    servers without dynamic client registration, e.g. GitHub).
    """
    return JSONResponse(content={"redirect_uri": mcp_oauth_manager.compute_redirect_uri()})


@router.get("/connections")
async def list_connections():
    """List connected MCP servers (non-secret metadata only)."""
    # Synchronous disk read offloaded to a thread so it doesn't block the loop.
    connections = await asyncio.to_thread(FileTokenStorage.list_connections)
    return JSONResponse(content={"connections": connections})


@router.delete("/connections")
async def delete_connection(server_url: str = Query(...)):
    """Disconnect an MCP server by removing its stored credentials."""
    normalized = server_url.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="server_url is required.")
    removed = await FileTokenStorage.remove(normalized)
    # Echo back the normalized value actually used for deletion, not the raw query.
    return JSONResponse(content={"removed": removed, "server_url": normalized})

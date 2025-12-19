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
One-shot chat endpoints for direct agent communication without WebSocket.
Provides simple request/response interaction with agents.
"""
import logging
from typing import Any, Dict, Optional, Union
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from neuro_san.client.agent_session_factory import AgentSessionFactory
from neuro_san.client.streaming_input_processor import StreamingInputProcessor
from neuro_san.interfaces.agent_session import AgentSession
from neuro_san.client.simple_one_shot import SimpleOneShot

from nsflow.backend.utils.tools.ns_configs_registry import NsConfigsRegistry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/oneshot")

class OneShotRequest(BaseModel):
    """Request model for one-shot chat."""
    agent_name: str
    message: str


class OneShotResponse(BaseModel):
    """Response model for one-shot chat."""
    raw_response: Optional[Dict[str, Any]] = None


@router.post("/chat")
async def oneshot_chat(request: OneShotRequest):
    """
    Send a single message to an agent and get a response.
    This endpoint provides a simple request/response interface for agent communication
    without the need for WebSocket connections. Useful for one-time queries, testing,
    or simple integrations.
    Args:
        request: OneShotRequest containing agent_name, message, and connection details
    Returns:
        OneShotResponse with the agent's response text and raw response data
    Raises:
        HTTPException: If agent session creation or communication fails
    """
     # Get config from registry
    try:
        config = NsConfigsRegistry.get_current()
    except RuntimeError as e:
        raise HTTPException(
            status_code=500,
            detail="No active NsConfigStore. Please set it via /set_config before using endpoints."
        ) from e
    
    try:
        logger.info(
            f"One-shot chat request to agent '{request.agent_name}': {request.message[:50]}..."
        )
        sos_client = SimpleOneShot(request.agent_name, config.connection_type, config.host, config.port)
        raw_response = sos_client.get_answer_for(request.message)

        # Always wrap in dict with "message" key for consistency
        if isinstance(raw_response, dict):
            response_data = {"message": raw_response}
        elif isinstance(raw_response, str):
            # Try to extract JSON from markdown code blocks first
            import json
            import re

            cleaned = raw_response.strip()

            # Check for markdown code block
            code_block_match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', cleaned)
            if code_block_match:
                cleaned = code_block_match.group(1).strip()

            # Try to parse as JSON
            try:
                parsed = json.loads(cleaned)
                response_data = {"message": parsed}
            except (json.JSONDecodeError, ValueError):
                # If parsing fails, wrap the original text
                response_data = {"message": raw_response}
        else:
            response_data = {"message": str(raw_response)}

        return OneShotResponse(raw_response=response_data)
    
    except Exception as e:
        logger.error(
            f"Error in one-shot chat with agent '{request.agent_name}': {str(e)}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to communicate with agent '{request.agent_name}': {str(e)}"
        )

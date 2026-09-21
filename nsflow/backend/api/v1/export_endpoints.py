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

from pathlib import Path

from fastapi import APIRouter
from fastapi import HTTPException
from fastapi.responses import FileResponse

from nsflow.backend.utils.agentutils.served_networks import resolve_served_network

router = APIRouter(prefix="/api/v1/export")


@router.get("/agent_network/{agent_network:path}", responses={404: {"description": "Agent network not found"}})
async def export_agent_network(agent_network: str):
    """Endpoint to download the HOCON file of the selected agent network."""
    # A greedy path, because networks are listed by their path within the registry
    # ("basic/music_nerd", "generated/foo") and a literal segment would only ever match
    # the ones sitting at the top level.
    #
    # The name reaches us from the URL, so it selects a manifest entry rather than
    # forming a path. Joining it onto the registry and checking the result stayed inside
    # also worked, but it left the name in the path expression; this way a name carrying
    # ".." matches no entry and there is nothing to check afterwards. It also means
    # export offers exactly what the server serves, which is what the sidebar lists.
    resolved = resolve_served_network(agent_network)
    if resolved is None:
        raise HTTPException(status_code=404, detail=f"Agent network '{agent_network}' not found.")
    file_path = Path(resolved)

    # A nested name would otherwise suggest a directory to the browser, which silently
    # drops it; the leaf is what the user expects to land in their downloads.
    return FileResponse(file_path, media_type="application/octet-stream", filename=f"{file_path.stem}.hocon")

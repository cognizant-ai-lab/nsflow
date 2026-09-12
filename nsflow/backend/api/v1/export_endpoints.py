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

from nsflow.backend.utils.agentutils.agent_network_utils import REGISTRY_DIR as CONFIGURED_REGISTRY_DIR
from nsflow.backend.utils.tools.notebook_generator import NotebookGenerator

router = APIRouter(prefix="/api/v1/export")

# Derived from AGENT_MANIFEST_FILE, not from the working directory.
#
# This was `Path.cwd() / "registries"`, which only resolves when the server happens to
# be started from a project root that has a registries/ beside it. neuro-san-studio
# bundles nsflow and points AGENT_MANIFEST_FILE at its own registry, so under a
# pip-installed studio the old path looked in a directory that need not exist and
# export returned 404 for networks that were plainly listed in the sidebar.
REGISTRY_DIR = Path(CONFIGURED_REGISTRY_DIR)


@router.get("/notebook/{agent_network}")
async def export_notebook(agent_network: str):
    """Endpoint to generate and return a downloadable Jupyter Notebook for an agent network."""
    notebook_generator = NotebookGenerator()
    try:
        notebook_path = notebook_generator.generate_notebook(agent_network)
        return FileResponse(notebook_path, media_type="application/octet-stream", filename=notebook_path.name)
    except HTTPException as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/agent_network/{agent_network:path}", responses={404: {"description": "Agent network not found"}})
async def export_agent_network(agent_network: str):
    """Endpoint to download the HOCON file of the selected agent network."""
    # A greedy path, because networks are listed by their path within the registry
    # ("basic/music_nerd", "generated/foo") and a literal segment would only ever match
    # the ones sitting at the top level.
    registry_root = REGISTRY_DIR.resolve()
    file_path = (registry_root / f"{agent_network}.hocon").resolve()

    # The name reaches us from the URL, so it can climb out of the registry with "..".
    # Compared after resolving, which is what catches a symlink as well as a literal.
    if not file_path.is_relative_to(registry_root) or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"Agent network '{agent_network}' not found.")

    # A nested name would otherwise suggest a directory to the browser, which silently
    # drops it; the leaf is what the user expects to land in their downloads.
    return FileResponse(file_path, media_type="application/octet-stream", filename=f"{file_path.stem}.hocon")

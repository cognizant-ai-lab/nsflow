
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

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from nsflow.backend.utils.tools.notebook_generator import NotebookGenerator

router = APIRouter(prefix="/api/v1/export")

ROOT_DIR = Path.cwd()
REGISTRY_DIR = ROOT_DIR / "registries"


@router.get("/notebook/{agent_network}")
async def export_notebook(agent_network: str):
    """Endpoint to generate and return a downloadable Jupyter Notebook for an agent network."""
    notebook_generator = NotebookGenerator()
    try:
        notebook_path = notebook_generator.generate_notebook(agent_network)
        return FileResponse(notebook_path, media_type="application/octet-stream", filename=notebook_path.name)
    except HTTPException as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get("/agent_network/{agent_network}", responses={404: {"description": "Agent network not found"}})
async def export_agent_network(agent_network: str):
    """Endpoint to download the HOCON file of the selected agent network."""
    file_path = REGISTRY_DIR / f"{agent_network}.hocon"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Agent network '{agent_network}' not found.")

    return FileResponse(file_path, media_type="application/octet-stream", filename=f"{agent_network}.hocon")

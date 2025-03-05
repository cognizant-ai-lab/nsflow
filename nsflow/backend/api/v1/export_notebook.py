import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import nbformat as nbf

router = APIRouter(prefix="/api/v1/export")

# Define the registries directory
ROOT_DIR = Path.cwd()
REGISTRY_DIR = ROOT_DIR / "registries"
NOTEBOOK_DIR = ROOT_DIR / "generated_notebooks"

# Ensure the notebook directory exists
NOTEBOOK_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO)


def generate_notebook(agent_network: str) -> Path:
    """Generates a Jupyter Notebook (.ipynb) with HOCON parsing and Pyvis visualization."""
    file_path = REGISTRY_DIR / f"{agent_network}.hocon"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Agent network '{agent_network}' not found.")

    # Create Jupyter notebook cells
    cells = []

    # Markdown Header
    cells.append(nbf.v4.new_markdown_cell(f"# Agent Network: {agent_network}"))

    # Install dependencies
    cells.append(nbf.v4.new_code_cell(
        "## Uncomment and run the following line if pyhocon and pyvis are not installed\n"
        "# !pip install pyhocon pyvis"
    ))

    # Load necessary imports
    cells.append(nbf.v4.new_code_cell(
        "from pyhocon import ConfigFactory\n"
        "from pyvis.network import Network\n"
        "import json\n"
        "from pathlib import Path\n"
        "import IPython.display\n"
    ))

    # Load HOCON file
    cells.append(nbf.v4.new_code_cell(
        f"file_path = Path('{file_path}')\n"
        "config = ConfigFactory.parse_file(str(file_path))\n"
        "IPython.display.JSON(config)"
    ))

    # Create a visualization with Pyvis
    cells.append(nbf.v4.new_code_cell(
        "net = Network(notebook=True, directed=True)\n"
        "tools = config.get('tools', [])\n"
        "\n"
        "# Add nodes\n"
        "for tool in tools:\n"
        "    agent_id = tool.get('name', 'unknown_agent')\n"
        "    net.add_node(agent_id, label=agent_id)\n"
        "\n"
        "# Add edges\n"
        "for tool in tools:\n"
        "    agent_id = tool.get('name', 'unknown_agent')\n"
        "    for child in tool.get('tools', []):\n"
        "        net.add_edge(agent_id, child)\n"
        "\n"
        "# Generate visualization\n"
        "net.show('agent_network.html')"
    ))

    # Create a new notebook
    notebook = nbf.v4.new_notebook()
    notebook.cells = cells

    # Save notebook to disk
    notebook_filename = NOTEBOOK_DIR / f"{agent_network}.ipynb"
    with open(notebook_filename, "w", encoding="utf-8") as f:
        nbf.write(notebook, f)

    logging.info("Generated notebook: %s", notebook_filename)
    return notebook_filename


@router.get("/notebook/{agent_network}")
async def export_notebook(agent_network: str):
    """Endpoint to generate and return a downloadable Jupyter Notebook for an agent network."""
    try:
        notebook_path = generate_notebook(agent_network)
        return FileResponse(notebook_path, media_type="application/octet-stream", filename=notebook_path.name)
    except HTTPException as e:
        raise e


@router.get("/agent_network/{agent_network}")
async def export_agent_network(agent_network: str):
    """Endpoint to download the HOCON file of the selected agent network."""
    file_path = REGISTRY_DIR / f"{agent_network}.hocon"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Agent network '{agent_network}' not found.")

    return FileResponse(file_path, media_type="application/octet-stream", filename=f"{agent_network}.hocon")

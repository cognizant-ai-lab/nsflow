
# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT
import logging
from pathlib import Path
import nbformat as nbf


# pylint: disable=too-few-public-methods
class NotebookGenerator:
    """
    Class responsible for generating Jupyter notebooks to interact with agent networks.
    """

    def __init__(self, root_dir: Path = Path.cwd()):
        self.root_dir = root_dir
        self.registry_dir = self.root_dir / "registries"
        self.notebook_dir = self.root_dir / "generated_notebooks"
        self.notebook_dir.mkdir(parents=True, exist_ok=True)
        logging.basicConfig(level=logging.INFO)

    def generate_notebook(self, agent_network: str) -> Path:
        """Generates a Jupyter Notebook (.ipynb) with HOCON parsing and Graphviz-based visualization."""
        file_path = self.registry_dir / f"{agent_network}.hocon"

        if not file_path.exists():
            logging.error("Agent network %s not found.", agent_network)
            raise FileNotFoundError(f"HOCON file {file_path} not found.")

        # Create Jupyter notebook cells
        cells = []

        # Markdown Header
        cells.append(nbf.v4.new_markdown_cell(f"# Agent Network: {agent_network}"))

        # Install dependencies
        cells.append(nbf.v4.new_markdown_cell(
            "## Notes: \n"
            "- Ensure that the fastapi server is running in the background\n"
            "- To interact with the agent networks, ensure that you have sufficient "
            "access to the APIs for the required provider and their LLMs\n"
            "- For a list of default providers and llms, refer to "
            "neuro-san/neuro_san/internals/run_context/langchain/default_llm_info.hocon"
        ))

        cells.append(nbf.v4.new_markdown_cell(
            "## Import Statements"
        ))

        # Load necessary imports
        cells.append(nbf.v4.new_code_cell(
            "import asyncio\n"
            "import httpx\n"
            "import json\n"
            "from typing import Dict, Any\n\n"
            "from IPython.display import JSON, display\n"
            "from pyhocon import ConfigFactory\n\n"
            "from nsflow.backend.utils.agent_network_utils import AgentNetworkUtils\n"
            "from nsflow.backend.utils.notebook_utils import NotebookUtils\n"
        ))

        # Load and read HOCON file
        cells.append(nbf.v4.new_markdown_cell(
            "## Read the Agent Network hocon"
        ))
        cells.append(nbf.v4.new_code_cell(
            "agent_utils = AgentNetworkUtils()\n"
            f"network_name = \"{agent_network}\"\n"
            "file_path = agent_utils.get_network_file_path(network_name)\n\n"
            "# Check if file_path exists\n"
            "if file_path.exists():\n"
            "    network_data = agent_utils.extract_connectivity_info(file_path)\n"
            "    front_man = agent_utils.find_front_man(file_path)\n"
            "    root_node_name = front_man.get(\"name\")\n"
            "    coded_tool_classes = agent_utils.extract_coded_tool_class(file_path)\n"
            "    config = ConfigFactory.parse_file(str(file_path))\n\n"
            "    print(\"Agent Network:\")\n"
            "    display(JSON(config))\n"
            "    print(f\"\\nroot_node_name: {root_node_name}\")\n"
            "    print(f\"\\ncoded_tool_classes: {coded_tool_classes}\")\n"
            "else:\n"
            "    print(f\"HOCON file {network_name}.hocon not found.\")"
        ))

        # Create a visualization with Pyvis
        cells.append(nbf.v4.new_markdown_cell(
            "## Display the Agent Network"
        ))
        cells.append(nbf.v4.new_code_cell(
            "utils = NotebookUtils(graph_config={\n"
            "    \"rankdir\": \"LR\",  # Change to \"TB\" for top-down\n"
            "    \"splines\": \"curved\",\n"
            "    \"fontsize\": \"10\",\n"
            "    \"nodesep\": \"0.2\",\n"
            "    \"ranksep\": \"0.6\",\n"
            "    \"node_width\": \"1\",\n"
            "    \"node_height\": \"0.4\",\n"
            "    \"render_png\": \"False\",\n"
            "    \"coded_tool_classes\": coded_tool_classes,\n"
            "})\n\n"

            "# Call with root node and network data\n"
            f"dot = utils.build_graph(root_node_name=root_node_name, network_data=network_data)\n\n"

            "# Render the network as an image (change the directory path if needed)\n"
            f"# dot.render(filename=\"{agent_network}\", directory=\"/tmp\", cleanup=True, view=False)\n\n"
            "# Display the Graph\n"
            "dot"
        ))

        # Interact with the agent network
        cells.append(nbf.v4.new_markdown_cell(
            "## Interact with the Agent Network"
        ))
        cells.append(nbf.v4.new_markdown_cell(
            "### Functions to help interaction with the Agent Network"
        ))
        cells.append(nbf.v4.new_code_cell(
            "async def call_streaming_chat(agent_name, api_url, chat_request):\n"
            "    \"\"\" Use a streaming POST request with timeout\"\"\"\n"
            "    timeout = httpx.Timeout(10.0, read=None)  # No read timeout for streaming\n"
            "    async with httpx.AsyncClient(timeout=timeout) as client:\n"
            "        async with client.stream(\"POST\", api_url, json=chat_request) as response:\n"
            "            async for line in response.aiter_lines():\n"
            "                if line.strip():\n"
            "                    parsed = json.loads(line)\n"
            "    return parsed\n\n"

            "def get_chat_context(result_dict: Dict[str, Any]) -> Dict[str, Any]:\n"
            "    \"\"\"\n"
            "    Extracts the updated chat context from the gRPC result.\n"
            "    :param result_dict: The gRPC response parsed to a dictionary.\n"
            "    :return: The extracted chat_context dictionary or empty if not found.\n"
            "    \"\"\"\n"
            "    response: Dict[str, Any] = result_dict.get(\"response\", {})\n"
            "    return response.get(\"chat_context\", {})\n\n"

            "# Initiate result dict with an empty dictionary response\n"
            "result_dict = {}"
        ))

        cells.append(nbf.v4.new_markdown_cell(
            "### Start conversation with the Agent Network\n"
            "Note: Ensure that you are connected to the right port and agent_network"
        ))

        cells.append(nbf.v4.new_code_cell(
            f"agent_network = \"{agent_network}\"\n"
            "port = \"8005\"\n"
            "api_url = f\"http://localhost:{port}/api/v1/streaming_chat/{agent_network}\"\n"
            "chat_request = {\n"
            "    \"user_message\": {\n"
            "        \"type\": 2,\n"
            "        \"text\": \"What can you help me with?\"\n"
            "    },\n"
            "    \"sly_data\": {},\n"
            "    \"chat_context\": get_chat_context(result_dict),\n"
            "    \"chat_filter\": {}\n"
            "}\n\n"

            "result_dict = await call_streaming_chat(agent_name=agent_network, \n"
            "                                        api_url=api_url, chat_request=chat_request)\n"
            "response = result_dict.get(\"response\")\n"
            "chat_context = response.get(\"chat_context\")\n"
            "display(JSON(response))"
        ))

        cells.append(nbf.v4.new_markdown_cell(
            "### Notes:\n"
            "- You may continue the conversation in two ways:\n"
            "    - by re-running the above cell with a new query text or\n"
            "    - by copying the above code to a new cell below with a new query text\n"
            "- You only need to change the `text` field in the next chat_request input dict"
        ))

        cells.append(nbf.v4.new_markdown_cell(
            "## End of Notebook"
        ))

        # Create a new notebook
        notebook = nbf.v4.new_notebook()
        notebook.cells = cells

        # Save notebook to disk
        notebook_path = self.notebook_dir / f"{agent_network}.ipynb"
        with open(notebook_path, "w", encoding="utf-8") as f:
            nbf.write(notebook, f)

        logging.info("Generated notebook: %s", notebook_path)
        return notebook_path

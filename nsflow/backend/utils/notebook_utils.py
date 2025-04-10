
# Copyright (C) 2019-2021 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# ENN-release SDK Software in commercial settings.
#
# END COPYRIGHT

from collections import deque
from graphviz import Graph


# pylint: disable=too-few-public-methods
class NotebookUtils:
    """
    Utility class for building and visualizing an agent network graph in a Jupyter Notebook.

    This class takes a structured connectivity dictionary (e.g., from a HOCON config or parsed JSON),
    and generates a Graphviz `Graph` object for display. It supports visual configuration such as
    layout direction, spacing, shapes, fonts, node colors by level, and filtering of coded tools.

    The resulting graph can be rendered inline in notebooks or exported as a .png/.dot file.

    Configuration options can be passed via the `graph_config` dictionary:
        - rankdir: Layout direction ("TB", "LR", "BT", "RL")
        - nodesep: Horizontal spacing between nodes
        - ranksep: Vertical spacing between levels
        - splines: Line styling between nodes ("polyline", "curved", etc.)
        - shape: Node shape ("box", "ellipse", etc.)
        - fontname: Font used for node labels
        - fontsize: Font size used in the graph
        - node_width: Width of nodes
        - node_height: Height of nodes
        - level_colors: List of fill colors for different levels
        - coded_tool_classes: List of prefix strings to exclude from graph (e.g., ["extract_docs", "url_provider"])
        - render_png: Whether to render the output as PNG (True) or leave as raw DOT (False)
    """
    def __init__(self, graph_config=None):
        """
        Initialize the NotebookUtils with optional visual customization.
        :param graph_config: A dictionary of graph display options (see class docstring).
        """
        default_config = {
            "rankdir": "TB",
            # Horizontal spacing between nodes
            "nodesep": "0.2",
            # Vertical spacing between nodes
            "ranksep": "0.5",
            "splines": "curved",
            "shape": "box",
            "fontname": "Helvetica",
            "fontsize": "8",
            "node_width": "0.8",
            "node_height": "0.3",
            "level_colors": [
                "#ffd966",  # Level 0: Yellow
                "#add8e6",  # Level 1: Light Blue
                "#b6d7a8",  # Level 2: Light Green
                "#f9cb9c",  # Level 3: Orange
                "#d9d2e9",  # Level 4: Lavender
                "#d5a6bd",  # Level 5+: Rose
            ],
            "coded_tool_classes": [],
            "render_png": False,
        }
        self.config = {**default_config, **(graph_config or {})}

    # pylint: disable=too-many-locals
    def build_graph(self, root_node_name, network_data):
        """
        Build a Graphviz graph from the given agent network data.
        :param root_node_name: The root or entry point node of the network (e.g. "Airline 360 Assistant").
        :param network_data: Dictionary with a `connectivity` key containing a list of dicts, each with
                             an "origin" and a "tools" list (representing downstream dependencies).
        :return: A `graphviz.Graph` object representing the agent network graph.
        """
        coded_prefixes = self.config["coded_tool_classes"]
        graph_map = {
            item["origin"]: [
                tool for tool in item.get("tools", [])
                if not any(tool.startswith(prefix) for prefix in coded_prefixes)
            ]
            for item in network_data["connectivity"]
            if not any(item["origin"].startswith(prefix) for prefix in coded_prefixes)
        }

        # Assign levels using BFS
        node_levels = {root_node_name: 0}
        queue = deque([root_node_name])
        visited = set()

        while queue:
            node = queue.popleft()
            visited.add(node)
            level = node_levels[node]
            for child in graph_map.get(node, []):
                if child not in node_levels:
                    node_levels[child] = level + 1
                if child not in visited:
                    queue.append(child)

        # Create Graphviz graph
        graph_format = "png" if self.config.get("render_png") else "dot"
        dot = Graph("Agent Network", format=graph_format)
        dot.attr(
            rankdir=self.config["rankdir"],
            splines=self.config["splines"],
            nodesep=str(self.config["nodesep"]),
            ranksep=str(self.config["ranksep"]),
            overlap="false"
        )
        dot.attr(
            "node",
            shape=self.config["shape"],
            fontname=self.config["fontname"],
            fontsize=self.config["fontsize"],
            fixedsize="false",
            width=self.config["node_width"],
            height=self.config["node_height"]
        )

        # Add nodes with level-specific colors
        for node, level in node_levels.items():
            color = self.config["level_colors"][min(level, len(self.config["level_colors"]) - 1)]
            dot.node(node, fillcolor=color, style="filled")

        # Add directed edges
        for origin, tools in graph_map.items():
            for tool in tools:
                dot.edge(origin, tool, arrowhead="normal")

        return dot

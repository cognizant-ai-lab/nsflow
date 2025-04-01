
from graphviz import Graph
from collections import deque


class NotebookUtils:
    def __init__(self, graph_config=None):
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

    def build_graph(self, root_node_name, network_data):
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

from graphviz import Graph
from collections import deque

# Use your existing `network_data` as-is

# Optional: You may define the root node
ROOT_NODE = "Airline 360 Assistant"

# Level-wise color palette
LEVEL_COLORS = [
    "#ffd966",  # Level 0: Yellow
    "#add8e6",  # Level 1: Light Blue
    "#b6d7a8",  # Level 2: Light Green
    "#f9cb9c",  # Level 3: Orange
    "#d9d2e9",  # Level 4: Lavender
    "#d5a6bd",  # Level 5+: Rose
]

# Build a lookup for connections
graph_map = {item["origin"]: item.get("tools", []) for item in network_data["connectivity"]}

# BFS to assign levels
node_levels = {ROOT_NODE: 0}
visited = set()
queue = deque([ROOT_NODE])

while queue:
    node = queue.popleft()
    visited.add(node)
    level = node_levels[node]
    for child in graph_map.get(node, []):
        if child not in node_levels:
            node_levels[child] = level + 1
        if child not in visited:
            queue.append(child)

# Create undirected graph
dot = Graph(comment="NeuroSAN Network", format="png")
dot.attr(splines="true")

# Add nodes with level-based colors
for node, level in node_levels.items():
    color = LEVEL_COLORS[min(level, len(LEVEL_COLORS) - 1)]
    dot.node(node, style="filled", fillcolor=color)

# Add edges (undirected)
for origin, tools in graph_map.items():
    for tool in tools:
        dot.edge(origin, tool)

# Render and display
dot.render("agent_network", view=False)
dot

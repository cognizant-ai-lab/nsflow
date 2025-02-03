from pathlib import Path

import argparse
import os

from pyhocon import ConfigFactory
from pyvis.network import Network

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PATH_TO_STATIC = os.path.join(ROOT_DIR, 'static')


class DiagramBuilder:
    """
    Builds a .html file containing an interactive agent network diagram
    from a .hocon file containing agent definitions and connections.
    """
    def __init__(self):
        self.args = None

    @staticmethod
    def parse_agent_definitions(agent_data):
        agent_graph = {}

        # Step 1: First pass to gather all agents and their details
        tools = agent_data.get("tools", [])
        for tool in tools:
            agent_name = tool.get("name", "unknown_agent")
            agent_info = {
                "instructions": tool.get("instructions", "No instructions"),
                "command": tool.get("command", "No command"),
                "class": tool.get("class", "No class")
            }
            agent_graph[agent_name] = {
                "info": agent_info,
                "connections": tool.get("tools", [])
            }

        return agent_graph

    @staticmethod
    def create_interactive_agent_graph(agent_graph, output_html):
        # Initialize a pyvis network graph
        net = Network(height="750px", width="100%", bgcolor="#222222",
                      font_color="white", directed=True)

        # Step 2: Keep track of which nodes have already been added
        existing_nodes = set()

        # Add all known agent nodes to the pyvis network
        for agent_name, agent_data in agent_graph.items():
            # Add node with hover information
            hover_text = (
                f"Instructions: {agent_data['info']['instructions']}<br>"
                f"Class: {agent_data['info']['class']}<br>"
                f"Command: {agent_data['info']['command']}<br>"
            )
            net.add_node(agent_name, title=hover_text, label=agent_name)
            existing_nodes.add(agent_name)

        # Step 3: Add all edges (and create missing nodes in a different color)
        for agent_name, agent_data in agent_graph.items():
            connections = agent_data["connections"]
            for connection in connections:
                if connection in agent_graph:
                    # Normal edge, since this connection/agent exists
                    net.add_edge(agent_name, connection)
                else:
                    # This tool/agent does not exist in agent_graph
                    print(f"Warning: {connection} referenced by {agent_name} does not exist.")

                    # Create a missing node if it hasn't been added yet
                    if connection not in existing_nodes:
                        net.add_node(connection, label=connection, color="green")
                        existing_nodes.add(connection)

                    # Add edge from agent_name to the newly created/missing node
                    net.add_edge(agent_name, connection)

        # Disable hierarchical layout and physics for free node movement
        net.set_options("""
         {
           "physics": {
             "enabled": false
           },
           "interaction": {
             "zoomView": false,
             "dragView": true
           },
           "manipulation": {
             "enabled": false
           },
           "autoResize": true
         }
         """)

        # Save the interactive network to an HTML file
        net.save_graph(output_html)

        # Inject CSS to center the graph when used in an iframe
        with open(output_html, 'r') as file:
            html_content = file.read()

        # Center the graph by adding custom styles
        centered_style = """
            <style>
              #mynetwork {
                  width: 100%;
                  background-color: #222222;
                  border: 1px solid lightgray;
                  position: relative;
              }

              body, html {
                  margin: 0;
                  padding: 0;
                  overflow: hidden;  /* Prevent scrollbars in the iframe */
                  width: 100%;
                  height: 100%;
              }

              .vis-network {
                  display: flex;
                  justify-content: center;  /* Center horizontally */
                  align-items: center;      /* Center vertically */
              }
            </style>
        """
        custom_script = """
    <script type="text/javascript">
        window.addEventListener('message', function(event) {
            if (event.data && event.data.agentName) {
                const agentName = event.data.agentName;

                // Directly compare the lowercase agent name with the node ID
                const matchingNode = nodes.get().find(node => node.id.toLowerCase() === agentName);

                if (matchingNode) {
                    // Reset the color of all nodes to default
                    nodes.forEach(function(node) {
                        nodes.update({ id: node.id, color: '#97c2fc' });
                    });

                    // Highlight the matched node
                    nodes.update({ id: matchingNode.id, color: '#ff6347' });
                }
            }
        });
    </script>
        """

        # Inject the custom style to center the graph in the iframe
        html_content = html_content.replace("</head>", f"{centered_style}</head>")
        html_content = html_content.replace("</body>", f"{custom_script}</body>")

        # Write the modified content back to the HTML file
        with open(output_html, 'w') as file:
            file.write(html_content)

    def create_agent_diagram_from_hocon(self, hocon_file, output_html):
        # Load the HOCON configuration
        agent_data = ConfigFactory.parse_file(hocon_file)

        # Parse the agents and tools from the HOCON data
        agent_graph = self.parse_agent_definitions(agent_data)

        # Create an interactive agent graph and save it as a web page
        if output_html is None:
            # Get the file name without extension
            file_name = Path(hocon_file).stem
            # Generate the output file name
            output_html = str(PATH_TO_STATIC / Path(f"{file_name}.html"))
            print(f"Output file not specified. Saving to {output_html}")
        self.create_interactive_agent_graph(agent_graph, output_html)

    def parse_args(self):
        """
        Parse command line arguments into member variables
        """
        arg_parser = argparse.ArgumentParser(
            description="Builds a .html file containing an interactive agent network diagram "
                        "from a .hocon file containing agent definitions and connections."
        )
        arg_parser.add_argument("-i", "--input_file", type=str, default=None, required=True,
                                help="Path to the input .hocon file containing the agent network definition")
        arg_parser.add_argument("-o", "--output_file", type=str, default=None, required=False,
                                help="Path to the file to generate: an .html file that will contain the interactive"
                                     " agent network diagram. If not specified, the output file will be saved"
                                     "in the 'static' folder with the same name as the input file and .html extension.")
        self.args = arg_parser.parse_args()

    def main(self):
        self.parse_args()
        self.create_agent_diagram_from_hocon(hocon_file=self.args.input_file,
                                             output_html=self.args.output_file)


if __name__ == '__main__':
    DiagramBuilder().main()

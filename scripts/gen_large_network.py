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
Generate a large agent-network HOCON for stress-testing the nsflow graph UI (issue #55).

Builds a balanced tree of ~N agents across a few levels with terse instructions, writes
the network HOCON under registries/generated/, and appends it to registries/manifest.hocon
so the neuro-san server serves it.

Usage:
    python scripts/gen_large_network.py            # ~10000 agents
    python scripts/gen_large_network.py --agents 3000 --name big_net
"""

import argparse
import os

# branching factor per non-leaf level; depth is chosen so the tree reaches --agents.
BRANCHING = 10
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build_tree(target):
    """Return a list of (name, [child_names]) in BFS order until >= target nodes."""
    nodes = []  # (name, children)
    children_of = {}
    root = "agent_0"
    order = [root]
    children_of[root] = []
    count = 1
    frontier = [root]
    next_id = 1
    # Grow level by level until we have at least `target` nodes.
    while count < target and frontier:
        new_frontier = []
        for parent in frontier:
            if count >= target:
                break
            for _ in range(BRANCHING):
                if count >= target:
                    break
                name = f"agent_{next_id}"
                next_id += 1
                count += 1
                children_of[parent].append(name)
                children_of[name] = []
                order.append(name)
                new_frontier.append(name)
        frontier = new_frontier
    for name in order:
        nodes.append((name, children_of[name]))
    return nodes


def esc(text):
    """Escape double quotes for a HOCON double-quoted string."""
    return text.replace('"', '\\"')


def agent_block(name, children, is_front):
    """Render one agent's HOCON tools[] entry. Terse 2-5 word instructions."""
    tools = ""
    if children:
        tools = '            "tools": [' + ", ".join(f'"{c}"' for c in children) + "],\n"
    if is_front:
        # Front-man: no parameters on function (that is what marks it the front-man).
        func = '            "function": {"description": "Root. Routes every inquiry."},\n'
        instr = '            "instructions": "Route to down-chain agents.",\n'
    else:
        func = (
            '            "function": {\n'
            '                "description": "Handles part of the inquiry.",\n'
            '                "parameters": {\n'
            '                    "type": "object",\n'
            '                    "properties": {"inquiry": {"type": "string", "description": "The inquiry"}},\n'
            '                    "required": ["inquiry"]\n'
            "                }\n"
            "            },\n"
        )
        instr = f'            "instructions": "Answer briefly. Delegate if needed. ({esc(name)})",\n'
    return "        {\n" f'            "name": "{name}",\n' f"{func}" f"{instr}" f"{tools}" "        },\n"


def render(nodes):
    """Render the full network HOCON."""
    out = ["{\n"]
    out.append('    "llm_config": {"model_name": "gpt-4o"},\n')
    out.append('    "tools": [\n')
    for i, (name, children) in enumerate(nodes):
        out.append(agent_block(name, children, is_front=(i == 0)))
    out.append("    ]\n}\n")
    return "".join(out)


def main():
    parser = argparse.ArgumentParser(description="Generate a large agent-network HOCON.")
    parser.add_argument("--agents", type=int, default=10000, help="Approx number of agents.")
    parser.add_argument("--name", default="large_network", help="Network (file) name.")
    args = parser.parse_args()

    nodes = build_tree(args.agents)

    gen_dir = os.path.join(REPO_ROOT, "registries", "generated")
    os.makedirs(gen_dir, exist_ok=True)
    hocon_path = os.path.join(gen_dir, f"{args.name}.hocon")
    with open(hocon_path, "w", encoding="utf-8") as handle:
        handle.write(render(nodes))

    # Register in the main manifest so the server serves it.
    manifest = os.path.join(REPO_ROOT, "registries", "manifest.hocon")
    entry = f'    "generated/{args.name}.hocon": true,'
    with open(manifest, "r", encoding="utf-8") as handle:
        content = handle.read()
    if entry.strip() not in content:
        # Insert the entry right after the first "{" of the manifest object.
        idx = content.index("{") + 1
        content = content[:idx] + "\n" + entry + content[idx:]
        with open(manifest, "w", encoding="utf-8") as handle:
            handle.write(content)

    print(f"Wrote {len(nodes)} agents to {hocon_path}")
    print(f"Served as network: generated/{args.name}")


if __name__ == "__main__":
    main()

# Copyright (C) 2023-2025 Cognizant Digital Business, Evolutionary AI.
# All Rights Reserved.
# Issued under the Academic Public License.
#
# You can be released from the terms, and requirements of the Academic Public
# License by purchasing a commercial license.
# Purchase of a commercial license is mandatory for any use of the
# nsflow SDK Software in commercial settings.
#
# END COPYRIGHT

from __future__ import annotations
import os, json, copy, logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from werkzeug.utils import secure_filename

from nsflow.backend.utils.agentutils.agent_network_utils import ROOT_DIR

log = logging.getLogger("OperationStore")
if not log.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    log.addHandler(h)
    log.setLevel(logging.INFO)

class OperationStore:
    """
    Simple, linear undo/redo via an operation log with precomputed inverses.
    - No graphs, no JSON Patch required.
    - Works directly with SimpleStateManager's public methods.

    Files:
      root/
        base_state.json      # snapshot when the store is created
        history.jsonl        # append-only: {"ts", "forward", "inverse"}
        redo_stack.jsonl     # stack used only after undo
    """

    def __init__(self, design_id: str, manager: Any):
        """
        manager: SimpleStateManager instance (must provide methods this class calls)
        design_id: unique identifier for this editing session
        """
        # Create draft state directory with path sanitization
        draft_root = os.path.join(ROOT_DIR, "draft_states")
        os.makedirs(draft_root, exist_ok=True)
        
        # Sanitize design_id for filesystem safety
        safe_design_id = secure_filename(design_id)
        self.root = os.path.join(draft_root, safe_design_id)
        
        self.design_id = design_id
        self.manager = manager
        os.makedirs(self.root, exist_ok=True)
        
        self.base_file = os.path.join(self.root, "base_state.json")
        self.hist_file = os.path.join(self.root, "history.jsonl")
        self.redo_file = os.path.join(self.root, "redo_stack.jsonl")
        self.meta_file = os.path.join(self.root, "meta.json")

        # Initialize files if they don't exist
        if not os.path.exists(self.base_file):
            self._write_json(self.base_file, copy.deepcopy(self.manager.get_state()))
        if not os.path.exists(self.hist_file):
            open(self.hist_file, "w").close()
        if not os.path.exists(self.redo_file):
            open(self.redo_file, "w").close()
        if not os.path.exists(self.meta_file):
            self._write_json(self.meta_file, {
                "design_id": design_id,
                "created_at": self._now(),
                "last_saved": self._now(),
                "version": "1.0"
            })

    # ----------------- Public API -----------------

    def apply(self, forward: Dict[str, Any]) -> None:
        """
        Apply a forward operation *and* record its inverse.
        forward = {"op": "<name>", "args": {...}}
        Supported ops (mapped to manager):
          Network-level:
          - set_network_name(name)
          - update_network_state(network_name, state_dict, source)
          - update_top_level_config(updates)
          
          Agent-level:
          - add_agent(name, parent=None, agent_data=None)
          - create_agent_with_parent(name, parent, agent_data=None)  # Atomic: add_agent + add_edge
          - add_toolbox_agent(name, toolbox, parent=None)  # Add toolbox agent
          - create_toolbox_agent_with_parent(name, toolbox, parent)  # Atomic: add_toolbox_agent + add_edge
          - delete_agent(name)
          - update_agent(name, updates)
          - duplicate_agent(agent_name, new_name)
          
          Edge-level:
          - add_edge(src, dst)
          - remove_edge(src, dst)
        """
        inv = self._execute_and_make_inverse(forward["op"], forward.get("args", {}))
        self._append_jsonl(self.hist_file, {"ts": self._now(), "forward": forward, "inverse": inv})
        # A new edit invalidates redo (classic editor semantics)
        open(self.redo_file, "w").close()
        log.info("apply: %s  inverse: %s", forward["op"], inv["op"])

    def undo(self) -> bool:
        """
        Pop last history entry, apply its inverse, push that entry to redo stack.
        """
        history = self._read_jsonl(self.hist_file)
        if not history:
            log.info("undo: empty history")
            return False
        last = history[-1]
        inv = last["inverse"]
        self._execute(inv["op"], inv.get("args", {}))
        # truncate history
        self._write_jsonl(self.hist_file, history[:-1])
        # push to redo
        self._append_jsonl(self.redo_file, last)
        log.info("undo: applied %s", inv["op"])
        return True

    def redo(self) -> bool:
        """
        Pop last from redo stack, apply its forward op, append back to history.
        """
        redo_stack = self._read_jsonl(self.redo_file)
        if not redo_stack:
            log.info("redo: empty")
            return False
        last = redo_stack[-1]
        fwd = last["forward"]
        self._execute(fwd["op"], fwd.get("args", {}))
        # truncate redo
        self._write_jsonl(self.redo_file, redo_stack[:-1])
        # append back to history
        self._append_jsonl(self.hist_file, last)
        log.info("redo: re-applied %s", fwd["op"])
        return True

    # ----------------- Inverse construction -----------------

    def _execute_and_make_inverse(self, op: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the forward op on manager and construct the exact inverse op.
        We read 'before' from manager.get_state() when needed.
        """
        # We always read a deep copy of the state before applying mutating ops
        before = copy.deepcopy(self.manager.get_state())

        # Network-level operations
        if op == "set_network_name":
            new_name = args["name"]
            old_name = before.get("network_name", "")
            ok = self.manager.set_network_name(new_name)
            if not ok:
                raise RuntimeError("set_network_name failed")
            return {"op": "set_network_name", "args": {"name": old_name}}

        if op == "update_network_state":
            network_name = args["network_name"]
            state_dict = args["state_dict"]
            source = args.get("source", "ops_store")
            # Save current state as inverse
            current_state = copy.deepcopy(before)
            ok = self.manager.update_network_state(network_name, state_dict, source)
            if not ok:
                raise RuntimeError("update_network_state failed")
            return {"op": "restore_full_state", "args": {"state": current_state}}

        if op == "update_top_level_config":
            updates = args["updates"]
            # Save current top-level config as inverse
            current_top_level = copy.deepcopy(before.get("top_level", {}))
            ok = self.manager.update_top_level_config(updates)
            if not ok:
                raise RuntimeError("update_top_level_config failed")
            
            # Create inverse: restore the complete previous top-level config
            return {"op": "restore_top_level_config", "args": {"config": current_top_level}}

        # Agent-level operations
        if op == "add_agent":
            # manager.add_agent(agent_name, parent_name=None, agent_data=None) -> bool
            name = args["name"]
            parent = args.get("parent")
            agent_data = args.get("agent_data")
            ok = self.manager.add_agent(name, parent, agent_data)  # :contentReference[oaicite:3]{index=3}
            if not ok:
                raise RuntimeError("add_agent failed")
            # inverse: delete_agent(name)
            return {"op": "delete_agent", "args": {"name": name}}

        if op == "create_agent_with_parent":
            # Atomic operation: add_agent + add_edge
            name = args["name"]
            parent = args["parent"]
            agent_data = args.get("agent_data")
            
            # First add the agent without parent
            ok = self.manager.add_agent(name, None, agent_data)
            if not ok:
                raise RuntimeError("create_agent_with_parent: add_agent failed")
            
            # Then add the edge to parent
            ok = self.manager.add_edge(parent, name)
            if not ok:
                # Rollback: remove the agent we just added
                self.manager.delete_agent(name)
                raise RuntimeError("create_agent_with_parent: add_edge failed")
            
            # inverse: delete_agent (which will also remove the edge)
            return {"op": "delete_agent", "args": {"name": name}}

        if op == "add_toolbox_agent":
            # manager.add_agent(agent_name, parent_name=None, agent_data=None) -> bool
            name = args["name"]
            toolbox = args["toolbox"]
            parent = args.get("parent")
            
            # Create agent data for toolbox agent
            agent_data = {
                "name": name,
                "toolbox": toolbox,
                "agent_type": "toolbox",
                "instructions": f"Toolbox agent using {toolbox}"
            }
            
            ok = self.manager.add_agent(name, parent, agent_data)
            if not ok:
                raise RuntimeError("add_toolbox_agent failed")
            # inverse: delete_agent(name)
            return {"op": "delete_agent", "args": {"name": name}}

        if op == "create_toolbox_agent_with_parent":
            # Atomic operation: add_toolbox_agent + add_edge
            name = args["name"]
            toolbox = args["toolbox"]
            parent = args["parent"]
            
            # Create agent data for toolbox agent
            agent_data = {
                "name": name,
                "toolbox": toolbox,
                "agent_type": "toolbox",
                "instructions": f"Toolbox agent using {toolbox}"
            }
            
            # First add the agent without parent
            ok = self.manager.add_agent(name, None, agent_data)
            if not ok:
                raise RuntimeError("create_toolbox_agent_with_parent: add_agent failed")
            
            # Then add the edge to parent
            ok = self.manager.add_edge(parent, name)
            if not ok:
                # Rollback: remove the agent we just added
                self.manager.delete_agent(name)
                raise RuntimeError("create_toolbox_agent_with_parent: add_edge failed")
            
            # inverse: delete_agent (which will also remove the edge)
            return {"op": "delete_agent", "args": {"name": name}}

        if op == "delete_agent":
            name = args["name"]
            # capture full agent & relationships BEFORE deletion
            if name not in before["agents"]:
                raise ValueError(f"Agent '{name}' not found")
            deleted_agent = copy.deepcopy(before["agents"][name])
            # all children that had this agent as parent (by convention: stored in child["_parent"])
            children = [a for a, d in before["agents"].items() if d.get("_parent") == name]
            parent = deleted_agent.get("_parent")

            ok = self.manager.delete_agent(name)  # :contentReference[oaicite:4]{index=4}
            if not ok:
                raise RuntimeError("delete_agent failed")

            # inverse: restore the agent and reattach to parent and children
            return {
                "op": "restore_agent",
                "args": {
                    "agent_def": deleted_agent,
                    "parent": parent,
                    "children": children
                }
            }

        if op == "update_agent":
            name = args["name"]
            updates = args["updates"]
            if name not in before["agents"]:
                raise ValueError(f"Agent '{name}' not found")
            prev = copy.deepcopy(before["agents"][name])

            ok = self.manager.update_agent(name, updates)  # :contentReference[oaicite:5]{index=5}
            if not ok:
                raise RuntimeError("update_agent failed")

            # inverse restores previous snapshot (only fields you changed is fine; snapshot is simplest)
            return {"op": "update_agent", "args": {"name": name, "updates": prev}}

        if op == "add_edge":
            src = args["src"]; dst = args["dst"]
            ok = self.manager.add_edge(src, dst)  # sets parent; prevents cycles internally :contentReference[oaicite:6]{index=6}
            if not ok:
                raise RuntimeError("add_edge failed")
            return {"op": "remove_edge", "args": {"src": src, "dst": dst}}

        if op == "remove_edge":
            src = args["src"]; dst = args["dst"]
            ok = self.manager.remove_edge(src, dst)  # clears parent if needed :contentReference[oaicite:7]{index=7}
            if not ok:
                raise RuntimeError("remove_edge failed")
            return {"op": "add_edge", "args": {"src": src, "dst": dst}}

        if op == "duplicate_agent":
            # optional, if UI exposes duplicate
            orig = args["agent_name"]; new = args["new_name"]
            ok = self.manager.duplicate_agent(orig, new)  # :contentReference[oaicite:8]{index=8}
            if not ok:
                raise RuntimeError("duplicate_agent failed")
            return {"op": "delete_agent", "args": {"name": new}}

        if op == "restore_agent":
            # not expected as a forward from UI; used only as an inverse for delete_agent
            # but allow calling it directly too
            self._execute("restore_agent", args)
            # inverse of restore is delete
            return {"op": "delete_agent", "args": {"name": args["agent_def"]["name"]}}

        if op == "restore_full_state":
            # Restore complete state (used as inverse for update_network_state)
            state = args["state"]
            self.manager.current_state = copy.deepcopy(state)
            return {"op": "restore_full_state", "args": {"state": copy.deepcopy(self.manager.get_state())}}

        if op == "restore_top_level_config":
            # Restore complete top-level config (used as inverse for update_top_level_config)
            config = args["config"]
            current_top_level = copy.deepcopy(before.get("top_level", {}))
            ok = self.manager.restore_top_level_config(config)
            if not ok:
                raise RuntimeError("restore_top_level_config failed")
            return {"op": "restore_top_level_config", "args": {"config": current_top_level}}

        raise NotImplementedError(f"Unknown op: {op}")

    def _execute(self, op: str, args: Dict[str, Any]) -> None:
        """
        Execute an operation without recording history (used for undo/redo).
        """
        # Network-level operations
        if op == "set_network_name":
            ok = self.manager.set_network_name(args["name"])
            if not ok: raise RuntimeError("set_network_name failed (undo/redo)")
            return

        if op == "update_network_state":
            ok = self.manager.update_network_state(args["network_name"], args["state_dict"], args.get("source", "ops_store"))
            if not ok: raise RuntimeError("update_network_state failed (undo/redo)")
            return

        if op == "update_top_level_config":
            ok = self.manager.update_top_level_config(args["updates"])
            if not ok: raise RuntimeError("update_top_level_config failed (undo/redo)")
            return

        if op == "restore_full_state":
            self.manager.current_state = copy.deepcopy(args["state"])
            return

        if op == "restore_top_level_config":
            ok = self.manager.restore_top_level_config(args["config"])
            if not ok: raise RuntimeError("restore_top_level_config failed (undo/redo)")
            return

        # Agent-level operations
        if op == "add_agent":
            ok = self.manager.add_agent(args["name"], args.get("parent"), args.get("agent_data"))
            if not ok: raise RuntimeError("add_agent failed (undo/redo)")
            return

        if op == "add_toolbox_agent":
            name = args["name"]
            toolbox = args["toolbox"]
            parent = args.get("parent")
            
            # Create agent data for toolbox agent
            agent_data = {
                "name": name,
                "toolbox": toolbox,
                "agent_type": "toolbox",
                "instructions": f"Toolbox agent using {toolbox}"
            }
            
            ok = self.manager.add_agent(name, parent, agent_data)
            if not ok: raise RuntimeError("add_toolbox_agent failed (undo/redo)")
            return

        if op == "create_agent_with_parent":
            # Atomic operation: add_agent + add_edge
            name = args["name"]
            parent = args["parent"]
            agent_data = args.get("agent_data")
            
            # First add the agent without parent
            ok = self.manager.add_agent(name, None, agent_data)
            if not ok: raise RuntimeError("create_agent_with_parent: add_agent failed (undo/redo)")
            
            # Then add the edge to parent
            ok = self.manager.add_edge(parent, name)
            if not ok:
                # Rollback: remove the agent we just added
                self.manager.delete_agent(name)
                raise RuntimeError("create_agent_with_parent: add_edge failed (undo/redo)")
            return

        if op == "create_toolbox_agent_with_parent":
            # Atomic operation: add_toolbox_agent + add_edge
            name = args["name"]
            toolbox = args["toolbox"]
            parent = args["parent"]
            
            # Create agent data for toolbox agent
            agent_data = {
                "name": name,
                "toolbox": toolbox,
                "agent_type": "toolbox",
                "instructions": f"Toolbox agent using {toolbox}"
            }
            
            # First add the agent without parent
            ok = self.manager.add_agent(name, None, agent_data)
            if not ok: raise RuntimeError("create_toolbox_agent_with_parent: add_agent failed (undo/redo)")
            
            # Then add the edge to parent
            ok = self.manager.add_edge(parent, name)
            if not ok:
                # Rollback: remove the agent we just added
                self.manager.delete_agent(name)
                raise RuntimeError("create_toolbox_agent_with_parent: add_edge failed (undo/redo)")
            return

        if op == "delete_agent":
            ok = self.manager.delete_agent(args["name"])
            if not ok: raise RuntimeError("delete_agent failed (undo/redo)")
            return

        if op == "update_agent":
            ok = self.manager.update_agent(args["name"], args["updates"])
            if not ok: raise RuntimeError("update_agent failed (undo/redo)")
            return

        if op == "add_edge":
            ok = self.manager.add_edge(args["src"], args["dst"])
            if not ok: raise RuntimeError("add_edge failed (undo/redo)")
            return

        if op == "remove_edge":
            ok = self.manager.remove_edge(args["src"], args["dst"])
            if not ok: raise RuntimeError("remove_edge failed (undo/redo)")
            return

        if op == "restore_agent":
            # Recreate the agent exactly, then reattach to parent and children.
            agent_def = copy.deepcopy(args["agent_def"])
            parent = args.get("parent")
            children = list(args.get("children", []))

            # Insert the agent first with exact definition
            name = agent_def["name"]
            # Use add_agent(..., agent_data=agent_def) to preserve fields (instructions, tools, class, _parent, etc.)
            ok = self.manager.add_agent(name, parent, agent_data=agent_def)
            if not ok: raise RuntimeError("restore_agent: add_agent failed")

            # ensure parent linkage (add_agent handled it, but idempotent)
            if parent:
                self.manager.add_edge(parent, name)

            # Reattach children (so their _parent and parent's tools are restored)
            for child in children:
                # child should exist in current state if deletion only orphaned them
                self.manager.add_edge(name, child)
            return

        raise NotImplementedError(f"Unknown op: {op}")

    # ----------------- Draft State Management -----------------

    def save_draft(self) -> bool:
        """Save current state and update metadata"""
        try:
            # Update metadata
            meta = {
                "design_id": self.design_id,
                "created_at": self._read_json(self.meta_file).get("created_at", self._now()),
                "last_saved": self._now(),
                "version": "1.0",
                "network_name": self.manager.get_state().get("network_name", ""),
                "agent_count": len(self.manager.get_state().get("agents", {})),
                "operation_count": len(self._read_jsonl(self.hist_file))
            }
            self._write_json(self.meta_file, meta)
            
            # Update base state to current state
            self._write_json(self.base_file, copy.deepcopy(self.manager.get_state()))
            
            log.info(f"Draft saved for design_id: {self.design_id}")
            return True
        except Exception as e:
            log.error(f"Failed to save draft: {e}")
            return False

    def get_draft_info(self) -> Dict[str, Any]:
        """Get draft metadata and statistics"""
        try:
            meta = self._read_json(self.meta_file)
            history = self._read_jsonl(self.hist_file)
            redo_stack = self._read_jsonl(self.redo_file)
            
            return {
                "design_id": self.design_id,
                "network_name": meta.get("network_name", ""),
                "created_at": meta.get("created_at"),
                "last_saved": meta.get("last_saved"),
                "agent_count": meta.get("agent_count", 0),
                "operation_count": len(history),
                "can_undo": len(history) > 0,
                "can_redo": len(redo_stack) > 0,
                "draft_path": self.root
            }
        except Exception as e:
            log.error(f"Failed to get draft info: {e}")
            return {}

    @staticmethod
    def list_all_drafts() -> List[Dict[str, Any]]:
        """List all draft states in the draft_states directory"""
        draft_root = os.path.join(ROOT_DIR, "draft_states")
        if not os.path.exists(draft_root):
            return []
        
        drafts = []
        try:
            for design_dir in os.listdir(draft_root):
                design_path = os.path.join(draft_root, design_dir)
                if os.path.isdir(design_path):
                    meta_file = os.path.join(design_path, "meta.json")
                    if os.path.exists(meta_file):
                        try:
                            meta = OperationStore._read_json(meta_file)
                            history_file = os.path.join(design_path, "history.jsonl")
                            history = OperationStore._read_jsonl(history_file)
                            redo_file = os.path.join(design_path, "redo_stack.jsonl")
                            redo_stack = OperationStore._read_jsonl(redo_file)
                            
                            drafts.append({
                                "design_id": meta.get("design_id", design_dir),
                                "network_name": meta.get("network_name", ""),
                                "created_at": meta.get("created_at"),
                                "last_saved": meta.get("last_saved"),
                                "agent_count": meta.get("agent_count", 0),
                                "operation_count": len(history),
                                "can_undo": len(history) > 0,
                                "can_redo": len(redo_stack) > 0,
                                "source": "draft",
                                "draft_path": design_path
                            })
                        except Exception as e:
                            log.warning(f"Failed to read draft metadata from {design_path}: {e}")
        except Exception as e:
            log.error(f"Failed to list drafts: {e}")
        
        return drafts

    @staticmethod
    def load_draft(design_id: str, manager: Any) -> Optional['OperationStore']:
        """Load an existing draft and return the OperationStore"""
        try:
            store = OperationStore(design_id, manager)
            # Load the base state into the manager
            base_state = store._read_json(store.base_file)
            manager.current_state = copy.deepcopy(base_state)
            
            # Replay all operations to get to current state
            history = store._read_jsonl(store.hist_file)
            for entry in history:
                forward = entry["forward"]
                store._execute(forward["op"], forward.get("args", {}))
            
            log.info(f"Loaded draft for design_id: {design_id}")
            return store
        except Exception as e:
            log.error(f"Failed to load draft {design_id}: {e}")
            return None

    # ----------------- File helpers -----------------

    @staticmethod
    def _now() -> str:
        return datetime.now().isoformat()

    @staticmethod
    def _append_jsonl(path: str, obj: Dict[str, Any]) -> None:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    @staticmethod
    def _write_jsonl(path: str, rows: List[Dict[str, Any]]) -> None:
        with open(path, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    @staticmethod
    def _read_jsonl(path: str) -> List[Dict[str, Any]]:
        if not os.path.exists(path): return []
        out = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    out.append(json.loads(line))
        return out

    @staticmethod
    def _write_json(path: str, obj: Any) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=2, ensure_ascii=False)

    @staticmethod
    def _read_json(path: str) -> Dict[str, Any]:
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

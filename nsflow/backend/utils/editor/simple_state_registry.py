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
Simplified registry that uses instance-based approach instead of class-level variables.
No locks, no complex patterns - just simple state management.
"""

import json
import logging
import os
import uuid
from typing import Any, Dict, List, Optional, Tuple

from werkzeug.utils import secure_filename

from nsflow.backend.utils.agentutils.agent_network_utils import REGISTRY_DIR as EXPORT_ROOT_DIR
from nsflow.backend.utils.editor.hocon_reader import IndependentHoconReader
from nsflow.backend.utils.editor.ops_store import OperationStore
from nsflow.backend.utils.editor.simple_state_manager import SimpleStateManager

logger = logging.getLogger(__name__)


class SimpleStateRegistry:
    """
    Simplified registry for state management.
    Uses instance-based approach to avoid class-level conflicts.
    """

    NSFLOW_PLUGIN_MANUAL_EDITOR = os.getenv("NSFLOW_PLUGIN_MANUAL_EDITOR", False)

    def __init__(self, edited_state_dir: Optional[str] = None):
        self.managers: Dict[str, SimpleStateManager] = {}
        self.operation_stores: Dict[str, OperationStore] = {}
        self.network_to_design_ids: Dict[str, List[str]] = {}
        self.design_id_to_info: Dict[str, Dict[str, Any]] = {}

        # Initialize HOCON reader
        self.hocon_reader = IndependentHoconReader()

        # Note: edited_state_dir is deprecated in favor of ops_store draft persistence
        # Keeping for backward compatibility but not actively used
        if edited_state_dir:
            self.edited_state_dir = edited_state_dir
        else:
            self.edited_state_dir = os.path.join(self.hocon_reader.registry_dir, "edited_states")

        # Auto-load existing draft states on startup
        self._auto_load_draft_states()

    def _auto_load_draft_states(self):
        """Auto-load existing draft states on startup to preserve operation history"""
        try:
            draft_states = OperationStore.list_all_drafts()
            loaded_count = 0

            for draft in draft_states:
                design_id = draft["design_id"]
                try:
                    # Create a new manager
                    manager = SimpleStateManager(design_id)

                    # Load the draft using OperationStore
                    operation_store = OperationStore.load_draft(design_id, manager)
                    if operation_store:
                        # Register the manager and operation store
                        self.managers[design_id] = manager
                        self.operation_stores[design_id] = operation_store

                        # Get network name from the ACTUAL restored state, not metadata
                        state = manager.get_state()
                        network_name = state.get("network_name", "")

                        # If network name is empty, try to get it from metadata as fallback
                        if not network_name:
                            network_name = draft.get("network_name", f"draft_{design_id[:8]}")
                            # Update the manager's state with the fallback name
                            manager.set_network_name(network_name)

                        # Update mappings
                        if network_name not in self.network_to_design_ids:
                            self.network_to_design_ids[network_name] = []
                        self.network_to_design_ids[network_name].append(design_id)

                        # Get additional info from the restored state
                        meta = state.get("meta", {})

                        self.design_id_to_info[design_id] = {
                            "network_name": network_name,
                            "source": "draft_auto_loaded",
                            "created_at": meta.get("created_at", draft.get("created_at")),
                            "loaded_at": meta.get("updated_at", draft.get("last_saved")),
                            "original_network_name": state.get("original_network_name"),
                        }

                        loaded_count += 1

                except Exception as e:
                    logger.warning(f"Failed to auto-load draft {design_id}: {e}")

            if loaded_count > 0:
                logger.info(f"Auto-loaded {loaded_count} draft states with operation history")

        except Exception as e:
            logger.error(f"Failed to auto-load draft states: {e}")

    def create_new_network(
        self, network_name: str = "", template_type: str = "single_agent", **template_kwargs
    ) -> Tuple[str, SimpleStateManager]:
        """Create a new network from scratch or template"""
        design_id = str(uuid.uuid4())

        # Create manager
        manager = SimpleStateManager(design_id)

        # Set network name with proper default
        if not network_name or network_name.strip() == "":
            network_name = f"network_{design_id[:8]}"
        else:
            # Ensure unique name by appending design_id
            if not network_name.endswith(f"_{design_id[:8]}"):
                network_name = f"{network_name}_{design_id[:8]}"

        # Set the network name in the manager
        manager.set_network_name(network_name)

        # Create from template
        manager.create_from_template(template_type, **template_kwargs)

        # Register manager
        self.managers[design_id] = manager

        # Create operation store AFTER all initial setup is complete
        operation_store = OperationStore(design_id, manager)
        self.operation_stores[design_id] = operation_store

        # Update mappings
        if network_name not in self.network_to_design_ids:
            self.network_to_design_ids[network_name] = []
        self.network_to_design_ids[network_name].append(design_id)

        self.design_id_to_info[design_id] = {
            "network_name": network_name,
            "source": "new",
            "created_at": manager.current_state["meta"]["created_at"],
            "template_type": template_type,
        }

        return design_id, manager

    def load_from_registry(self, network_name: str) -> Tuple[str, SimpleStateManager]:
        """Load a network from the registry (HOCON file)"""
        try:
            # Get HOCON configuration
            hocon_config = self.hocon_reader.read_network_config(network_name)

            # Create new design session
            design_id = str(uuid.uuid4())
            manager = SimpleStateManager(design_id)

            # Load from HOCON
            manager.load_from_hocon_structure(hocon_config, network_name)

            # Store original network name in the state for later use
            manager.current_state["original_network_name"] = network_name

            # Update mappings
            session_network_name = f"{network_name}_{design_id[:8]}"
            manager.set_network_name(session_network_name)

            # Register manager
            self.managers[design_id] = manager

            # Create operation store AFTER all initial setup is complete
            operation_store = OperationStore(design_id, manager)
            self.operation_stores[design_id] = operation_store

            if session_network_name not in self.network_to_design_ids:
                self.network_to_design_ids[session_network_name] = []
            self.network_to_design_ids[session_network_name].append(design_id)

            self.design_id_to_info[design_id] = {
                "network_name": session_network_name,
                "original_network_name": network_name,
                "source": "registry",
                "loaded_at": manager.current_state["meta"]["created_at"],
            }

            return design_id, manager

        except Exception as e:
            logger.error(f"Failed to load network from registry: {e}")
            raise

    def load_from_copilot_state(
        self, copilot_state: Dict[str, Any], session_id: Optional[str] = None
    ) -> Tuple[str, SimpleStateManager]:
        """Load or update a network from copilot agent state"""
        network_name = copilot_state.get("agent_network_name", "new_network")

        # Look for existing session with this network name and session_id
        existing_design_id = None
        if session_id:
            for design_id, info in self.design_id_to_info.items():
                if info.get("network_name") == network_name and info.get("session_id") == session_id:
                    existing_design_id = design_id
                    break

        if existing_design_id and existing_design_id in self.managers:
            # Update existing manager
            manager = self.managers[existing_design_id]
            manager.load_from_copilot_state(copilot_state)

            self.design_id_to_info[existing_design_id]["updated_from_copilot"] = True

            return existing_design_id, manager
        else:
            # Create new manager
            if self.NSFLOW_PLUGIN_MANUAL_EDITOR:
                design_id = str(uuid.uuid4())
                manager = SimpleStateManager(design_id)
            else:
                manager = SimpleStateManager(design_id=network_name)

            # Load from copilot state
            manager.load_from_copilot_state(copilot_state)

            # Ensure unique network name for session
            if not network_name.endswith(f"_{design_id[:8]}"):
                session_network_name = f"{network_name}_{design_id[:8]}"
                manager.set_network_name(session_network_name)
            else:
                session_network_name = network_name

            # Register manager
            self.managers[design_id] = manager

            # Update mappings
            if session_network_name not in self.network_to_design_ids:
                self.network_to_design_ids[session_network_name] = []
            self.network_to_design_ids[session_network_name].append(design_id)

            self.design_id_to_info[design_id] = {
                "network_name": session_network_name,
                "original_network_name": network_name,
                "source": "copilot",
                "session_id": session_id,
                "loaded_at": manager.current_state["meta"]["created_at"],
            }

            return design_id, manager

    def get_manager(self, design_id: str) -> Optional[SimpleStateManager]:
        """Get state manager by design ID"""
        return self.managers.get(design_id)

    def get_operation_store(self, design_id: str) -> Optional[OperationStore]:
        """Get operation store by design ID"""
        return self.operation_stores.get(design_id)

    def get_managers_for_network(self, network_name: str) -> Dict[str, SimpleStateManager]:
        """Get all managers for a network name"""
        design_ids = self.network_to_design_ids.get(network_name, [])
        return {design_id: self.managers[design_id] for design_id in design_ids if design_id in self.managers}

    def get_primary_manager_for_network(self, network_name: str) -> Optional[SimpleStateManager]:
        """Get the most recently updated manager for a network"""
        managers = self.get_managers_for_network(network_name)
        if not managers:
            return None

        # Find most recently updated
        latest_manager = None
        latest_time = None

        for manager in managers.values():
            updated_at = manager.current_state.get("meta", {}).get("updated_at")
            if updated_at and (latest_time is None or updated_at > latest_time):
                latest_time = updated_at
                latest_manager = manager

        return latest_manager or next(iter(managers.values()))

    def list_all_networks(self) -> Dict[str, Any]:
        """List all networks - registry, in-memory editing sessions, and draft states"""
        result = {
            "registry_networks": [],
            "editing_sessions": [],
            "draft_states": [],
            "total_registry": 0,
            "total_sessions": 0,
            "total_drafts": 0,
        }

        # Get registry networks
        try:
            registry_result = self.hocon_reader.list_available_networks()
            registry_networks = registry_result.get("networks", [])
            result["registry_networks"] = registry_networks
            result["total_registry"] = len(registry_networks)
        except Exception as e:
            logger.error(f"Failed to get registry networks: {e}")

        # Get current editing sessions
        for design_id, info in self.design_id_to_info.items():
            if design_id in self.managers:
                manager = self.managers[design_id]
                operation_store = self.operation_stores.get(design_id)
                state = manager.get_state()

                # Get current network name from the actual state
                current_network_name = state.get("network_name", "")

                session_info = {
                    "design_id": design_id,
                    "network_name": current_network_name or info.get("network_name", ""),
                    "original_network_name": state.get("original_network_name") or info.get("original_network_name"),
                    "source": info.get("source", "unknown"),
                    "agent_count": len(state.get("agents", {})),
                    "created_at": state.get("meta", {}).get("created_at") or info.get("created_at"),
                    "updated_at": state.get("meta", {}).get("updated_at") or info.get("loaded_at"),
                    "can_undo": (
                        len(operation_store._read_jsonl(operation_store.hist_file)) > 0
                        if operation_store
                        else manager.can_undo()
                    ),
                    "can_redo": (
                        len(operation_store._read_jsonl(operation_store.redo_file)) > 0
                        if operation_store
                        else manager.can_redo()
                    ),
                }

                result["editing_sessions"].append(session_info)

        # Get draft states (persisted but not currently loaded)
        try:
            draft_states = OperationStore.list_all_drafts()
            # Filter out drafts that are currently loaded as editing sessions
            loaded_design_ids = set(self.design_id_to_info.keys())
            for draft in draft_states:
                if draft["design_id"] not in loaded_design_ids:
                    result["draft_states"].append(draft)
            result["total_drafts"] = len(result["draft_states"])
        except Exception as e:
            logger.error(f"Failed to get draft states: {e}")

        result["total_sessions"] = len(result["editing_sessions"])
        return result

    def load_draft_state(self, design_id: str) -> Tuple[str, SimpleStateManager]:
        """Load a draft state into an active editing session"""
        try:
            # Create a new manager
            manager = SimpleStateManager(design_id)

            # Load the draft using OperationStore
            operation_store = OperationStore.load_draft(design_id, manager)
            if not operation_store:
                raise Exception(f"Failed to load draft {design_id}")

            # Register the manager and operation store
            self.managers[design_id] = manager
            self.operation_stores[design_id] = operation_store

            # Get network name from the ACTUAL restored state, not metadata
            state = manager.get_state()
            network_name = state.get("network_name", "")

            # If network name is empty, try to get it from metadata as fallback
            if not network_name:
                draft_info = operation_store.get_draft_info()
                network_name = draft_info.get("network_name", f"draft_{design_id[:8]}")
                # Update the manager's state with the fallback name
                manager.set_network_name(network_name)

            # Update mappings
            if network_name not in self.network_to_design_ids:
                self.network_to_design_ids[network_name] = []
            self.network_to_design_ids[network_name].append(design_id)

            # Get additional info from the restored state
            meta = state.get("meta", {})
            draft_info = operation_store.get_draft_info()

            self.design_id_to_info[design_id] = {
                "network_name": network_name,
                "source": "draft",
                "created_at": meta.get("created_at", draft_info.get("created_at")),
                "loaded_at": meta.get("updated_at", draft_info.get("last_saved")),
                "original_network_name": state.get("original_network_name"),
            }

            logger.info(f"Loaded draft state for design_id: {design_id}")
            return design_id, manager

        except Exception as e:
            logger.error(f"Failed to load draft state {design_id}: {e}")
            raise

    def delete_session(self, design_id: str) -> bool:
        """Delete an editing session and all associated draft files"""
        if design_id not in self.managers:
            # Check if it's a draft that's not currently loaded
            try:
                import shutil

                from werkzeug.utils import secure_filename

                from nsflow.backend.utils.agentutils.agent_network_utils import ROOT_DIR

                draft_root = os.path.join(ROOT_DIR, "draft_states")
                safe_design_id = secure_filename(design_id)
                draft_path = os.path.join(draft_root, safe_design_id)

                if os.path.exists(draft_path):
                    shutil.rmtree(draft_path)
                    logger.info(f"Deleted draft files for {design_id}")
                    return True
                else:
                    return False
            except Exception as e:
                logger.error(f"Failed to delete draft files for {design_id}: {e}")
                return False

        try:
            # Get info before deletion
            info = self.design_id_to_info.get(design_id, {})
            network_name = info.get("network_name", "")

            # Remove operation store and clean up draft files
            if design_id in self.operation_stores:
                operation_store = self.operation_stores[design_id]
                try:
                    import shutil

                    if os.path.exists(operation_store.root):
                        shutil.rmtree(operation_store.root)
                        logger.info(f"Deleted draft files at {operation_store.root}")
                except Exception as e:
                    logger.warning(f"Failed to delete draft files: {e}")

                del self.operation_stores[design_id]

            # Remove from managers
            del self.managers[design_id]

            # Remove from mappings
            if network_name in self.network_to_design_ids:
                if design_id in self.network_to_design_ids[network_name]:
                    self.network_to_design_ids[network_name].remove(design_id)

                # Clean up empty network entries
                if not self.network_to_design_ids[network_name]:
                    del self.network_to_design_ids[network_name]

            # Remove info
            if design_id in self.design_id_to_info:
                del self.design_id_to_info[design_id]

            logger.info(f"Deleted session {design_id} and all associated files")
            return True

        except Exception as e:
            logger.error(f"Failed to delete session: {e}")
            return False

    def get_session_info(self, design_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed information about a session"""
        if design_id not in self.managers:
            return None

        manager = self.managers[design_id]
        info = self.design_id_to_info.get(design_id, {})
        state = manager.get_state()
        validation = manager.validate_network()

        # Get the current network name from the actual state
        current_network_name = state.get("network_name", "")

        return {
            "design_id": design_id,
            "network_name": current_network_name or info.get("network_name", ""),
            "original_network_name": state.get("original_network_name") or info.get("original_network_name"),
            "source": info.get("source", "unknown"),
            "created_at": state.get("meta", {}).get("created_at") or info.get("created_at"),
            "updated_at": state.get("meta", {}).get("updated_at") or info.get("loaded_at"),
            "agent_count": len(state.get("agents", {})),
            "can_undo": manager.can_undo(),
            "can_redo": manager.can_redo(),
            "validation": validation,
            "session_id": info.get("session_id"),
        }

    def save_session_to_file(self, design_id: str) -> bool:
        """
        DEPRECATED: Use operation_store.save_draft() instead.
        This method is kept for backward compatibility only.
        """
        logger.warning("save_session_to_file is deprecated. Use operation_store.save_draft() instead.")

        operation_store = self.operation_stores.get(design_id)
        if operation_store:
            return operation_store.save_draft()

        return False

    def export_to_hocon_file(self, design_id: str, output_path: Optional[str] = "") -> bool:
        """Export editing session to HOCON file"""
        manager = self.managers.get(design_id)
        if not manager:
            return False

        try:
            # Validate network first
            validation_result = manager.validate_network()
            if not validation_result["valid"]:
                logger.error(f"Network validation failed: {validation_result['errors']}")
                return False

            if output_path is not None:
                # Validate and sanitize output path
                sanitized_path = os.path.normpath(os.path.abspath(output_path))
                export_root = os.path.normpath(os.path.abspath(EXPORT_ROOT_DIR))
                if os.path.commonpath([export_root, sanitized_path]) != export_root:
                    logger.error(
                        f"Refused export for path outside of export root: {sanitized_path}.\nEnsure that you're saving within {export_root}."
                    )
                    return False
            else:
                # use EXPORT_ROOT_DIR with network name
                network_name = manager.current_state.get("network_name", f"network_{secure_filename(design_id[:8])}")
                filename = secure_filename(f"{network_name}.hocon")
                sanitized_path = os.path.normpath(os.path.join(EXPORT_ROOT_DIR, filename))

            # Export to HOCON format
            hocon_config = manager.export_to_hocon()

            # Convert to HOCON string (simplified - in production you'd use pyhocon)
            # For now, we'll save as JSON with HOCON-like formatting
            hocon_content = self._dict_to_hocon_string(hocon_config)

            with open(sanitized_path, "w", encoding="utf-8") as f:
                f.write(hocon_content)

            logger.info(f"Exported network to {sanitized_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to export to HOCON: {e}")
            return False

    def _dict_to_hocon_string(self, config: Dict[str, Any], indent: int = 0) -> str:
        """Convert dictionary to HOCON-like string format"""
        lines = []
        indent_str = "  " * indent

        for key, value in config.items():
            if isinstance(value, dict):
                lines.append(f"{indent_str}{key} = {{")
                lines.append(self._dict_to_hocon_string(value, indent + 1))
                lines.append(f"{indent_str}}}")
            elif isinstance(value, list):
                if value:  # Only add non-empty lists
                    lines.append(f"{indent_str}{key} = [")
                    for item in value:
                        if isinstance(item, dict):
                            lines.append(f"{indent_str}  {{")
                            lines.append(self._dict_to_hocon_string(item, indent + 2))
                            lines.append(f"{indent_str}  }}")
                        else:
                            lines.append(f"{indent_str}  {json.dumps(item)}")
                    lines.append(f"{indent_str}]")
            elif isinstance(value, str):
                lines.append(f"{indent_str}{key} = {json.dumps(value)}")
            elif value is not None:
                lines.append(f"{indent_str}{key} = {json.dumps(value)}")

        return "\n".join(lines)


# Global instance - will be initialized when needed
_registry_instance: Optional[SimpleStateRegistry] = None


def get_registry() -> SimpleStateRegistry:
    """Get or create the registry instance"""
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = SimpleStateRegistry()
    return _registry_instance

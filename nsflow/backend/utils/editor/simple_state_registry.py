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

"""
Simplified registry that uses instance-based approach instead of class-level variables.
No locks, no complex patterns - just simple state management.
"""

import json
import os
import uuid
from typing import Dict, Optional, List, Tuple, Any
import logging

from nsflow.backend.utils.agentutils.agent_network_utils import REGISTRY_DIR as EXPORT_ROOT_DIR
from nsflow.backend.utils.editor.simple_state_manager import SimpleStateManager
from nsflow.backend.utils.editor.hocon_reader import IndependentHoconReader

logger = logging.getLogger(__name__)


class SimpleStateRegistry:
    """
    Simplified registry for state management.
    Uses instance-based approach to avoid class-level conflicts.
    """

    def __init__(self, edited_state_dir: Optional[str] = None):
        self.managers: Dict[str, SimpleStateManager] = {}
        self.network_to_design_ids: Dict[str, List[str]] = {}
        self.design_id_to_info: Dict[str, Dict[str, Any]] = {}
        
        # Initialize HOCON reader
        self.hocon_reader = IndependentHoconReader()
        
        # Set up state directory
        if edited_state_dir:
            self.edited_state_dir = edited_state_dir
        else:
            self.edited_state_dir = os.path.join(self.hocon_reader.registry_dir, "edited_states")
        
        os.makedirs(self.edited_state_dir, exist_ok=True)
    
    def create_new_network(self, network_name: str = "", template_type: str = "single_agent", **template_kwargs) -> Tuple[str, SimpleStateManager]:
        """Create a new network from scratch or template"""
        design_id = str(uuid.uuid4())
        
        # Create manager
        manager = SimpleStateManager(design_id)
        
        # Set network name if provided
        if network_name:
            if not network_name.endswith(f"_{design_id[:8]}"):
                network_name = f"{network_name}_{design_id[:8]}"
            manager.set_network_name(network_name)
        else:
            network_name = f"network_{design_id[:8]}"
            manager.set_network_name(network_name)
        
        # Create from template
        manager.create_from_template(template_type, **template_kwargs)
        
        # Register manager
        self.managers[design_id] = manager
        
        # Update mappings
        if network_name not in self.network_to_design_ids:
            self.network_to_design_ids[network_name] = []
        self.network_to_design_ids[network_name].append(design_id)
        
        self.design_id_to_info[design_id] = {
            "network_name": network_name,
            "source": "new",
            "created_at": manager.current_state["meta"]["created_at"],
            "template_type": template_type
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
            
            # Register manager
            self.managers[design_id] = manager
            
            # Update mappings
            session_network_name = f"{network_name}_{design_id[:8]}"
            manager.set_network_name(session_network_name)
            
            if session_network_name not in self.network_to_design_ids:
                self.network_to_design_ids[session_network_name] = []
            self.network_to_design_ids[session_network_name].append(design_id)
            
            self.design_id_to_info[design_id] = {
                "network_name": session_network_name,
                "original_network_name": network_name,
                "source": "registry",
                "loaded_at": manager.current_state["meta"]["created_at"]
            }
            
            return design_id, manager
            
        except Exception as e:
            logger.error(f"Failed to load network from registry: {e}")
            raise
    
    def load_from_copilot_state(self, copilot_state: Dict[str, Any], session_id: Optional[str] = None) -> Tuple[str, SimpleStateManager]:
        """Load or update a network from copilot agent state"""
        network_name = copilot_state.get("agent_network_name", "")
        
        # Look for existing session with this network name and session_id
        existing_design_id = None
        if session_id:
            for design_id, info in self.design_id_to_info.items():
                if (info.get("network_name") == network_name and 
                    info.get("session_id") == session_id):
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
            design_id = str(uuid.uuid4())
            manager = SimpleStateManager(design_id)
            
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
                "loaded_at": manager.current_state["meta"]["created_at"]
            }
            
            return design_id, manager
    
    def get_manager(self, design_id: str) -> Optional[SimpleStateManager]:
        """Get state manager by design ID"""
        return self.managers.get(design_id)
    
    def get_managers_for_network(self, network_name: str) -> Dict[str, SimpleStateManager]:
        """Get all managers for a network name"""
        design_ids = self.network_to_design_ids.get(network_name, [])
        return {design_id: self.managers[design_id] 
               for design_id in design_ids 
               if design_id in self.managers}
    
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
        """List all networks - both from registry and in-memory editing sessions"""
        result = {
            "registry_networks": [],
            "editing_sessions": [],
            "total_registry": 0,
            "total_sessions": 0
        }
        
        # Get registry networks
        try:
            registry_result = self.hocon_reader.list_available_networks()
            registry_networks = registry_result.get("networks", [])
            result["registry_networks"] = registry_networks
            result["total_registry"] = len(registry_networks)
        except Exception as e:
            logger.error(f"Failed to get registry networks: {e}")
        
        # Get editing sessions
        for design_id, info in self.design_id_to_info.items():
            if design_id in self.managers:
                manager = self.managers[design_id]
                state = manager.get_state()
                
                session_info = {
                    "design_id": design_id,
                    "network_name": info.get("network_name", ""),
                    "original_network_name": info.get("original_network_name"),
                    "source": info.get("source", "unknown"),
                    "agent_count": len(state.get("agents", {})),
                    "created_at": state.get("meta", {}).get("created_at"),
                    "updated_at": state.get("meta", {}).get("updated_at"),
                    "can_undo": manager.can_undo(),
                    "can_redo": manager.can_redo()
                }
                
                result["editing_sessions"].append(session_info)
        
        result["total_sessions"] = len(result["editing_sessions"])
        return result
    
    def delete_session(self, design_id: str) -> bool:
        """Delete an editing session"""
        if design_id not in self.managers:
            return False
        
        try:
            # Get info before deletion
            info = self.design_id_to_info.get(design_id, {})
            network_name = info.get("network_name", "")
            
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
            
            logger.info(f"Deleted session {design_id}")
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
        
        return {
            "design_id": design_id,
            "network_name": info.get("network_name", ""),
            "original_network_name": info.get("original_network_name"),
            "source": info.get("source", "unknown"),
            "created_at": state.get("meta", {}).get("created_at"),
            "updated_at": state.get("meta", {}).get("updated_at"),
            "agent_count": len(state.get("agents", {})),
            "can_undo": manager.can_undo(),
            "can_redo": manager.can_redo(),
            "validation": validation,
            "session_id": info.get("session_id")
        }
    
    def save_session_to_file(self, design_id: str) -> bool:
        """Save editing session to persistent file"""
        if not self.edited_state_dir:
            return False
        
        manager = self.managers.get(design_id)
        if not manager:
            return False
        
        try:
            network_name = manager.current_state.get("network_name", design_id)
            filename = f"{network_name}_{design_id}.json"
            file_path = os.path.join(self.edited_state_dir, filename)
            
            success = manager.save_to_file(file_path)
            
            if success and design_id in self.design_id_to_info:
                self.design_id_to_info[design_id]["file_path"] = file_path
                self.design_id_to_info[design_id]["saved_at"] = manager.current_state["meta"]["updated_at"]
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to save session to file: {e}")
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
                if not sanitized_path.startswith(export_root):
                    logger.error(f"Refused export for path outside of export root: {sanitized_path}")
                    return False
            else:
                # use EXPORT_ROOT_DIR with network name
                network_name = manager.current_state.get("network_name", f"network_{design_id[:8]}")
                filename = f"{network_name}.hocon"
                sanitized_path = os.path.normpath(os.path.join(EXPORT_ROOT_DIR, filename))
            
            # Export to HOCON format
            hocon_config = manager.export_to_hocon()

            # Convert to HOCON string (simplified - in production you'd use pyhocon)
            # For now, we'll save as JSON with HOCON-like formatting
            hocon_content = self._dict_to_hocon_string(hocon_config)
            
            with open(sanitized_path, 'w', encoding='utf-8') as f:
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

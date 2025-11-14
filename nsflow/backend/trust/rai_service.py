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

import asyncio
import json
import logging
from typing import Any, Dict, List

from fastapi import WebSocket, WebSocketDisconnect

from nsflow.backend.trust.sustainability_calculator import SustainabilityCalculator


class RaiService:
    """
    Responsible AI Service for processing token accounting data and managing
    real-time sustainability metrics via WebSocket connections.
    Session-aware to support multi-user scenarios.
    """

    _instance = None

    def __init__(self):
        """Initialize the RAI service with default metrics and connection management."""
        # Dictionary mapping session_id to list of WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Dictionary mapping session_id to current metrics
        self.session_metrics: Dict[str, Dict[str, str]] = {}
        self.calculator = SustainabilityCalculator()
        # Turning off some of the logs in this class to reduce terminal noise
        self.logger = logging.getLogger(self.__class__.__name__)
        self.current_metrics = self._get_default_metrics("unknown")

    @classmethod
    def get_instance(cls):
        """Singleton pattern to ensure single instance across the application."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_default_metrics(self, agent_name: str = "ollama") -> Dict[str, str]:
        """Return default sustainability metrics."""
        # self.logger.info(f"Returning default sustainability metrics for agent: {agent_name}")
        return {"energy": "0.00 kWh", "carbon": "0.00 g CO₂", "water": "0.00 L", "model": "", "cost": "$0.000"}

    def _calculate_metrics_from_token_accounting(
        self, token_accounting: Dict[str, Any], agent_name: str = "ollama"
    ) -> Dict[str, str]:
        """
        Calculate sustainability metrics from token accounting data using research-based calculations.

        Args:
            token_accounting: Dictionary containing token usage data from NeuroSan
                - total_tokens: Total number of tokens processed
                - time_taken_in_seconds: Time taken for the request
                - total_cost: Cost of the request
                - successful_requests: Number of successful requests
                - model: Model name (if available)

        Returns:
            List of sustainability metrics with updated values
        """
        try:
            # self.logger.info(f"Processing token accounting in _calculate_metrics_from_token_accounting: {token_accounting}")

            # Add model name to token accounting data if not already present
            enhanced_token_data = token_accounting.copy()
            if "model" not in enhanced_token_data:
                enhanced_token_data["model"] = (
                    "llm"  # Generic placeholder for demo - will be replaced with actual model detection
                )

            # self.logger.info(f"Enhanced token data with model: {enhanced_token_data}")

            # Use the research-based calculator
            sustainability_metrics = self.calculator.calculate_from_token_accounting(enhanced_token_data)

            # self.logger.info(f"Calculator returned: energy={sustainability_metrics.energy_kwh}, carbon={sustainability_metrics.carbon_g_co2}, water={sustainability_metrics.water_liters}, model={sustainability_metrics.model_name}")

            # Convert to the format expected by the frontend with appropriate precision
            # Use scientific notation or more decimal places for very small values

            # Format energy with appropriate precision
            if sustainability_metrics.energy_kwh >= 0.001:
                energy_str = f"{sustainability_metrics.energy_kwh:.3f} kWh"
            elif sustainability_metrics.energy_kwh >= 0.0001:
                energy_str = f"{sustainability_metrics.energy_kwh:.4f} kWh"
            else:
                energy_str = f"{sustainability_metrics.energy_kwh:.2e} kWh"

            # Format carbon with appropriate precision
            if sustainability_metrics.carbon_g_co2 >= 1.0:
                carbon_str = f"{sustainability_metrics.carbon_g_co2:.0f} g CO₂"
            elif sustainability_metrics.carbon_g_co2 >= 0.1:
                carbon_str = f"{sustainability_metrics.carbon_g_co2:.1f} g CO₂"
            else:
                carbon_str = f"{sustainability_metrics.carbon_g_co2:.2f} g CO₂"

            # Format water with appropriate precision - use mL for very small values
            if sustainability_metrics.water_liters >= 0.001:
                water_str = f"{sustainability_metrics.water_liters:.3f} L"
            elif sustainability_metrics.water_liters >= 0.0001:
                water_str = f"{sustainability_metrics.water_liters:.4f} L"
            else:
                # Convert to milliliters for very small values (more user-friendly)
                water_ml = sustainability_metrics.water_liters * 1000
                if water_ml >= 0.01:
                    water_str = f"{water_ml:.2f} mL"
                elif water_ml >= 0.001:
                    water_str = f"{water_ml:.3f} mL"
                else:
                    water_str = f"{water_ml:.4f} mL"

            # Format cost from token accounting data
            cost_value = token_accounting.get("total_cost", 0.0)
            if cost_value > 0:
                cost_str = f"${cost_value:.3f}"
            else:
                cost_str = "$0.000"

            result = {
                "energy": energy_str,
                "carbon": carbon_str,
                "water": water_str,
                "model": sustainability_metrics.model_name,
                "cost": cost_str,
            }

            # self.logger.info(f"Final formatted result: {result}")
            return result

        except Exception as e:
            self.logger.error(f"Error calculating sustainability metrics: {e}")
            return {
                "energy": "0.00 kWh",
                "carbon": "00 g CO₂",
                "water": "0.00 L",
                "model": "-",
                "cost": "$0.00",
            }  # Return default metrics on error

    async def handle_websocket(self, websocket: WebSocket, agent_name: str = "ollama", session_id: str = "global"):
        """
        Handle a new WebSocket connection for real-time sustainability metrics.

        Args:
            websocket: The WebSocket connection instance
            agent_name: The name of the agent
            session_id: The unique session identifier for this user connection
        """
        await websocket.accept()

        # Initialize session connections list if not exists
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []

        self.active_connections[session_id].append(websocket)
        # self.logger.info(f"New sustainability metrics WebSocket client connected for session: {session_id}")

        # Send current metrics immediately upon connection
        try:
            # Get session-specific metrics or defaults
            session_metrics = self.session_metrics.get(session_id)
            if session_metrics and isinstance(session_metrics, dict):
                await websocket.send_text(json.dumps(session_metrics))
        except Exception as e:
            self.logger.error(f"Error sending initial metrics: {e}")

        try:
            # Keep connection alive and handle any incoming messages
            while True:
                await asyncio.sleep(1)
        except WebSocketDisconnect:
            if session_id in self.active_connections and websocket in self.active_connections[session_id]:
                self.active_connections[session_id].remove(websocket)
                # Clean up empty session lists
                if not self.active_connections[session_id]:
                    del self.active_connections[session_id]
            # self.logger.info(f"Sustainability metrics WebSocket client disconnected for session: {session_id}")
        except Exception as e:
            self.logger.error(f"WebSocket error: {e}")
            if session_id in self.active_connections and websocket in self.active_connections[session_id]:
                self.active_connections[session_id].remove(websocket)
                # Clean up empty session lists
                if not self.active_connections[session_id]:
                    del self.active_connections[session_id]

    async def update_metrics_from_token_accounting(
        self, token_accounting: Dict[str, Any], agent_name: str = "ollama", session_id: str = "global"
    ):
        """
        Update sustainability metrics based on new token accounting data and broadcast to session clients.

        Args:
            token_accounting: Token accounting data from NeuroSan
            agent_name: The name of the agent
            session_id: The unique session identifier for this user connection
        """
        try:
            # self.logger.info(f"Received token accounting data: {token_accounting}")

            # Calculate new metrics
            new_metrics = self._calculate_metrics_from_token_accounting(token_accounting, agent_name)

            # Store metrics for this session
            self.session_metrics[session_id] = new_metrics

            # Also update global current_metrics for backward compatibility
            self.current_metrics = new_metrics

            # self.logger.info(f"Calculated new sustainability metrics for session {session_id}: {new_metrics}")

            # Broadcast to all connected WebSocket clients for this session only
            await self._broadcast_metrics(session_id)

        except Exception as e:
            self.logger.error(f"Error updating metrics from token accounting: {e}")

    async def _broadcast_metrics(self, session_id: str = "global"):
        """
        Broadcast current sustainability metrics to all connected WebSocket clients for a specific session.

        Args:
            session_id: The session to broadcast to. If not provided, broadcasts to all sessions.
        """
        if session_id not in self.active_connections or not self.active_connections[session_id]:
            return

        # Get session-specific metrics
        metrics = self.session_metrics.get(session_id, self.current_metrics)
        message = json.dumps(metrics)
        disconnected_clients = []

        for websocket in self.active_connections[session_id]:
            try:
                await websocket.send_text(message)
            except WebSocketDisconnect:
                disconnected_clients.append(websocket)
            except Exception as e:
                self.logger.error(f"Error broadcasting to WebSocket client: {e}")
                disconnected_clients.append(websocket)

        # Remove disconnected clients
        for websocket in disconnected_clients:
            self.active_connections[session_id].remove(websocket)

        # Clean up empty session lists
        if not self.active_connections[session_id]:
            del self.active_connections[session_id]

        if disconnected_clients:
            self.logger.info(
                f"Removed {len(disconnected_clients)} disconnected WebSocket clients from session {session_id}"
            )

    def get_current_metrics(self) -> Dict[str, str]:
        """
        Get the current sustainability metrics.

        Returns:
            List of current sustainability metrics
        """
        return self.current_metrics

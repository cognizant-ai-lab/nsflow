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

import asyncio
import json
import logging
from typing import Dict, Any, List
from fastapi import WebSocket, WebSocketDisconnect
from nsflow.backend.trust.sustainability_calculator import SustainabilityCalculator


class RaiService:
    """
    Responsible AI Service for processing token accounting data and managing 
    real-time sustainability metrics via WebSocket connections.
    """
    
    _instance = None
    
    def __init__(self):
        """Initialize the RAI service with default metrics and connection management."""
        self.active_connections: List[WebSocket] = []
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
        return {
            "energy": "0.00 kWh",
            "carbon": "0.00 g CO₂",
            "water": "0.00 L",
            "model": "",
            "cost": "$0.000"
        }
    
    def _calculate_metrics_from_token_accounting(self, token_accounting: Dict[str, Any], agent_name: str = "ollama") -> Dict[str, str]:
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
                enhanced_token_data["model"] = "llm"  # Generic placeholder for demo - will be replaced with actual model detection
            
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
            cost_value = token_accounting.get('total_cost', 0.0)
            if cost_value > 0:
                cost_str = f"${cost_value:.3f}"
            else:
                cost_str = "$0.000"
            
            result = {
                "energy": energy_str,
                "carbon": carbon_str,
                "water": water_str,
                "model": sustainability_metrics.model_name,
                "cost": cost_str
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
                "cost": "$0.00"
            }  # Return default metrics on error
    
    async def handle_websocket(self, websocket: WebSocket, agent_name: str = "ollama"):
        """
        Handle a new WebSocket connection for real-time sustainability metrics.
        
        Args:
            websocket: The WebSocket connection instance
        """
        await websocket.accept()
        self.active_connections.append(websocket)
        # self.logger.info("New sustainability metrics WebSocket client connected")
        
        # Send current metrics immediately upon connection
        try:
            # Send current metrics or defaults with the correct agent name
            if self.current_metrics and isinstance(self.current_metrics, dict):
                await websocket.send_text(json.dumps(self.current_metrics))
            else:
                # Send default metrics
                default_data = self._get_default_metrics(agent_name)
                await websocket.send_text(json.dumps(default_data))
        except Exception as e:
            self.logger.error(f"Error sending initial metrics: {e}")
        
        try:
            # Keep connection alive and handle any incoming messages
            while True:
                await asyncio.sleep(1)
        except WebSocketDisconnect:
            self.active_connections.remove(websocket)
            # self.logger.info("Sustainability metrics WebSocket client disconnected")
        except Exception as e:
            self.logger.error(f"WebSocket error: {e}")
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
    
    async def update_metrics_from_token_accounting(self, token_accounting: Dict[str, Any], agent_name: str = "ollama"):
        """
        Update sustainability metrics based on new token accounting data and broadcast to all clients.
        
        Args:
            token_accounting: Token accounting data from NeuroSan
        """
        try:
            # self.logger.info(f"Received token accounting data: {token_accounting}")
            
            # Calculate new metrics
            new_metrics = self._calculate_metrics_from_token_accounting(token_accounting, agent_name)
            self.current_metrics = new_metrics
            
            # self.logger.info(f"Calculated new sustainability metrics: {new_metrics}")
            
            # Broadcast to all connected WebSocket clients
            await self._broadcast_metrics()
            
        except Exception as e:
            self.logger.error(f"Error updating metrics from token accounting: {e}")
    
    async def _broadcast_metrics(self):
        """Broadcast current sustainability metrics to all connected WebSocket clients."""
        if not self.active_connections:
            return
        
        message = json.dumps(self.current_metrics)
        disconnected_clients = []
        
        for websocket in self.active_connections:
            try:
                await websocket.send_text(message)
            except WebSocketDisconnect:
                disconnected_clients.append(websocket)
            except Exception as e:
                self.logger.error(f"Error broadcasting to WebSocket client: {e}")
                disconnected_clients.append(websocket)
        
        # Remove disconnected clients
        for websocket in disconnected_clients:
            self.active_connections.remove(websocket)
        
        if disconnected_clients:
            self.logger.info(f"Removed {len(disconnected_clients)} disconnected WebSocket clients")
    
    def get_current_metrics(self) -> Dict[str, str]:
        """
        Get the current sustainability metrics.
        
        Returns:
            List of current sustainability metrics
        """
        return self.current_metrics

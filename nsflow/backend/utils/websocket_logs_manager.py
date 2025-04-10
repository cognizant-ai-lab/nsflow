
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

"""
Manages real-time log and internal chat streaming via WebSocket connections.

This module defines the WebsocketLogsManager class, which enables broadcasting
structured log entries and internal agent messages to connected WebSocket clients.
Instances are typically scoped per agent (e.g. "hello_world", "airline_policy") and reused
throughout the application via a shared registry.
"""

import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Any
from fastapi import WebSocket, WebSocketDisconnect

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


class WebsocketLogsManager:
    """
    Enables sending structured logs and internal chat messages over WebSocket connections.
    Each instance manages a list of connected WebSocket clients and can broadcast messages
    to clients in real-time. Supports both general logs and internal chat streams.
    """
    LOG_BUFFER_SIZE = 100

    def __init__(self, agent_name: str):
        """
        Initialize a logs manager scoped to a specific agent.
        :param agent_name: The name of the agent (e.g. "coach", "refiner", or "global").
        """
        self.agent_name = agent_name
        self.active_log_connections: List[WebSocket] = []
        self.active_internal_chat_connections: List[WebSocket] = []
        self.logger = logging.getLogger(f"{self.__class__.__name__}.{self.agent_name}")
        self.log_buffer: List[Dict] = []

    def get_timestamp(self):
        """
        Get the current UTC timestamp formatted as a string.
        :return: A timestamp string in 'YYYY-MM-DD HH:MM:SS' format.
        """
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    async def log_event(self, message: str, source: str = "FastAPI"):
        """
        Send a structured log event to all connected log WebSocket clients.
        :param message: The log message to send.
        :param source: The origin of the log (e.g. "FastAPI", "NeuroSan").
        """
        log_entry = {"timestamp": self.get_timestamp(),
                     "message": message,
                     "source": source,
                     "agent": self.agent_name}
        # Check if this is a duplicate of the most recent log message (ignoring timestamp)
        if self.log_buffer:
            last_entry = self.log_buffer[-1]
            if last_entry["message"] == log_entry["message"] and last_entry["source"] == log_entry["source"]:
                # Skip duplicate log
                return
        # Log the message
        self.logger.info("%s: %s", source, message)
        self.log_buffer.append(log_entry)
        if len(self.log_buffer) > self.LOG_BUFFER_SIZE:
            self.log_buffer.pop(0)
        # Broadcast to connected clients
        await self.broadcast_to_websocket(log_entry, self.active_log_connections)

    async def internal_chat_event(self, message: Dict[str, Any]):
        """
        Send a structured internal chat message to all connected internal chat clients.
        :param message: A dictionary representing the chat message and metadata.
        """
        entry = {"message": message}
        await self.broadcast_to_websocket(entry, self.active_internal_chat_connections)

    async def broadcast_to_websocket(self,
                                     entry: Dict[str, Any],
                                     connections_list: List[WebSocket]):
        """
        Broadcast a message to a list of WebSocket clients, removing any disconnected ones.
        :param entry: The dictionary message to send (will be JSON serialized).
        :param connections_list: List of currently active WebSocket clients.
        """
        disconnected: List[WebSocket] = []
        for ws in connections_list:
            try:
                await ws.send_text(json.dumps(entry))
            except WebSocketDisconnect:
                disconnected.append(ws)
        for ws in disconnected:
            connections_list.remove(ws)

    async def handle_internal_chat_websocket(self, websocket: WebSocket):
        """
        Handle a new WebSocket connection for internal chat stream.
        :param websocket: The connected WebSocket instance.
        """
        await websocket.accept()
        self.active_internal_chat_connections.append(websocket)
        await self.internal_chat_event(f"Internal chat connected: {self.agent_name}")
        try:
            while True:
                await asyncio.sleep(1)
        except WebSocketDisconnect:
            self.active_internal_chat_connections.remove(websocket)
            await self.internal_chat_event(f"Internal chat disconnected: {self.agent_name}")

    async def handle_log_websocket(self, websocket: WebSocket):
        """
        Handle a new WebSocket connection for receiving log events.
        :param websocket: The connected WebSocket instance.
        """
        await websocket.accept()
        self.active_log_connections.append(websocket)
        await self.log_event("New logs client connected", "FastAPI")
        try:
            while True:
                await asyncio.sleep(2)
        except WebSocketDisconnect:
            self.active_log_connections.remove(websocket)
            await self.log_event("Logs client disconnected", "FastAPI")

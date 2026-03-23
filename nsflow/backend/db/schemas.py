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
Pydantic schemas for CRUSE API request/response validation.

These define the API contract — separate from SQLAlchemy models (models.py)
which define the database schema.
"""

import json
import logging
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from nsflow.backend.db.models import Message

logger = logging.getLogger(__name__)


# ==================== Message Schemas ====================

class WidgetDefinition(BaseModel):
    title: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    bgImage: Optional[str] = None
    schema: dict  # JSON Schema


class MessageOrigin(BaseModel):
    tool: str
    instantiation_index: int


class MessageCreate(BaseModel):
    sender: str  # 'HUMAN', 'AI', or 'SYSTEM'
    origin: List[MessageOrigin]
    text: str
    widget: Optional[WidgetDefinition] = None


class MessageResponse(BaseModel):
    id: str
    thread_id: str
    sender: str
    origin: List[MessageOrigin]
    text: str
    widget: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Thread Schemas ====================

class ThreadCreate(BaseModel):
    title: str
    agent_name: Optional[str] = None


class ThreadResponse(BaseModel):
    id: str
    title: str
    agent_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ThreadWithMessages(ThreadResponse):
    messages: List[MessageResponse] = []


# ==================== Theme Schemas ====================

class ThemeCreate(BaseModel):
    agent_name: str
    theme_type: str  # 'static' or 'dynamic'
    theme_json: dict


class ThemeUpdate(BaseModel):
    theme_type: str  # 'static' or 'dynamic'
    theme_json: dict


class ThemeResponse(BaseModel):
    agent_name: str
    static_theme: Optional[dict] = None
    dynamic_theme: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== Conversion Helpers ====================

def parse_origin(origin_str: str) -> List[MessageOrigin]:
    """Parse a JSON-encoded origin string from the DB into a list of MessageOrigin."""
    try:
        data = json.loads(origin_str) if isinstance(origin_str, str) else origin_str
        if isinstance(data, list):
            return [MessageOrigin(**item) for item in data]
        if isinstance(data, dict):
            return [MessageOrigin(**data)]
    except (json.JSONDecodeError, ValueError, TypeError):
        logger.warning("Failed to parse origin: %s", origin_str)
    return []


def parse_widget(widget_json) -> Optional[dict]:
    """Parse a widget_json value from the DB into a dict (or None)."""
    if not widget_json:
        return None
    try:
        return json.loads(widget_json) if isinstance(widget_json, str) else widget_json
    except (json.JSONDecodeError, ValueError):
        logger.warning("Failed to parse widget JSON")
        return None


def message_to_response(msg: Message) -> MessageResponse:
    """Convert a SQLAlchemy Message row to a MessageResponse."""
    return MessageResponse(
        id=msg.id,
        thread_id=msg.thread_id,
        sender=msg.sender,
        origin=parse_origin(msg.origin),
        text=msg.text,
        widget=parse_widget(msg.widget_json),
        created_at=msg.created_at,
    )


def serialize_origin(origin: List[MessageOrigin]) -> str:
    """Serialize a list of MessageOrigin to a JSON string for DB storage."""
    return json.dumps([o.model_dump() for o in origin])


def serialize_widget(widget: Optional[WidgetDefinition]) -> Optional[str]:
    """Serialize a WidgetDefinition to a JSON string for DB storage."""
    if widget is None:
        return None
    return json.dumps(widget.model_dump())

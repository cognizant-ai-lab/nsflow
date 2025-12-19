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

import json
import logging
import os
from datetime import datetime
from datetime import timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from nsflow.backend.db.database import get_threads_db
from nsflow.backend.db.models import Message, Thread, Theme

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cruse", tags=["cruse"])


# Pydantic models for request/response
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
    origin: List[MessageOrigin]  # Origin information (tool + instantiation_index)
    text: str
    widget: Optional[WidgetDefinition] = None


class MessageResponse(BaseModel):
    id: str
    thread_id: str
    sender: str
    origin: str
    text: str
    widget: Optional[dict] = None  # Parsed widget JSON
    created_at: datetime

    class Config:
        from_attributes = True


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


class ThemeCreate(BaseModel):
    agent_name: str
    theme_type: str  # 'static' or 'dynamic'
    theme_json: dict  # The theme configuration as JSON


class ThemeUpdate(BaseModel):
    theme_type: str  # 'static' or 'dynamic'
    theme_json: dict  # The theme configuration as JSON


class ThemeResponse(BaseModel):
    agent_name: str
    static_theme: Optional[dict] = None
    dynamic_theme: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Thread endpoints
@router.post("/threads", response_model=ThreadResponse)
async def create_thread(thread: ThreadCreate, db: Session = Depends(get_threads_db)):
    """
    Create a new chat thread.
    """
    import uuid

    thread_id = str(uuid.uuid4())
    db_thread = Thread(
        id=thread_id,
        title=thread.title,
        agent_name=thread.agent_name,
    )
    db.add(db_thread)
    db.commit()
    db.refresh(db_thread)

    logger.info(f"Created new thread: {thread_id} - {thread.title}")
    return db_thread


@router.get("/threads", response_model=List[ThreadResponse])
async def list_threads(db: Session = Depends(get_threads_db)):
    """
    List all chat threads, ordered by most recently updated.
    """
    threads = db.query(Thread).order_by(Thread.updated_at.desc()).all()
    logger.info(f"Retrieved {len(threads)} threads")
    return threads


@router.get("/threads/{thread_id}", response_model=ThreadWithMessages)
async def get_thread(thread_id: str, db: Session = Depends(get_threads_db)):
    """
    Get a specific thread with all its messages.
    """
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    messages = (
        db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.created_at.asc())
        .all()
    )

    # Parse widget JSON for each message
    message_responses = []
    for msg in messages:
        import json

        widget_data = None
        if msg.widget_json:
            try:
                widget_data = json.loads(msg.widget_json)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse widget JSON for message {msg.id}")

        message_responses.append(
            MessageResponse(
                id=msg.id,
                thread_id=msg.thread_id,
                sender=msg.sender,
                origin=msg.origin,  # Already a JSON string from DB
                text=msg.text,
                widget=widget_data,
                created_at=msg.created_at,
            )
        )

    return ThreadWithMessages(
        id=thread.id,
        title=thread.title,
        agent_name=thread.agent_name,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        messages=message_responses,
    )


@router.patch("/threads/{thread_id}", response_model=ThreadResponse)
async def update_thread(
    thread_id: str, thread_update: ThreadCreate, db: Session = Depends(get_threads_db)
):
    """
    Update a thread's title and/or agent_name.
    """
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Update fields
    if thread_update.title is not None:
        thread.title = thread_update.title
    if thread_update.agent_name is not None:
        thread.agent_name = thread_update.agent_name

    # Update timestamp
    thread.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(thread)

    logger.info(f"Updated thread: {thread_id} - {thread.title}")
    return thread


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, db: Session = Depends(get_threads_db)):
    """
    Delete a thread and all its messages (CASCADE).
    """
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    db.delete(thread)
    db.commit()

    logger.info(f"Deleted thread: {thread_id}")
    return {"message": "Thread deleted successfully", "thread_id": thread_id}


@router.delete("/threads/agent/{agent_name:path}")
async def delete_all_threads_for_agent(agent_name: str, db: Session = Depends(get_threads_db)):
    """
    Delete all threads for a specific agent.
    """
    threads = db.query(Thread).filter(Thread.agent_name == agent_name).all()

    if not threads:
        logger.info(f"No threads found for agent: {agent_name}")
        return {"message": "No threads found for this agent", "agent_name": agent_name, "deleted_count": 0}

    deleted_count = len(threads)

    for thread in threads:
        db.delete(thread)

    db.commit()

    logger.info(f"Deleted {deleted_count} threads for agent: {agent_name}")
    return {"message": f"Deleted {deleted_count} threads successfully", "agent_name": agent_name, "deleted_count": deleted_count}


# Message endpoints
@router.post("/threads/{thread_id}/messages", response_model=MessageResponse)
async def add_message(
    thread_id: str, message: MessageCreate, db: Session = Depends(get_threads_db)
):
    """
    Add a message to a thread.
    """
    import json
    import uuid

    # Verify thread exists
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Convert widget to JSON string if present
    widget_json = None
    if message.widget:
        widget_json = json.dumps(message.widget.model_dump())

    # Convert origin to JSON string (required field)
    origin_json = json.dumps([origin.model_dump() for origin in message.origin])

    message_id = str(uuid.uuid4())
    db_message = Message(
        id=message_id,
        thread_id=thread_id,
        sender=message.sender,
        origin=origin_json,
        text=message.text,
        widget_json=widget_json,
    )
    db.add(db_message)

    # Update thread's updated_at timestamp
    thread.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(db_message)

    logger.info(f"Added message to thread {thread_id}: {message_id}")

    # Parse widget back for response
    widget_data = None
    if widget_json:
        widget_data = json.loads(widget_json)

    return MessageResponse(
        id=db_message.id,
        thread_id=db_message.thread_id,
        sender=db_message.sender,
        origin=db_message.origin,  # Already a JSON string from DB
        text=db_message.text,
        widget=widget_data,
        created_at=db_message.created_at,
    )


@router.get("/threads/{thread_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    thread_id: str,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_threads_db)):
    """
    Get all messages for a specific thread.
    """
    import json

    # Verify thread exists
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    messages = (
        db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    # Parse widget JSON for each message
    message_responses = []
    for msg in messages:
        widget_data = None
        if msg.widget_json:
            try:
                widget_data = json.loads(msg.widget_json)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse widget JSON for message {msg.id}")

        message_responses.append(
            MessageResponse(
                id=msg.id,
                thread_id=msg.thread_id,
                sender=msg.sender,
                origin=msg.origin,  # Already a JSON string from DB
                text=msg.text,
                widget=widget_data,
                created_at=msg.created_at,
            )
        )

    logger.info(f"Retrieved {len(message_responses)} messages for thread {thread_id}")
    return message_responses


@router.get("/threads/{thread_id}/chat_context")
async def get_chat_context(
    thread_id: str,
    max_history: Optional[int] = None,
    db: Session = Depends(get_threads_db)):
    """
    Build chat_context from the last N messages in a thread.

    Args:
        thread_id: The thread ID
        max_history: Maximum number of messages to include (defaults to MAX_MESSAGE_HISTORY env var or 10)

    Returns:
        A chat_context dictionary with chat_histories containing recent messages
    """
    # Get max history from env variable or default to 10
    if max_history is None:
        max_history = int(os.getenv('MAX_MESSAGE_HISTORY', '10'))

    # Verify thread exists
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Get the last N messages for the thread
    messages = (
        db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.created_at.desc())
        .limit(max_history)
        .all()
    )

    # Reverse to get chronological order (oldest to newest)
    messages = list(reversed(messages))

    # If no messages, return empty chat_context
    if not messages:
        return {"chat_context": {"chat_histories": []}}

    # Parse origin from the first message to use as chat_history origin
    first_origin = []
    if messages[0].origin:
        try:
            origin_data = json.loads(messages[0].origin) if isinstance(messages[0].origin, str) else messages[0].origin
            if isinstance(origin_data, list):
                first_origin = origin_data
            elif isinstance(origin_data, dict):
                first_origin = [origin_data]
        except (json.JSONDecodeError, ValueError):
            logger.warning(f"Could not parse origin for message {messages[0].id}")
            first_origin = []

    # Build messages array
    chat_messages = []
    for msg in messages:
        # Parse origin for this message
        msg_origin = []
        if msg.origin:
            try:
                origin_data = json.loads(msg.origin) if isinstance(msg.origin, str) else msg.origin
                if isinstance(origin_data, list):
                    msg_origin = origin_data
                elif isinstance(origin_data, dict):
                    msg_origin = [origin_data]
            except (json.JSONDecodeError, ValueError):
                logger.warning(f"Could not parse origin for message {msg.id}")
                msg_origin = []

        # Map sender to type (HUMAN or AI)
        message_type = "HUMAN" if msg.sender in ["user", "HUMAN"] else "AI"

        chat_messages.append({
            "type": message_type,
            "origin": msg_origin,
            "text": msg.text
        })

    # Build the chat_context structure (note: no outer wrapper, this IS the chat_context)
    chat_context = {
        "chat_histories": [
            {
                "origin": first_origin,
                "messages": chat_messages
            }
        ]
    }

    logger.info(f"Built chat_context for thread {thread_id} with {len(chat_messages)} messages")
    return {"chat_context": chat_context}


# ==================== Theme API ====================

@router.post("/themes", response_model=ThemeResponse)
async def create_or_add_theme(theme_request: ThemeCreate, db: Session = Depends(get_threads_db)):
    """
    Create or add a theme for an agent.
    If the agent already has a theme entry, updates the specified theme_type (static or dynamic).
    Otherwise, creates a new theme entry.

    Args:
        theme_request: Contains agent_name, theme_type ('static' or 'dynamic'), and theme_json

    Returns:
        ThemeResponse with both static and dynamic themes
    """
    if theme_request.theme_type not in ['static', 'dynamic']:
        raise HTTPException(status_code=400, detail="theme_type must be 'static' or 'dynamic'")

    # Check if theme already exists for this agent
    existing_theme = db.query(Theme).filter(Theme.agent_name == theme_request.agent_name).first()

    if existing_theme:
        # Update the specified theme type
        if theme_request.theme_type == 'static':
            existing_theme.static_theme = theme_request.theme_json
        else:  # dynamic
            existing_theme.dynamic_theme = theme_request.theme_json

        existing_theme.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing_theme)

        logger.info(f"Updated {theme_request.theme_type} theme for agent: {theme_request.agent_name}")
        return existing_theme
    else:
        # Create new theme entry
        new_theme = Theme(
            agent_name=theme_request.agent_name,
            static_theme=theme_request.theme_json if theme_request.theme_type == 'static' else None,
            dynamic_theme=theme_request.theme_json if theme_request.theme_type == 'dynamic' else None,
        )
        db.add(new_theme)
        db.commit()
        db.refresh(new_theme)

        logger.info(f"Created {theme_request.theme_type} theme for agent: {theme_request.agent_name}")
        return new_theme


@router.get("/themes/{agent_name:path}", response_model=ThemeResponse)
async def get_theme(agent_name: str, db: Session = Depends(get_threads_db)):
    """
    Get both static and dynamic themes for an agent.

    Args:
        agent_name: The agent name (can contain slashes)

    Returns:
        ThemeResponse containing both static_theme and dynamic_theme (null if not set)
    """
    theme = db.query(Theme).filter(Theme.agent_name == agent_name).first()

    if not theme:
        raise HTTPException(status_code=404, detail=f"No themes found for agent: {agent_name}")

    logger.info(f"Retrieved themes for agent: {agent_name}")
    return theme


@router.patch("/themes/{agent_name:path}", response_model=ThemeResponse)
async def update_theme(
    agent_name: str,
    theme_update: ThemeUpdate,
    db: Session = Depends(get_threads_db)
):
    """
    Update a specific theme type (static or dynamic) for an agent.

    Args:
        agent_name: The agent name
        theme_update: Contains theme_type ('static' or 'dynamic') and theme_json

    Returns:
        ThemeResponse with both static and dynamic themes
    """
    if theme_update.theme_type not in ['static', 'dynamic']:
        raise HTTPException(status_code=400, detail="theme_type must be 'static' or 'dynamic'")

    theme = db.query(Theme).filter(Theme.agent_name == agent_name).first()

    if not theme:
        raise HTTPException(status_code=404, detail=f"No themes found for agent: {agent_name}")

    # Update the specified theme type
    if theme_update.theme_type == 'static':
        theme.static_theme = theme_update.theme_json
    else:  # dynamic
        theme.dynamic_theme = theme_update.theme_json

    theme.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(theme)

    logger.info(f"Updated {theme_update.theme_type} theme for agent: {agent_name}")
    return theme

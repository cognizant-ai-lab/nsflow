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
import uuid
from datetime import datetime
from datetime import timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from nsflow.backend.db.database import get_nss_db
from nsflow.backend.db.models import Message, Thread, Theme
from nsflow.backend.db.schemas import (
    MessageCreate,
    MessageResponse,
    ThreadCreate,
    ThreadResponse,
    ThreadWithMessages,
    ThemeCreate,
    ThemeUpdate,
    ThemeResponse,
    message_to_response,
    parse_origin,
    serialize_origin,
    serialize_widget,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cruse", tags=["cruse"])


# ==================== Thread Endpoints ====================

@router.post("/threads", response_model=ThreadResponse)
async def create_thread(thread: ThreadCreate, db: Session = Depends(get_nss_db)):
    """Create a new chat thread."""
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
async def list_threads(db: Session = Depends(get_nss_db)):
    """List all chat threads, ordered by most recently updated."""
    threads = db.query(Thread).order_by(Thread.updated_at.desc()).all()
    logger.info(f"Retrieved {len(threads)} threads")
    return threads


@router.get("/threads/{thread_id}", response_model=ThreadWithMessages)
async def get_thread(thread_id: str, db: Session = Depends(get_nss_db)):
    """Get a specific thread with all its messages."""
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    messages = (
        db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.created_at.asc())
        .all()
    )

    return ThreadWithMessages(
        id=thread.id,
        title=thread.title,
        agent_name=thread.agent_name,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        messages=[message_to_response(msg) for msg in messages],
    )


@router.patch("/threads/{thread_id}", response_model=ThreadResponse)
async def update_thread(
    thread_id: str, thread_update: ThreadCreate, db: Session = Depends(get_nss_db)
):
    """Update a thread's title and/or agent_name."""
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    if thread_update.title is not None:
        thread.title = thread_update.title
    if thread_update.agent_name is not None:
        thread.agent_name = thread_update.agent_name

    thread.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(thread)

    logger.info(f"Updated thread: {thread_id} - {thread.title}")
    return thread


@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, db: Session = Depends(get_nss_db)):
    """Delete a thread and all its messages (CASCADE)."""
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    db.delete(thread)
    db.commit()

    logger.info(f"Deleted thread: {thread_id}")
    return {"message": "Thread deleted successfully", "thread_id": thread_id}


@router.delete("/threads/agent/{agent_name:path}")
async def delete_all_threads_for_agent(agent_name: str, db: Session = Depends(get_nss_db)):
    """Delete all threads for a specific agent."""
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


# ==================== Message Endpoints ====================

@router.post("/threads/{thread_id}/messages", response_model=MessageResponse)
async def add_message(
    thread_id: str, message: MessageCreate, db: Session = Depends(get_nss_db)
):
    """Add a message to a thread."""
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    message_id = str(uuid.uuid4())
    db_message = Message(
        id=message_id,
        thread_id=thread_id,
        sender=message.sender,
        origin=serialize_origin(message.origin),
        text=message.text,
        widget_json=serialize_widget(message.widget),
    )
    db.add(db_message)

    thread.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(db_message)

    logger.info(f"Added message to thread {thread_id}: {message_id}")
    return message_to_response(db_message)


@router.get("/threads/{thread_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    thread_id: str,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_nss_db)):
    """Get all messages for a specific thread."""
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

    logger.info(f"Retrieved {len(messages)} messages for thread {thread_id}")
    return [message_to_response(msg) for msg in messages]


@router.get("/threads/{thread_id}/chat_context")
async def get_chat_context(
    thread_id: str,
    max_history: Optional[int] = None,
    db: Session = Depends(get_nss_db)):
    """
    Build chat_context from the last N messages in a thread.

    Args:
        thread_id: The thread ID
        max_history: Maximum number of messages to include (defaults to MAX_MESSAGE_HISTORY env var or 10)

    Returns:
        A chat_context dictionary with chat_histories containing recent messages
    """
    if max_history is None:
        max_history = int(os.getenv('MAX_MESSAGE_HISTORY', '10'))

    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    messages = (
        db.query(Message)
        .filter(Message.thread_id == thread_id)
        .order_by(Message.created_at.desc())
        .limit(max_history)
        .all()
    )

    # Reverse to get chronological order (oldest to newest)
    messages = list(reversed(messages))

    if not messages:
        return {"chat_context": {"chat_histories": []}}

    # Parse origin from the first message to use as chat_history origin
    first_origin = [o.model_dump() for o in parse_origin(messages[0].origin)]

    # Build messages array
    chat_messages = []
    for msg in messages:
        msg_origin = [o.model_dump() for o in parse_origin(msg.origin)]
        message_type = "HUMAN" if msg.sender in ["user", "HUMAN"] else "AI"
        chat_messages.append({
            "type": message_type,
            "origin": msg_origin,
            "text": msg.text,
        })

    chat_context = {
        "chat_histories": [
            {
                "origin": first_origin,
                "messages": chat_messages,
            }
        ]
    }

    logger.info(f"Built chat_context for thread {thread_id} with {len(chat_messages)} messages")
    return {"chat_context": chat_context}


# ==================== Theme Endpoints ====================

@router.post("/themes", response_model=ThemeResponse)
async def create_or_add_theme(theme_request: ThemeCreate, db: Session = Depends(get_nss_db)):
    """
    Create or add a theme for an agent.
    If the agent already has a theme entry, updates the specified theme_type.
    Otherwise, creates a new theme entry.
    """
    if theme_request.theme_type not in ['static', 'dynamic']:
        raise HTTPException(status_code=400, detail="theme_type must be 'static' or 'dynamic'")

    existing_theme = db.query(Theme).filter(Theme.agent_name == theme_request.agent_name).first()

    if existing_theme:
        if theme_request.theme_type == 'static':
            existing_theme.static_theme = theme_request.theme_json
        else:
            existing_theme.dynamic_theme = theme_request.theme_json

        existing_theme.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing_theme)

        logger.info(f"Updated {theme_request.theme_type} theme for agent: {theme_request.agent_name}")
        return existing_theme
    else:
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
async def get_theme(agent_name: str, db: Session = Depends(get_nss_db)):
    """Get both static and dynamic themes for an agent."""
    theme = db.query(Theme).filter(Theme.agent_name == agent_name).first()

    if not theme:
        raise HTTPException(status_code=404, detail=f"No themes found for agent: {agent_name}")

    logger.info(f"Retrieved themes for agent: {agent_name}")
    return theme


@router.patch("/themes/{agent_name:path}", response_model=ThemeResponse)
async def update_theme(
    agent_name: str,
    theme_update: ThemeUpdate,
    db: Session = Depends(get_nss_db)
):
    """Update a specific theme type (static or dynamic) for an agent."""
    if theme_update.theme_type not in ['static', 'dynamic']:
        raise HTTPException(status_code=400, detail="theme_type must be 'static' or 'dynamic'")

    theme = db.query(Theme).filter(Theme.agent_name == agent_name).first()

    if not theme:
        raise HTTPException(status_code=404, detail=f"No themes found for agent: {agent_name}")

    if theme_update.theme_type == 'static':
        theme.static_theme = theme_update.theme_json
    else:
        theme.dynamic_theme = theme_update.theme_json

    theme.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(theme)

    logger.info(f"Updated {theme_update.theme_type} theme for agent: {agent_name}")
    return theme

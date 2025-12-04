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

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from nsflow.backend.db.database import get_threads_db
from nsflow.backend.db.models import Message, Thread

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


class MessageCreate(BaseModel):
    sender: str  # 'user', 'agent', or 'system'
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
        widget_json = json.dumps(message.widget.dict())

    message_id = str(uuid.uuid4())
    db_message = Message(
        id=message_id,
        thread_id=thread_id,
        sender=message.sender,
        text=message.text,
        widget_json=widget_json,
    )
    db.add(db_message)

    # Update thread's updated_at timestamp
    thread.updated_at = datetime.now(datetime.timezone.utc)

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
                text=msg.text,
                widget=widget_data,
                created_at=msg.created_at,
            )
        )

    logger.info(f"Retrieved {len(message_responses)} messages for thread {thread_id}")
    return message_responses

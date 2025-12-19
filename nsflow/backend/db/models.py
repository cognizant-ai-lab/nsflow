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

from datetime import datetime
from datetime import timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, JSON, String, Text

from nsflow.backend.db.database import Base


def _get_utc_now():
    """Helper function to get current UTC time for SQLAlchemy defaults."""
    return datetime.now(timezone.utc)


# CRUSE (Context-Reactice User Experience) Models
class Theme(Base):
    """
    Represents a UI theme in the system.
    """
    __tablename__ = "themes"
    agent_name = Column(String, primary_key=True, index=True)
    static_theme = Column(JSON, nullable=True)  # JSON string containing static theme definition
    dynamic_theme = Column(JSON, nullable=True)  # JSON string containing dynamic theme definition
    created_at = Column(DateTime, default=_get_utc_now)
    updated_at = Column(DateTime, default=_get_utc_now, onupdate=_get_utc_now)


class Thread(Base):
    """
    Represents a chat thread/conversation in the system.
    Each thread contains multiple messages and is associated with an agent.
    """
    __tablename__ = "threads"
    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    agent_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=_get_utc_now)
    updated_at = Column(DateTime, default=_get_utc_now, onupdate=_get_utc_now)


class Message(Base):
    """
    Represents a message within a thread.
    Messages can contain optional widget definitions (as JSON) for dynamic UI rendering.
    """
    __tablename__ = "messages"
    id = Column(String, primary_key=True)
    thread_id = Column(String, ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    sender = Column(String, nullable=False)  # this means type: 'human', 'ai', or 'system'
    origin = Column(Text, nullable=False)
    text = Column(Text, nullable=False)
    widget_json = Column(JSON, nullable=True)  # JSON string containing widget schema
    created_at = Column(DateTime, default=_get_utc_now, index=True)

Index("idx_messages_thread_created", Message.thread_id, Message.created_at)

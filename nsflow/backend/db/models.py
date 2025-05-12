
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

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Session(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, index=True)
    start_time = Column(DateTime, default=datetime.now(datetime.timezone.utc))
    end_time = Column(DateTime, nullable=True)
    system_message = Column(Text)
    agent_name = Column(String)

class Interaction(Base):
    __tablename__ = "interactions"
    id = Column(Integer, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.session_id"))
    interaction_index = Column(Integer)
    human_input = Column(Text)
    final_ai_output = Column(Text)
    interaction_summary = Column(Text)
    timestamp = Column(DateTime, default=datetime.now(datetime.timezone.utc))

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True)
    session_id = Column(String)
    interaction_id = Column(Integer, nullable=True)
    type = Column(String)
    text = Column(Text)
    origin_tool = Column(String)
    instantiation_index = Column(Integer)
    timestamp = Column(DateTime, default=datetime.now(datetime.timezone.utc))

class UsageMetrics(Base):
    __tablename__ = "usage_metrics"
    id = Column(Integer, primary_key=True)
    interaction_id = Column(Integer, ForeignKey("interactions.id"))
    time_taken_in_seconds = Column(Float)
    total_cost = Column(Float)
    prompt_tokens = Column(Float)
    completion_tokens = Column(Float)
    total_tokens = Column(Float)
    successful_requests = Column(Float)

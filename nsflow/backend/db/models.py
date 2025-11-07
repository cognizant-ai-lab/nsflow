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

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text

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


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
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any

from neuro_san.internals.messages.chat_message_type import ChatMessageType


class UserMessage(BaseModel):
    """
    Represents a user message to be sent to the Neuro-SAN agent.
    Attributes:
        type (ChatMessageType): The type of the message, based on chat.proto values.
            Defaults to HUMAN. Determines how the message is interpreted by the agent.
        text (str): The actual text content of the user's message.
    """
    type: ChatMessageType = Field(
        default=ChatMessageType.HUMAN,
        description="Type of message. Corresponds to chat.proto values.",
        example=ChatMessageType.HUMAN)
    text: str = Field(..., example="Hello, what can you help me with?")


class OriginModel(BaseModel):
    tool: str
    instantiation_index: Optional[int] = 0


class ChatMessageModel(BaseModel):
    type: ChatMessageType
    text: str
    origin: Optional[List[OriginModel]] = None


class ChatHistoryModel(BaseModel):
    origin: Optional[List[OriginModel]] = None
    messages: Optional[List[ChatMessageModel]] = None


class ChatContextModel(BaseModel):
    """
    Represents the context of a chat session.
    Attributes:
        chat_histories (Dict[str, Any]): The context data for the chat session.
    """
    chat_histories: Optional[List[ChatHistoryModel]] = None


class ChatRequestModel(BaseModel):
    """
    Represents the complete payload structure for initiating a streaming chat request
    to a Neuro-SAN agent.
    Attributes:
        user_message (UserMessage): The main user message containing type and text.
        sly_data (Optional[Dict[str, Any]]): Optional structured context or metadata
            relevant to the conversation.
        chat_context (Optional[Dict[str, Any]]): Optional context for maintaining continuity
            across turns in a multi-turn conversation.
        chat_filter (Optional[Dict[str, Any]]): Optional filters or parameters to guide the
            agent's response behavior (MINIMAL, MAXIMAL).
    """
    user_message: UserMessage
    sly_data: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional structured sly_data given to the agent.",
        example={}
    )
    chat_context: Optional[ChatContextModel] = None
    chat_filter: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional filters to show the level of logs from server.",
        example={"chat_filter_type": "MAXIMAL"}
    )

# ChatMessageModel.model_rebuild()

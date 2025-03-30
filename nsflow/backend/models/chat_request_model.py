from pydantic import BaseModel
from typing import Optional, Dict, Any


class UserMessage(BaseModel):
    type: str
    text: str


class ChatRequestModel(BaseModel):
    user_message: UserMessage
    sly_data: Optional[Dict[str, Any]] = None
    chat_context: Optional[Dict[str, Any]] = None
    chat_filter: Optional[Dict[str, Any]] = None

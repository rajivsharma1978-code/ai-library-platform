from typing import Literal

from pydantic import BaseModel, Field


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    file_id: str | None = Field(
        default=None,
        description="Optional: limit retrieval to one uploaded PDF.",
    )
    top_k: int = Field(default=5, ge=1, le=10)
    history: list[ChatHistoryMessage] = Field(
        default_factory=list,
        description="Recent messages for conversational context.",
    )


class Citation(BaseModel):
    label: str
    file_id: str
    original_filename: str
    chunk_index: int
    snippet: str
    score: float


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    sources_used: int

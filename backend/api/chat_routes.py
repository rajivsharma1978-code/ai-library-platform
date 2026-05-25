from fastapi import APIRouter, HTTPException

from models.chat import ChatRequest, ChatResponse
from services.rag_service import RagService

router = APIRouter(prefix="/api/chat", tags=["Chat"])
rag_service = RagService()


@router.post("/", response_model=ChatResponse)
async def chat_with_books(body: ChatRequest):
    """
    RAG endpoint: retrieve relevant PDF passages and generate a grounded answer.

    Returns an AI answer with citations. Set OPENAI_API_KEY for LLM answers;
    otherwise uses an excerpt-based fallback.
    """
    try:
        history = [msg.model_dump() for msg in body.history]
        return rag_service.ask(
            question=body.question,
            file_id=body.file_id,
            top_k=body.top_k,
            history=history,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Chat failed: {exc}",
        ) from exc

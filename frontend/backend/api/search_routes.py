from fastapi import APIRouter, HTTPException

from ai_services.vector_store import get_vector_store
from models.search import SearchRequest, SearchResponse
from services.index_service import IndexService
from services.search_service import SearchService

router = APIRouter(prefix="/api/search", tags=["Search"])
search_service = SearchService()
index_service = IndexService()


@router.post("/", response_model=SearchResponse)
async def semantic_search(body: SearchRequest):
    """
    Search the library with a natural language query.

    Returns ranked chunks by semantic similarity (FAISS + sentence-transformers).
    """
    try:
        return search_service.search(body.query, top_k=body.top_k)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {exc}",
        ) from exc


@router.post("/rebuild")
async def rebuild_index():
    """
    Rebuild the FAISS index from all stored PDF text.

    Use this after uploading PDFs or if search returns no results.
    """
    try:
        stats = index_service.rebuild_all()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Index rebuild failed: {exc}",
        ) from exc

    return {
        "message": "Search index rebuilt",
        **stats,
        "total_chunks_in_index": get_vector_store().total_chunks,
    }


@router.get("/stats")
async def index_stats():
    """How many text chunks are currently searchable."""
    store = get_vector_store()
    return {
        "total_chunks": store.total_chunks,
        "ready": store.total_chunks > 0,
    }

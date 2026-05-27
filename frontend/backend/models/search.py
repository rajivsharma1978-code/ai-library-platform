from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    """Natural language search query."""

    query: str = Field(..., min_length=1, description="What you want to find in the library.")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of ranked results to return.")


class SearchResultItem(BaseModel):
    rank: int
    score: float = Field(description="Similarity score (higher = more relevant).")
    file_id: str
    original_filename: str
    chunk_index: int
    snippet: str


class SearchResponse(BaseModel):
    query: str
    total_results: int
    results: list[SearchResultItem]

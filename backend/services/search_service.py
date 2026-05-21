from models.search import SearchResponse, SearchResultItem
from ai_services.vector_store import get_vector_store
from utils.metadata_store import get_metadata


class SearchService:
    """Semantic search over indexed PDF chunks."""

    def search(self, query: str, top_k: int = 5) -> SearchResponse:
        query = query.strip()
        matches = get_vector_store().search(query, top_k=top_k)

        results: list[SearchResultItem] = []
        for rank, (chunk, score) in enumerate(matches, start=1):
            file_id = chunk["file_id"]
            metadata = get_metadata(file_id)
            filename = metadata.original_filename if metadata else "unknown"

            snippet = chunk["text"]
            if len(snippet) > 300:
                snippet = snippet[:300] + "..."

            results.append(
                SearchResultItem(
                    rank=rank,
                    score=round(score, 4),
                    file_id=file_id,
                    original_filename=filename,
                    chunk_index=chunk["chunk_index"],
                    snippet=snippet,
                )
            )

        return SearchResponse(
            query=query,
            total_results=len(results),
            results=results,
        )

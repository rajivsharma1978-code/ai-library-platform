from models.chat import ChatResponse, Citation
from models.search import SearchResultItem
from ai_services.rag_generator import generate_answer
from services.search_service import SearchService


class RagService:
    """Retrieval-augmented generation over indexed PDF chunks."""

    def __init__(self) -> None:
        self.search_service = SearchService()

    def _retrieve(
        self,
        question: str,
        file_id: str | None,
        top_k: int,
    ) -> list[SearchResultItem]:
        # Fetch extra results when scoping to one document.
        fetch_k = top_k * 4 if file_id else top_k
        response = self.search_service.search(question, top_k=fetch_k)
        results = response.results

        if file_id:
            results = [r for r in results if r.file_id == file_id][:top_k]
        else:
            results = results[:top_k]

        return results

    def _build_citations(self, sources: list[SearchResultItem]) -> list[Citation]:
        citations: list[Citation] = []
        for source in sources:
            label = (
                f"{source.original_filename}, passage {source.chunk_index + 1} "
                f"(relevance {source.score:.2f})"
            )
            citations.append(
                Citation(
                    label=label,
                    file_id=source.file_id,
                    original_filename=source.original_filename,
                    chunk_index=source.chunk_index,
                    snippet=source.snippet,
                    score=source.score,
                )
            )
        return citations

    def ask(
        self,
        question: str,
        file_id: str | None = None,
        top_k: int = 5,
        history: list[dict] | None = None,
    ) -> ChatResponse:
        question = question.strip()
        history = history or []

        sources = self._retrieve(question, file_id, top_k)
        answer = generate_answer(question, sources, history)
        citations = self._build_citations(sources)

        return ChatResponse(
            answer=answer,
            citations=citations,
            sources_used=len(sources),
        )

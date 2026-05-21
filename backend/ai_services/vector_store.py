import json

import faiss
import numpy as np

from ai_services.embedder import embed_texts
from utils.config import (
    CHUNKS_METADATA_FILE,
    EMBEDDING_DIMENSION,
    FAISS_INDEX_FILE,
)


class VectorStore:
    """
    FAISS-backed vector index with JSON chunk metadata.

    Chunks are the source of truth; the FAISS index is rebuilt from them.
    """

    def __init__(self) -> None:
        self.chunks: list[dict] = []
        self.index: faiss.IndexFlatIP | None = None
        self._load()

    def _load(self) -> None:
        if CHUNKS_METADATA_FILE.exists():
            with CHUNKS_METADATA_FILE.open(encoding="utf-8") as f:
                self.chunks = json.load(f)
        else:
            self.chunks = []

        self.rebuild_index(save=False)

    def rebuild_index(self, save: bool = True) -> None:
        self.index = faiss.IndexFlatIP(EMBEDDING_DIMENSION)

        if not self.chunks:
            if save:
                self._persist()
            return

        texts = [chunk["text"] for chunk in self.chunks]
        vectors = embed_texts(texts)
        self.index.add(vectors)

        if save:
            self._persist()

    def _persist(self) -> None:
        CHUNKS_METADATA_FILE.parent.mkdir(parents=True, exist_ok=True)

        with CHUNKS_METADATA_FILE.open("w", encoding="utf-8") as f:
            json.dump(self.chunks, f, indent=2)

        if self.index is not None and self.index.ntotal > 0:
            faiss.write_index(self.index, str(FAISS_INDEX_FILE))
        elif FAISS_INDEX_FILE.exists():
            FAISS_INDEX_FILE.unlink()

    def add_document_chunks(self, file_id: str, chunk_texts: list[str]) -> int:
        """Replace chunks for one document and rebuild the index."""
        self.chunks = [c for c in self.chunks if c["file_id"] != file_id]

        for i, text in enumerate(chunk_texts):
            self.chunks.append(
                {
                    "file_id": file_id,
                    "chunk_index": i,
                    "text": text,
                }
            )

        self.rebuild_index(save=True)
        return len(chunk_texts)

    def search(self, query: str, top_k: int = 5) -> list[tuple[dict, float]]:
        """Return ranked (chunk, similarity_score) pairs."""
        if self.index is None or self.index.ntotal == 0:
            return []

        query_vector = embed_texts([query])
        k = min(top_k, self.index.ntotal)
        scores, indices = self.index.search(query_vector, k)

        results: list[tuple[dict, float]] = []
        for idx, score in zip(indices[0], scores[0]):
            if idx < 0:
                continue
            results.append((self.chunks[idx], float(score)))

        return results

    @property
    def total_chunks(self) -> int:
        return len(self.chunks)


_store: VectorStore | None = None


def get_vector_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store

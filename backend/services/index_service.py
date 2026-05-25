from ai_services.vector_store import get_vector_store
from utils.config import CHUNK_OVERLAP, CHUNK_SIZE
from utils.metadata_store import list_metadata
from utils.text_chunker import chunk_text
from utils.text_storage import load_extracted_text


class IndexService:
    """Build and update the FAISS search index from document text."""

    def index_document(self, file_id: str, text: str) -> dict:
        chunks = chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP)
        count = get_vector_store().add_document_chunks(file_id, chunks)
        return {
            "file_id": file_id,
            "chunks_indexed": count,
            "indexed": count > 0,
        }

    def rebuild_all(self) -> dict:
        """Re-index every uploaded PDF from stored extracted text."""
        documents = list_metadata()
        total_chunks = 0
        indexed_docs = 0

        store = get_vector_store()
        store.chunks = []

        for doc in documents:
            text = load_extracted_text(doc.id)
            if not text.strip():
                continue
            chunks = chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP)
            for i, piece in enumerate(chunks):
                store.chunks.append(
                    {
                        "file_id": doc.id,
                        "chunk_index": i,
                        "text": piece,
                    }
                )
            total_chunks += len(chunks)
            indexed_docs += 1

        store.rebuild_index(save=True)

        return {
            "documents_indexed": indexed_docs,
            "total_chunks": total_chunks,
        }

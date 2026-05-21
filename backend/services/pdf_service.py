import uuid
from datetime import datetime, timezone

from fastapi import UploadFile

from models.pdf import PDFMetadata
from utils.file_storage import save_uploaded_pdf
from utils.metadata_store import get_metadata, list_metadata, save_metadata
from utils.pdf_extractor import extract_text_from_pdf
from services.index_service import IndexService
from utils.text_storage import save_extracted_text


class PDFService:
    """Handles the full PDF upload workflow."""

    def __init__(self) -> None:
        self.index_service = IndexService()

    async def upload_pdf(self, file: UploadFile) -> PDFMetadata:
        file_id = str(uuid.uuid4())

        saved_path = await save_uploaded_pdf(file, file_id)
        full_text, page_count = extract_text_from_pdf(saved_path)
        text_path = save_extracted_text(file_id, full_text)

        original_filename = file.filename or "document.pdf"
        preview = full_text[:300] if full_text else ""

        metadata = PDFMetadata(
            id=file_id,
            original_filename=original_filename,
            stored_filename=saved_path.name,
            file_size_bytes=saved_path.stat().st_size,
            page_count=page_count,
            text_length=len(full_text),
            text_preview=preview,
            extracted_text_path=str(text_path),
            uploaded_at=datetime.now(timezone.utc).isoformat(),
        )

        save_metadata(metadata)

        # Index extracted text for semantic search (skipped if text is empty).
        self.index_service.index_document(file_id, full_text)

        return metadata

    def get_pdf_metadata(self, file_id: str) -> PDFMetadata | None:
        return get_metadata(file_id)

    def list_pdfs(self) -> list[PDFMetadata]:
        return list_metadata()

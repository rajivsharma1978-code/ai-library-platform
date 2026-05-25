from pydantic import BaseModel, Field


class PDFMetadata(BaseModel):
    """Information stored for each uploaded PDF."""

    id: str
    original_filename: str
    stored_filename: str
    file_size_bytes: int
    page_count: int
    text_length: int
    text_preview: str = Field(
        description="First 300 characters of extracted text for quick preview.",
    )
    extracted_text_path: str
    uploaded_at: str

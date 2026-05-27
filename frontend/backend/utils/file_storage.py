from pathlib import Path

from fastapi import UploadFile

from utils.config import UPLOADS_DIR


async def save_uploaded_pdf(file: UploadFile, file_id: str) -> Path:
    """
    Save the uploaded PDF to disk.

    Files are stored as: uploads/{file_id}.pdf
    """
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

    safe_name = (file.filename or "document.pdf").replace(" ", "_")
    extension = Path(safe_name).suffix.lower() or ".pdf"
    if extension != ".pdf":
        extension = ".pdf"

    stored_path = UPLOADS_DIR / f"{file_id}{extension}"

    content = await file.read()
    stored_path.write_bytes(content)

    return stored_path

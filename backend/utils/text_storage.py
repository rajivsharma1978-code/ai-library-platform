from pathlib import Path

from utils.config import EXTRACTED_TEXT_DIR


def save_extracted_text(file_id: str, text: str) -> Path:
    """Save full extracted text to data/extracted/{file_id}.txt"""
    EXTRACTED_TEXT_DIR.mkdir(parents=True, exist_ok=True)
    text_path = EXTRACTED_TEXT_DIR / f"{file_id}.txt"
    text_path.write_text(text, encoding="utf-8")
    return text_path


def load_extracted_text(file_id: str) -> str:
    """Read extracted text for a document, or empty string if missing."""
    text_path = EXTRACTED_TEXT_DIR / f"{file_id}.txt"
    if not text_path.exists():
        return ""
    return text_path.read_text(encoding="utf-8")

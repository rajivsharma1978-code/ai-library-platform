import json
from pathlib import Path

from models.pdf import PDFMetadata
from utils.config import METADATA_FILE


def _load_all() -> dict[str, dict]:
    if not METADATA_FILE.exists():
        return {}
    with METADATA_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def save_metadata(metadata: PDFMetadata) -> None:
    """Append or update one PDF record in the JSON metadata file."""
    all_records = _load_all()
    all_records[metadata.id] = metadata.model_dump()

    METADATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with METADATA_FILE.open("w", encoding="utf-8") as f:
        json.dump(all_records, f, indent=2)


def get_metadata(file_id: str) -> PDFMetadata | None:
    record = _load_all().get(file_id)
    if record is None:
        return None
    return PDFMetadata(**record)


def list_metadata() -> list[PDFMetadata]:
    records = _load_all().values()
    return [PDFMetadata(**item) for item in records]

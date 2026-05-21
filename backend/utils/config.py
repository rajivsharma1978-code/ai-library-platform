from pathlib import Path

# Base directory is the backend folder (where you run uvicorn from).
BASE_DIR = Path(__file__).resolve().parent.parent

UPLOADS_DIR = BASE_DIR / "uploads"
EXTRACTED_TEXT_DIR = BASE_DIR / "data" / "extracted"
METADATA_FILE = BASE_DIR / "data" / "metadata.json"

FAISS_INDEX_FILE = BASE_DIR / "data" / "faiss.index"
CHUNKS_METADATA_FILE = BASE_DIR / "data" / "chunks.json"

# Lightweight model — good balance of speed and quality for beginners.
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIMENSION = 384

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

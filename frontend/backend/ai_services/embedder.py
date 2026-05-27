from sentence_transformers import SentenceTransformer

from utils.config import EMBEDDING_MODEL_NAME

_model: SentenceTransformer | None = None


def get_embedding_model() -> SentenceTransformer:
    """Load the sentence-transformers model once (lazy)."""
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _model


def embed_texts(texts: list[str]):
    """Return normalized embedding vectors as a float32 numpy array."""
    import numpy as np

    if not texts:
        return np.array([], dtype=np.float32).reshape(0, 0)

    model = get_embedding_model()
    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return np.asarray(vectors, dtype=np.float32)

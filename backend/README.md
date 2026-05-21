# AI Library Platform — Backend

FastAPI backend with PDF upload, text extraction, semantic search (FAISS + sentence-transformers).

## Folder structure

```
backend/
├── api/
│   ├── pdf_routes.py
│   ├── search_routes.py
│   └── chat_routes.py
├── services/
│   ├── pdf_service.py
│   ├── search_service.py
│   ├── index_service.py
│   └── rag_service.py
├── models/
│   ├── pdf.py
│   ├── search.py
│   └── chat.py
├── ai_services/
│   ├── embedder.py       # sentence-transformers
│   ├── vector_store.py   # FAISS index
│   └── rag_generator.py  # LLM or excerpt fallback
├── utils/
├── data/
│   ├── metadata.json
│   ├── chunks.json       # chunk metadata (source of truth)
│   ├── faiss.index       # vector index (auto-generated)
│   └── extracted/
├── main.py
└── requirements.txt
```

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

First search will download the embedding model (`all-MiniLM-L6-v2`, ~90MB).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Open API docs: http://localhost:8000/docs

## RAG chat (Chat with Books)

**POST** `/api/chat/` with JSON body:

```json
{
  "question": "What does chapter 3 say about metadata?",
  "file_id": "optional-uuid-to-scope-one-pdf",
  "top_k": 5,
  "history": [
    { "role": "user", "content": "Previous question" },
    { "role": "assistant", "content": "Previous answer" }
  ]
}
```

Returns `answer`, `citations[]`, and `sources_used`.

Set `OPENAI_API_KEY` in `.env` for full LLM answers (see `.env.example`). Without it, answers are built from retrieved excerpts.

## Semantic search

**POST** `/api/search/` with JSON body:

```json
{
  "query": "how does gradient descent work?",
  "top_k": 5
}
```

**curl:**

```bash
curl -X POST "http://localhost:8000/api/search/" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"machine learning optimization\", \"top_k\": 5}"
```

**Example response:**

```json
{
  "query": "machine learning optimization",
  "total_results": 3,
  "results": [
    {
      "rank": 1,
      "score": 0.62,
      "file_id": "...",
      "original_filename": "ml-notes.pdf",
      "chunk_index": 2,
      "snippet": "Gradient descent is used to..."
    }
  ]
}
```

Higher `score` = more semantically similar to your query.

## Other search endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/search/rebuild` | Re-index all PDFs from stored text |
| GET | `/api/search/stats` | Chunk count in the index |

## PDF upload

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/pdf/upload` | Upload PDF (auto-indexes text for search) |
| GET | `/api/pdf/` | List uploads |
| GET | `/api/pdf/{file_id}` | Get metadata |
| POST | `/api/chat/` | RAG Q&A with citations |
| GET | `/health` | Health check |

## What happens on upload

1. PDF saved to `uploads/`
2. Text extracted and saved to `data/extracted/`
3. Metadata saved to `data/metadata.json`
4. Text chunked and embedded into FAISS (`data/chunks.json` + `data/faiss.index`)

If search returns nothing, call **POST** `/api/search/rebuild` after uploading PDFs with extractable text.

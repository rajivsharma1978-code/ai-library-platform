"""AI Library Platform — backend entry point."""

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.chat_routes import router as chat_router
from api.pdf_routes import router as pdf_router
from api.search_routes import router as search_router

load_dotenv()

app = FastAPI(
    title="AI Library Platform",
    description="Backend API for the AI Library Platform.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pdf_router)
app.include_router(search_router)
app.include_router(chat_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}

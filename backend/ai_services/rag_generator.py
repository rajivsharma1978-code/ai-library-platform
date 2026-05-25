import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.search import SearchResultItem

SYSTEM_PROMPT = """You are a helpful research assistant for the National Digital Library.
Answer the user's question using ONLY the provided document excerpts.
If the excerpts do not contain enough information, say so clearly.
Be concise, accurate, and educational. Do not invent facts not supported by the excerpts."""


def _build_context_block(sources: list["SearchResultItem"]) -> str:
    blocks: list[str] = []
    for source in sources:
        blocks.append(
            f"[Source {source.rank}: {source.original_filename}, chunk {source.chunk_index + 1}]\n"
            f"{source.snippet}"
        )
    return "\n\n".join(blocks)


def _build_messages(
    question: str,
    sources: list["SearchResultItem"],
    history: list[dict],
) -> list[dict]:
    context = _build_context_block(sources)
    user_content = (
        f"Document excerpts:\n\n{context}\n\n"
        f"User question: {question}"
    )

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    for item in history[-6:]:
        messages.append({"role": item["role"], "content": item["content"]})

    messages.append({"role": "user", "content": user_content})
    return messages


def generate_with_openai(
    question: str,
    sources: list["SearchResultItem"],
    history: list[dict],
) -> str | None:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    try:
        from openai import OpenAI
    except ImportError:
        return None

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    client = OpenAI(api_key=api_key)
    messages = _build_messages(question, sources, history)

    completion = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.3,
        max_tokens=800,
    )
    return completion.choices[0].message.content or None


def generate_fallback_answer(
    question: str,
    sources: list["SearchResultItem"],
) -> str:
    if not sources:
        return (
            "I could not find relevant passages in your library for that question. "
            "Upload a PDF with extractable text, wait for indexing to finish, then try again."
        )

    intro = (
        f"Here is what your uploaded documents say about your question "
        f"(\"{question}\"):\n\n"
    )
    bullets: list[str] = []
    for source in sources[:3]:
        bullets.append(
            f"• {source.original_filename} (passage {source.chunk_index + 1}): "
            f"{source.snippet}"
        )

    outro = (
        "\n\nSee the citations below for the exact source passages. "
        "Set OPENAI_API_KEY in the backend environment for fuller AI-generated answers."
    )
    return intro + "\n".join(bullets) + outro


def generate_answer(
    question: str,
    sources: list["SearchResultItem"],
    history: list[dict],
) -> str:
    llm_answer = generate_with_openai(question, sources, history)
    if llm_answer:
        return llm_answer.strip()
    return generate_fallback_answer(question, sources)

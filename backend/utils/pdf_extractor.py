from pathlib import Path

from pypdf import PdfReader


def extract_text_from_pdf(pdf_path: Path) -> tuple[str, int]:
    """
    Read a PDF file and return (full_text, page_count).
    """
    reader = PdfReader(str(pdf_path))
    page_count = len(reader.pages)

    text_parts: list[str] = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)

    full_text = "\n\n".join(text_parts)
    return full_text, page_count

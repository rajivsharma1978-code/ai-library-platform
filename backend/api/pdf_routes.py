from fastapi import APIRouter, File, HTTPException, UploadFile

from services.pdf_service import PDFService

router = APIRouter(prefix="/api/pdf", tags=["PDF"])
pdf_service = PDFService()


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF file.

    - Saves the file to uploads/
    - Extracts text from the PDF
    - Stores metadata in data/metadata.json
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    content_type = file.content_type or ""
    if content_type and content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="File must be a PDF.")

    try:
        metadata = await pdf_service.upload_pdf(file)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process PDF: {exc}",
        ) from exc

    return {
        "message": "PDF uploaded successfully",
        "metadata": metadata.model_dump(),
    }


@router.get("/")
async def list_uploaded_pdfs():
    """List metadata for all uploaded PDFs."""
    records = pdf_service.list_pdfs()
    return {"count": len(records), "items": [r.model_dump() for r in records]}


@router.get("/{file_id}")
async def get_pdf(file_id: str):
    """Get metadata for one uploaded PDF."""
    metadata = pdf_service.get_pdf_metadata(file_id)
    if metadata is None:
        raise HTTPException(status_code=404, detail="PDF not found.")
    return metadata.model_dump()

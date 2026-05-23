import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No PDF file uploaded" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    return NextResponse.json({
      fileName: file.name,
      pages: result.pages?.length || 0,
      text: result.text || "",
    });
  } catch (error) {
    console.error("PDF extraction error:", error);

    return NextResponse.json(
      { error: "Failed to extract PDF text" },
      { status: 500 }
    );
  }
}
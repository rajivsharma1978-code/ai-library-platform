const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export type PdfUploadMetadata = {
  id: string;
  original_filename: string;
  stored_filename: string;
  file_size_bytes: number;
  page_count: number;
  text_length: number;
  text_preview: string;
  extracted_text_path: string;
  uploaded_at: string;
};

export type PdfUploadResponse = {
  message: string;
  metadata: PdfUploadMetadata;
};

function parseErrorMessage(xhr: XMLHttpRequest): string {
  try {
    const body = JSON.parse(xhr.responseText) as { detail?: unknown; message?: string };
    const { detail, message } = body;

    if (typeof detail === "string") return detail;
    if (typeof message === "string") return message;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => (typeof item === "string" ? item : (item as { msg?: string }).msg))
        .filter(Boolean)
        .join(", ");
    }
  } catch {
    // ignore parse errors
  }

  if (xhr.status === 0) {
    return "Cannot reach the server. Start the backend with: uvicorn main:app --reload --port 8000";
  }

  return `Upload failed (${xhr.status}).`;
}

/** Upload a PDF with optional progress callbacks (0–100). */
export function uploadPdf(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<PdfUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as PdfUploadResponse);
        } catch {
          reject(new Error("Invalid response from server."));
        }
        return;
      }
      reject(new Error(parseErrorMessage(xhr)));
    });

    xhr.addEventListener("error", () => {
      reject(
        new Error(
          "Network error. Check that the backend is running on " + API_BASE,
        ),
      );
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled."));
    });

    xhr.open("POST", `${API_BASE}/api/pdf/upload`);
    xhr.send(formData);
  });
}

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RagCitation = {
  label: string;
  file_id: string;
  original_filename: string;
  chunk_index: number;
  snippet: string;
  score: number;
};

export type RagChatResponse = {
  answer: string;
  citations: RagCitation[];
  sources_used: number;
};

async function parseFetchError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    const { detail } = body;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => (typeof item === "string" ? item : (item as { msg?: string }).msg))
        .filter(Boolean)
        .join(", ");
    }
  } catch {
    // ignore
  }
  return `Request failed (${response.status}).`;
}

/** Send a question to the RAG chat endpoint. */
export async function askRagChat(
  question: string,
  options?: {
    fileId?: string;
    history?: ChatHistoryMessage[];
    topK?: number;
  },
): Promise<RagChatResponse> {
  const response = await fetch(`${API_BASE}/api/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      file_id: options?.fileId ?? null,
      top_k: options?.topK ?? 5,
      history: options?.history ?? [],
    }),
  });

  if (!response.ok) {
    throw new Error(await parseFetchError(response));
  }

  return response.json() as Promise<RagChatResponse>;
}

export type SearchResultItem = {
  rank: number;
  score: number;
  file_id: string;
  original_filename: string;
  chunk_index: number;
  snippet: string;
};

export type SemanticSearchResponse = {
  query: string;
  total_results: number;
  results: SearchResultItem[];
};

/** Natural language semantic search over indexed PDF chunks. */
export async function semanticSearch(
  query: string,
  topK = 8,
): Promise<SemanticSearchResponse> {
  const response = await fetch(`${API_BASE}/api/search/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });

  if (!response.ok) {
    throw new Error(await parseFetchError(response));
  }

  return response.json() as Promise<SemanticSearchResponse>;
}

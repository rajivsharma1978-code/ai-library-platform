"use client";

import { useEffect, useRef, useState } from "react";
import { askRagChat, uploadPdf, type PdfUploadMetadata } from "@/lib/api";
import { UI_TEXT, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type UploadStatus = "idle" | "uploading" | "success" | "error";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
};

function createWelcomeMessage(content: string): ChatMessage {
  return { id: "welcome", role: "assistant", content };
}

export default function ChatWithBooksPage() {
  const { language, setLanguage } = useLanguage();
  const t = UI_TEXT[language];

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createWelcomeMessage(UI_TEXT.en.chatWelcome),
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<PdfUploadMetadata | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isUploading = uploadStatus === "uploading";

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.id === "welcome") {
        return [createWelcomeMessage(t.chatWelcome)];
      }
      return prev;
    });
  }, [t.chatWelcome]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleUploadClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      setErrorMessage(t.noFileSelected);
      setUploadStatus("error");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMessage(t.invalidFileType);
      setUploadStatus("error");
      setSuccessMessage(null);
      return;
    }

    setUploadStatus("uploading");
    setProgress(0);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await uploadPdf(file, setProgress);
      setUploadedFile(response.metadata);
      setSuccessMessage(response.message || t.uploadSuccess);
      setUploadStatus("success");
      setProgress(100);
    } catch (error) {
      setUploadStatus("error");
      setProgress(0);
      setErrorMessage(
        error instanceof Error ? error.message : "Upload failed. Please try again.",
      );
    }
  };

  const dismissError = () => {
    setErrorMessage(null);
    if (uploadStatus === "error") {
      setUploadStatus("idle");
    }
  };

  const handleChatSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = input.trim();

    if (!question) {
      setChatError(t.emptyQuestion);
      return;
    }
    if (isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };

    const historyForApi = messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setChatError(null);
    setIsLoading(true);

    try {
      const response = await askRagChat(question, {
        fileId: uploadedFile?.id,
        history: historyForApi,
      });

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.answer,
        citations:
          response.citations.length > 0
            ? response.citations.map((c) => c.label)
            : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : t.chatError,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const displayFilename = uploadedFile?.original_filename ?? "—";

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ndl-gold">
            {t.workspace}
          </p>
          <div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold text-ndl-navy">{t.chatWithBooks}</h1>
              <p className="text-sm text-slate-600">{t.chatSubtitle}</p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 sm:text-sm">
                  <span>{t.language}</span>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Language)}
                    className="bg-transparent text-slate-700 outline-none"
                    aria-label={t.language}
                  >
                    <option value="en">English</option>
                    <option value="hi">हिंदी</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={isUploading}
                  className="inline-flex cursor-pointer items-center rounded-lg bg-ndl-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ndl-navy-light disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUploading ? t.uploading : uploadedFile ? t.uploadAnother : t.uploadPdf}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  aria-hidden
                />
              </div>

              {isUploading && (
                <div className="w-full min-w-[220px] sm:max-w-xs">
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span>{t.uploadProgress}</span>
                    <span>{progress}%</span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-slate-200"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-ndl-gold transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {successMessage && uploadStatus === "success" && (
            <div
              className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"
              role="status"
            >
              <span className="font-semibold" aria-hidden>
                ✓
              </span>
              <div>
                <p className="font-semibold">{successMessage}</p>
                {uploadedFile && (
                  <p className="mt-0.5 text-emerald-700">{uploadedFile.original_filename}</p>
                )}
              </div>
            </div>
          )}

          {errorMessage && (
            <div
              className="mt-4 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
              role="alert"
            >
              <p>{errorMessage}</p>
              <button
                type="button"
                onClick={dismissError}
                className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}
        </header>

        <section className="grid min-h-[72vh] gap-4 lg:grid-cols-2">
          <article className="flex min-h-[360px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-ndl-navy">{t.pdfViewer}</h2>
              <span
                className={`max-w-[60%] truncate rounded-full px-2.5 py-1 text-xs ${
                  uploadedFile
                    ? "bg-emerald-100 font-medium text-emerald-800"
                    : "bg-slate-100 text-slate-600"
                }`}
                title={displayFilename}
              >
                {displayFilename}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center p-5">
              <div className="flex h-full min-h-[280px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                {uploadedFile ? (
                  <>
                    <p className="text-sm font-semibold text-slate-800">
                      {uploadedFile.original_filename}
                    </p>
                    <p className="mt-3 text-sm text-slate-600">
                      {uploadedFile.page_count} {t.pages}
                      {uploadedFile.text_length > 0 && (
                        <>
                          {" "}
                          · {uploadedFile.text_length.toLocaleString()} {t.characters}
                        </>
                      )}
                    </p>
                    {uploadedFile.text_preview ? (
                      <p className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-xs leading-relaxed text-slate-600">
                        {uploadedFile.text_preview}
                        {uploadedFile.text_length > 300 && "…"}
                      </p>
                    ) : (
                      <p className="mt-4 text-sm text-slate-500">{t.pdfPreviewDesc}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-700">{t.pdfPreviewMock}</p>
                    <p className="mt-2 max-w-sm text-sm text-slate-500">{t.pdfPreviewDesc}</p>
                  </>
                )}
              </div>
            </div>
          </article>

          <article className="flex min-h-[360px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-ndl-navy">{t.aiChatAssistant}</h2>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[92%] rounded-xl px-4 py-3 text-sm shadow-sm ${
                    message.role === "user"
                      ? "ml-auto bg-ndl-navy text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.citations && message.citations.length > 0 && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-600">
                      <p className="mb-1 font-semibold text-slate-700">{t.citations}</p>
                      <ul className="space-y-1">
                        {message.citations.map((citation) => (
                          <li key={citation}>- {citation}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div
                  className="max-w-[92%] rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 shadow-sm"
                  role="status"
                  aria-live="polite"
                >
                  <span className="sr-only">{t.thinking}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{t.thinking}</span>
                    <span className="flex gap-1" aria-hidden>
                      <span className="h-2 w-2 animate-bounce rounded-full bg-ndl-navy [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-ndl-navy [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-ndl-navy [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {chatError && (
              <div
                className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                role="alert"
              >
                {chatError}
              </div>
            )}

            <div className="border-t border-slate-200 p-3 sm:p-4">
              <form
                onSubmit={handleChatSubmit}
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t.chatPlaceholder}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none ring-ndl-gold/40 placeholder:text-slate-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50"
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="rounded-lg bg-ndl-gold px-4 py-2.5 text-sm font-semibold text-ndl-navy transition hover:bg-ndl-gold-light disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? t.thinking : t.send}
                </button>
              </form>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

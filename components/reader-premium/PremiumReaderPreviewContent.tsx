"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import AICompanion from "@/components/reader-premium/AICompanion";
import FloatingToolbar from "@/components/reader-premium/FloatingToolbar";
import BookOpeningAnimation from "@/components/reader-premium/BookOpeningAnimation";
import BookCover from "@/components/reader-premium/BookCover";
import { directorBooks } from "@/lib/directorBooks";
import ReaderLayout from "@/components/reader/ReaderLayout";

const PdfBookSpread = dynamic(
  () => import("@/components/reader-premium/PdfBookSpread"),
  { ssr: false }
);

// ── AI API helper ─────────────────────────────────────────────────────
async function callAskAI(
  question: string,
  bookTitle: string,
  pageNumber: number,
  content: string,
  imageDataUrl?: string
): Promise<string> {
  const res = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: `[Study Mode: Student] ${question}`,
      book: bookTitle,
      chapter: `Page ${pageNumber}`,
      content,
      ...(imageDataUrl ? { imageDataUrl } : {}),
    }),
  });
  const data = await res.json();
  return data?.answer ?? "No response. Please try again.";
}

type SpeechState = "idle" | "loading" | "speaking" | "paused";

const ZOOM_MIN = 60;
const ZOOM_MAX = 200;
const ZOOM_STEP = 20;

export default function PremiumReaderPreviewContent() {
  const [readerPage, setReaderPage] = useState(1);
  const [bookOpened, setBookOpened] = useState(false);
  const [bookOpening, setBookOpening] = useState(false);

  // AI
  const [aiResponse, setAiResponse] = useState(
    "Select text from the book, drag a region, or click a quick action."
  );
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Text selection
  const [selectedText, setSelectedText] = useState("");
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);

  // Image select mode
  const [imageSelectMode, setImageSelectMode] = useState(false);

  // Zoom + pan
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  // Read aloud
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const searchParams = useSearchParams();
  const bookId = searchParams.get("book") || "nalanda";
  const currentBook = directorBooks.find((b) => b.id === bookId) || directorBooks[0];
  const book = currentBook.title;
  const pdfPages = String(currentBook.pages);

  // Stop read aloud on page change
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeechState("idle");
    utteranceRef.current = null;
    setSelectedText("");
    setToolbarPos(null);
    window.getSelection()?.removeAllRanges();
  }, [readerPage]);

  // Reset pan when zoom returns to 100
  useEffect(() => {
    if (zoom <= 100) setPan({ x: 0, y: 0 });
  }, [zoom]);

  // ── Context helpers ──────────────────────────────────────────────
  function pageContext() {
    return `The user is reading page ${readerPage} of "${book}". No extracted text is available — answer based on the book context and question.`;
  }
  function selectionContent() {
    return selectedText.trim().length > 10
      ? `Selected text from page ${readerPage} of "${book}":\n\n${selectedText}`
      : pageContext();
  }

  // ── AI runner ────────────────────────────────────────────────────
  async function runAI(prompt: string, content?: string, imageDataUrl?: string) {
    setAiLoading(true);
    setAiResponse("AI is thinking…");
    try {
      const answer = await callAskAI(prompt, book, readerPage, content ?? pageContext(), imageDataUrl);
      setAiResponse(answer);
    } catch {
      setAiResponse("Something went wrong. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  function askPremiumAI() {
    if (!aiQuestion.trim()) return;
    const q = aiQuestion;
    setAiQuestion("");
    runAI(q, pageContext());
  }

  // ── Read Aloud ───────────────────────────────────────────────────
  async function handleReadAloud() {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (speechState === "speaking") { synth.pause(); setSpeechState("paused"); return; }
    if (speechState === "paused") { synth.resume(); setSpeechState("speaking"); return; }

    setSpeechState("loading");
    let text = "";
    try {
      text = await callAskAI(
        "Give a clear, spoken-style 3–4 sentence summary of this page, suitable for listening (no bullet points, no markdown).",
        book, readerPage, pageContext()
      );
    } catch { text = `Reading page ${readerPage} of ${book}.`; }

    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92;
    utt.onend = () => setSpeechState("idle");
    utt.onerror = () => setSpeechState("idle");
    utteranceRef.current = utt;
    synth.cancel();
    synth.speak(utt);
    setSpeechState("speaking");
  }

  function handleStopReadAloud() {
    window.speechSynthesis?.cancel();
    setSpeechState("idle");
    utteranceRef.current = null;
  }

  // ── Image capture ────────────────────────────────────────────────
  function handleImageCapture(dataUrl: string, pageNumber: number) {
    setImageSelectMode(false);
    runAI(
      `Explain what is shown in this selected region from page ${pageNumber} of "${book}". Describe key elements clearly for a student.`,
      `Image/diagram region from page ${pageNumber} of "${book}".`,
      dataUrl
    );
  }

  // ── Text selection ───────────────────────────────────────────────
  function handleMouseUp(e: React.MouseEvent) {
    if (imageSelectMode) return;
    setTimeout(() => {
      const text = window.getSelection()?.toString().trim() || "";
      if (text.length > 1) {
        setSelectedText(text);
        setToolbarPos({ x: e.clientX, y: e.clientY });
      } else {
        setSelectedText("");
        setToolbarPos(null);
      }
    }, 10);
  }

  // ── Zoom controls ────────────────────────────────────────────────
  function zoomIn() { setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX)); }
  function zoomOut() { setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN)); }
  function fitScreen() { setZoom(100); setPan({ x: 0, y: 0 }); }

  // Pan on drag when zoom > 100
  function handleCenterMouseDown(e: React.MouseEvent) {
    if (zoom <= 100) return;
    if (imageSelectMode) return;
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }
  function handleCenterMouseMove(e: React.MouseEvent) {
    if (!isPanning) return;
    setPan({
      x: panStart.current.px + (e.clientX - panStart.current.mx),
      y: panStart.current.py + (e.clientY - panStart.current.my),
    });
  }
  function handleCenterMouseUp() { setIsPanning(false); }

  // ── Opening animation ─────────────────────────────────────────────
  function openBookWithAnimation() {
    setBookOpening(true);
    setTimeout(() => { setBookOpened(true); setBookOpening(false); }, 900);
  }

  if (bookOpening) return <BookOpeningAnimation title={book} />;
  if (!bookOpened) {
    return (
      <BookCover
        title={currentBook.title} subtitle="National Digital Library AI"
        author={currentBook.author} description={currentBook.description}
        onOpen={openBookWithAnimation}
      />
    );
  }

  const readLabel =
    speechState === "loading" ? "⏳ Preparing…"
    : speechState === "speaking" ? "⏸ Pause"
    : speechState === "paused" ? "▶ Resume"
    : "🔊 Read";

  return (
    <ReaderLayout
      leftPanel={
        <div>
          <h2 className="text-2xl font-black">{currentBook.title}</h2>
          <p className="mt-3 text-sm text-slate-400">{currentBook.author}</p>
          <p className="mt-5 text-sm leading-7 text-slate-300">{currentBook.description}</p>
          <div className="mt-6 rounded-2xl bg-white/10 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Book Details</p>
            <p className="mt-3 text-sm">Pages: {currentBook.pages}</p>
            <p className="mt-2 text-sm">Language: {currentBook.language}</p>
          </div>
          <a href={currentBook.pdf} target="_blank" rel="noopener noreferrer"
            className="mt-6 inline-block rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-white">
            Open Original PDF
          </a>
        </div>
      }
      center={
        <div
          onMouseDown={handleCenterMouseDown}
          onMouseMove={handleCenterMouseMove}
          onMouseUp={(e) => { handleCenterMouseUp(); handleMouseUp(e); }}
          onMouseLeave={handleCenterMouseUp}
          style={{ cursor: zoom > 100 && !imageSelectMode ? (isPanning ? "grabbing" : "grab") : "default" }}
        >
          {/* ── Controls strip ───────────────────────────────────── */}
          <div className="mx-auto mb-3 flex max-w-[1340px] flex-wrap items-center gap-2">
            {/* Read Aloud */}
            <button onClick={handleReadAloud} disabled={speechState === "loading"}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50">
              {readLabel}
            </button>
            {(speechState === "speaking" || speechState === "paused") && (
              <button onClick={handleStopReadAloud}
                className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-700">
                ⏹ Stop
              </button>
            )}

            {/* Divider */}
            <span className="h-5 w-px bg-slate-300" />

            {/* Zoom */}
            <button onClick={zoomOut} disabled={zoom <= ZOOM_MIN}
              className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">
              −
            </button>
            <span className="min-w-[44px] text-center text-xs font-bold text-slate-700">
              {zoom}%
            </span>
            <button onClick={zoomIn} disabled={zoom >= ZOOM_MAX}
              className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">
              +
            </button>
            <button onClick={fitScreen}
              className="rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50">
              Fit
            </button>

            {/* Divider */}
            <span className="h-5 w-px bg-slate-300" />

            {/* Image select */}
            <button
              onClick={() => { setImageSelectMode((v) => !v); if (!imageSelectMode) { setSelectedText(""); window.getSelection()?.removeAllRanges(); } }}
              className={`rounded-full px-4 py-2 text-xs font-bold shadow transition-colors ${
                imageSelectMode ? "bg-blue-600 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              {imageSelectMode ? "✕ Cancel" : "📐 Select Image"}
            </button>
          </div>

          {/* ── Floating text selection toolbar ──────────────────── */}
          {selectedText && toolbarPos && (
            <FloatingToolbar
              selectedText={selectedText}
              onExplain={() => runAI("Explain the following selected text clearly for a student.", selectionContent())}
              onSummarize={() => runAI("Summarize the following selected text in concise bullet points.", selectionContent())}
              onTranslate={() => runAI("Translate the following selected text into Hindi. Return only the translation.", selectionContent())}
              onQuiz={() => runAI("Create 3 quiz questions with answers from the following selected text.", selectionContent())}
              onSaveNote={() => runAI("Convert the following into clean, structured study notes.", selectionContent())}
              onClose={() => { setSelectedText(""); setToolbarPos(null); window.getSelection()?.removeAllRanges(); }}
            />
          )}

          <PdfBookSpread
            title={book}
            pdfPath={currentBook.pdf}
            pageNumber={readerPage}
            totalPages={pdfPages}
            zoom={zoom}
            pan={pan}
            onPrevious={() => { setReaderPage((p) => Math.max(1, p - 1)); fitScreen(); }}
            onNext={() => { setReaderPage((p) => Math.min(Number(pdfPages), p + 1)); fitScreen(); }}
            imageSelectMode={imageSelectMode}
            onImageCapture={handleImageCapture}
          />
        </div>
      }
      rightPanel={
        <AICompanion
          aiResponse={aiLoading ? "AI is thinking…" : aiResponse}
          aiQuestion={aiQuestion}
          setAiQuestion={setAiQuestion}
          onAsk={askPremiumAI}
          onQuickAction={() => {}}
          bookTitle={book}
          pageNumber={readerPage}
          pageText=""
        />
      }
    />
  );
}

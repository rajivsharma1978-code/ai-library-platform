"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

// ── Supported languages ──────────────────────────────────────────────
const LANGUAGES = ["English","Hindi","Tamil","Bengali","Marathi","Telugu"] as const;
type Lang = typeof LANGUAGES[number];

async function callAskAI(
  question: string, bookTitle: string, pageNumber: number,
  content: string, language: Lang, imageDataUrl?: string
): Promise<string> {
  // "Respond ONLY in: X" — matches the regex in route.ts that injects
  // the language directive into the system prompt, which is what actually
  // enforces the language for Indian scripts.
  const langDirective = `Respond ONLY in: ${language}.`;
  const prompt = `[Study Mode: Student] ${question} ${langDirective}`;
  const res = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: prompt, book: bookTitle,
      chapter: `Page ${pageNumber}`, content,
      ...(imageDataUrl ? { imageDataUrl } : {}),
    }),
  });
  const data = await res.json();
  return data?.answer ?? "No response. Please try again.";
}

type SpeechState = "idle" | "loading" | "speaking" | "paused";
const ZOOM_MIN = 50, ZOOM_MAX = 200, ZOOM_STEP = 20;

export default function PremiumReaderPreviewContent() {
  // ── Book setup ───────────────────────────────────────────────────
  const searchParams = useSearchParams();
  const bookId = searchParams.get("book") || "nalanda";
  const currentBook = directorBooks.find((b) => b.id === bookId) || directorBooks[0];
  const book = currentBook.title;
  const totalPages = Number(currentBook.pages);
  const isSpreadBook = currentBook.layout === "spread";

  // ── Reader state ─────────────────────────────────────────────────
  // readerPage: for spread mode, this is always the LEFT page of the spread
  // (or 1 for the solo cover page). For single mode it's the page number.
  const [readerPage, setReaderPage] = useState(1);
  const [bookOpened, setBookOpened] = useState(false);
  const [bookOpening, setBookOpening] = useState(false);

  // ── Zoom / pan ───────────────────────────────────────────────────
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  // Auto-fit: computed once after first render
  const bookAreaRef = useRef<HTMLDivElement>(null);
  const autoFitDone = useRef(false);
  // Page flip animation state
  const [isFlipping, setIsFlipping] = useState(false);
  // Extracted PDF text keyed by page number — populated by PdfBookSpread
  // after each render; passed to AICompanion so quick actions have real content
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});

  // ── AI state ─────────────────────────────────────────────────────
  const [language, setLanguage] = useState<Lang>("English");
  const [aiResponse, setAiResponse] = useState(
    "Select text, drag an image region, or click a quick action."
  );
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // ── Text selection ───────────────────────────────────────────────
  const [textSelectMode, setTextSelectMode] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);

  // ── Image selection ──────────────────────────────────────────────
  const [imageSelectMode, setImageSelectMode] = useState(false);

  // ── Read Aloud ───────────────────────────────────────────────────
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // ── Go To Page ───────────────────────────────────────────────────
  const [goToInput, setGoToInput] = useState("");

  // ── Reset selection/speech on page change ────────────────────────
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeechState("idle");
    utteranceRef.current = null;
    setSelectedText("");
    setToolbarPos(null);
    window.getSelection()?.removeAllRanges();
    // Reset pan but not zoom when navigating
    setPan({ x: 0, y: 0 });
  }, [readerPage, bookId]);

  // Reset everything when book changes
  useEffect(() => {
    setReaderPage(1);
    setBookOpened(false);
    setBookOpening(false);
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setAiResponse("Select text, drag an image region, or click a quick action.");
    autoFitDone.current = false;
  }, [bookId]);

  // Reset pan when zooming back to 100
  useEffect(() => { if (zoom <= 100) setPan({ x: 0, y: 0 }); }, [zoom]);

  // ── Auto-fit: compute zoom from canvas size vs container ──────────
  const handlePageRendered = useCallback((cssW: number, cssH: number, cardW: number, cardH: number) => {
    if (autoFitDone.current) return;
    autoFitDone.current = true;
    if (cssW <= 0 || cssH <= 0 || cardW <= 0 || cardH <= 0) return;
    // bookCardRef is the <main> element inside PdfBookSpread.
    // Its dimensions include the card's own padding (p-3 ≈ 24px each side).
    // Inner usable area for canvas ≈ cardW - 56px (padding + white-box padding)
    const innerW = cardW - 56;
    const innerH = cardH - 56;
    const fitZoom = Math.min(
      Math.floor((innerW / cssW) * 100),
      Math.floor((innerH / cssH) * 100),
      100  // never auto-zoom IN beyond fit
    );
    const snapped = Math.max(40, Math.floor(fitZoom / 5) * 5);
    console.log(`[AutoFit] canvas ${cssW}×${cssH}, card ${cardW}×${cardH}, inner ${innerW}×${innerH}, fitZoom ${fitZoom}% → ${snapped}%`);
    if (snapped < 100) setZoom(snapped);
  }, []); // eslint-disable-line

  const handleTextExtracted = useCallback((texts: Record<number, string>) => {
    setPageTexts(prev => ({ ...prev, ...texts }));
    const pages = Object.keys(texts);
    const totalChars = Object.values(texts).reduce((a, b) => a + b.length, 0);
    console.log(`[AI] Text extracted for pages [${pages.join(",")}]: ${totalChars} chars total`);
  }, []);

  // ── Navigation helpers ────────────────────────────────────────────
  function triggerFlip(action: () => void) {
    setIsFlipping(true);
    setTimeout(() => {
      action();
      setTimeout(() => setIsFlipping(false), 160);
    }, 140);
  }

  function goNext() {
    triggerFlip(() => {
      autoFitDone.current = false;
      if (isSpreadBook) {
        if (readerPage === 1) { setReaderPage(2); return; }
        const next = readerPage + 2;
        if (next <= totalPages) setReaderPage(next);
      } else {
        setReaderPage((p) => Math.min(totalPages, p + 1));
      }
    });
  }
  function goPrev() {
    triggerFlip(() => {
      autoFitDone.current = false;
      if (isSpreadBook) {
        if (readerPage <= 2) { setReaderPage(1); return; }
        setReaderPage((p) => Math.max(1, p - 2));
      } else {
        setReaderPage((p) => Math.max(1, p - 1));
      }
    });
  }
  function fitScreen() { setZoom(100); setPan({ x: 0, y: 0 }); autoFitDone.current = false; }
  function goToPage(raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1 || n > totalPages) return;
    triggerFlip(() => {
      autoFitDone.current = false;
      if (isSpreadBook && n > 1) {
        setReaderPage(n % 2 === 0 ? n : n - 1);
      } else {
        setReaderPage(n);
      }
    });
    setGoToInput("");
  }

  // ── AI content helpers ────────────────────────────────────────────
  function getVisiblePageText(): string {
    if (isSpreadBook && readerPage > 1) {
      const left  = pageTexts[readerPage]  || "";
      const right = pageTexts[readerPage + 1] || "";
      const combined = [left, right].filter(Boolean).join("\n\n--- Next Page ---\n\n");
      return combined || "";
    }
    return pageTexts[readerPage] || "";
  }

  function pageContext() {
    const extracted = getVisiblePageText();
    if (extracted.length > 50) {
      const pages = isSpreadBook && readerPage > 1
        ? `pages ${readerPage}–${Math.min(readerPage + 1, totalPages)}`
        : `page ${readerPage}`;
      return `Content from ${pages} of "${book}":\n\n${extracted}`;
    }
    // Fallback when text extraction returned nothing (e.g. scanned/image PDF)
    const pages = isSpreadBook && readerPage > 1
      ? `pages ${readerPage}–${Math.min(readerPage + 1, totalPages)}`
      : `page ${readerPage}`;
    return `The user is viewing ${pages} of "${book}". ` +
      `Text extraction is unavailable for this page (possibly a scanned/image-based PDF). ` +
      `Please provide a general explanation based on the book title and page number.`;
  }

  function selectionContent() {
    return selectedText.trim().length > 10
      ? `Selected text from page ${readerPage} of "${book}":\n\n${selectedText}`
      : pageContext();
  }

  // ── AI runner ─────────────────────────────────────────────────────
  async function runAI(prompt: string, content?: string, imageDataUrl?: string) {
    setAiLoading(true);
    setAiResponse("AI is thinking…");
    try {
      const answer = await callAskAI(prompt, book, readerPage, content ?? pageContext(), language, imageDataUrl);
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
    const content = pageContext();
    console.log(`[AI] Ask: lang=${language}, page=${readerPage}, contentLen=${content.length}, q="${q}"`);
    runAI(q, content);
  }

  // ── Read Aloud ────────────────────────────────────────────────────
  async function handleReadAloud() {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (speechState === "speaking") { synth.pause(); setSpeechState("paused"); return; }
    if (speechState === "paused") { synth.resume(); setSpeechState("speaking"); return; }
    setSpeechState("loading");
    let text = "";
    try {
      text = await callAskAI(
        "Give a 3–4 sentence spoken summary of this page suitable for listening. No bullet points, no markdown.",
        book, readerPage, pageContext(), language
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
    window.speechSynthesis?.cancel(); setSpeechState("idle"); utteranceRef.current = null;
  }

  // ── Image capture ─────────────────────────────────────────────────
  function handleImageCapture(dataUrl: string, pageNumber: number) {
    setImageSelectMode(false);
    runAI(
      `Explain what is shown in this selected region from page ${pageNumber} of "${book}". Describe key elements clearly for a student.`,
      `Image/diagram region from page ${pageNumber} of "${book}".`,
      dataUrl
    );
  }

  // ── Text selection mouseUp ────────────────────────────────────────
  function handleMouseUp(e: React.MouseEvent) {
    if (!textSelectMode || imageSelectMode) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() || "";
      if (text.length < 2) {
        setSelectedText(""); setToolbarPos(null);
        return;
      }
      // Reject suspiciously large selections that are likely accidental
      // whole-page grabs (text layer covers the full page area so a stray
      // click-drag easily selects everything).
      // Threshold: 1200 chars is ~2–3 paragraphs; above that it's likely
      // an accidental select-all.
      if (text.length > 1200) {
        sel?.removeAllRanges();
        setSelectedText(""); setToolbarPos(null);
        return;
      }
      setSelectedText(text);
      setToolbarPos({ x: e.clientX, y: e.clientY });
    }, 10);
  }

  // ── Pan ───────────────────────────────────────────────────────────
  function onCenterMouseDown(e: React.MouseEvent) {
    if (zoom <= 100 || imageSelectMode || textSelectMode) return;
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }
  function onCenterMouseMove(e: React.MouseEvent) {
    if (!isPanning) return;
    setPan({ x: panStart.current.px + (e.clientX - panStart.current.mx),
              y: panStart.current.py + (e.clientY - panStart.current.my) });
  }
  function onCenterMouseUp() { setIsPanning(false); }

  // ── Opening flow ──────────────────────────────────────────────────
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

  // ── Labels ────────────────────────────────────────────────────────
  const readLabel = speechState === "loading" ? "⏳ Preparing…"
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
            Open PDF
          </a>
        </div>
      }
      center={
        <div
          ref={bookAreaRef}
          onMouseDown={onCenterMouseDown}
          onMouseMove={onCenterMouseMove}
          onMouseUp={(e) => { onCenterMouseUp(); handleMouseUp(e); }}
          onMouseLeave={onCenterMouseUp}
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            cursor: zoom > 100 && !imageSelectMode && !textSelectMode
              ? (isPanning ? "grabbing" : "grab") : "default",
          }}
        >
          {/* ── Controls strip (flex-shrink-0 so it never gets squashed) ── */}
          <div className="mx-auto mb-2 flex w-full max-w-[1340px] flex-shrink-0 flex-wrap items-center gap-2">

            {/* Read Aloud */}
            <button onClick={handleReadAloud} disabled={speechState === "loading"}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50">
              {readLabel}
            </button>
            {(speechState === "speaking" || speechState === "paused") && (
              <button onClick={handleStopReadAloud}
                className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white shadow">
                ⏹ Stop
              </button>
            )}

            <span className="h-5 w-px bg-slate-300" />

            {/* Zoom */}
            <button onClick={() => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN))} disabled={zoom <= ZOOM_MIN}
              className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">−</button>
            <span className="min-w-[44px] text-center text-xs font-bold text-slate-700">{zoom}%</span>
            <button onClick={() => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX))} disabled={zoom >= ZOOM_MAX}
              className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">+</button>
            <button onClick={fitScreen}
              className="rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50">
              Fit
            </button>

            <span className="h-5 w-px bg-slate-300" />

            {/* Go To Page */}
            <form onSubmit={(e) => { e.preventDefault(); goToPage(goToInput); }}
              className="flex items-center gap-1">
              <input
                type="number" min={1} max={totalPages} value={goToInput}
                onChange={(e) => setGoToInput(e.target.value)}
                placeholder="Page #"
                className="w-16 rounded-full bg-white px-3 py-2 text-xs text-slate-800 shadow ring-1 ring-slate-200 outline-none"
              />
              <button type="submit"
                className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50">
                Go
              </button>
            </form>

            <span className="h-5 w-px bg-slate-300" />

            {/* Text Select / Page Turn */}
            <button
              onClick={() => {
                const next = !textSelectMode;
                setTextSelectMode(next);
                if (!next) { setSelectedText(""); setToolbarPos(null); window.getSelection()?.removeAllRanges(); }
                if (next) setImageSelectMode(false);
              }}
              className={`rounded-full px-4 py-2 text-xs font-bold shadow transition-colors ${
                textSelectMode ? "bg-amber-500 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              {textSelectMode ? "📖 Page Turn" : "📝 Text Select"}
            </button>

            {/* Image Select */}
            <button
              onClick={() => {
                const next = !imageSelectMode;
                setImageSelectMode(next);
                if (next) { setTextSelectMode(false); setSelectedText(""); setToolbarPos(null); window.getSelection()?.removeAllRanges(); }
              }}
              className={`rounded-full px-4 py-2 text-xs font-bold shadow transition-colors ${
                imageSelectMode ? "bg-blue-600 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              {imageSelectMode ? "✕ Cancel" : "📐 Image Select"}
            </button>
          </div>

          {/* ── Text selection floating toolbar ───────────────── */}
          {textSelectMode && selectedText && toolbarPos && (
            <FloatingToolbar
              selectedText={selectedText}
              onExplain={() => runAI(`Explain the following selected text clearly for a student. Respond ONLY in: ${language}.`, selectionContent())}
              onSummarize={() => runAI(`Summarize the following selected text in concise bullet points. Respond ONLY in: ${language}.`, selectionContent())}
              onTranslate={() => runAI(`Rewrite and explain the following selected text in ${language} script. Write everything in ${language}. Respond ONLY in: ${language}.`, selectionContent())}
              onQuiz={() => runAI(`Create 3 quiz questions with answers from the following selected text. Respond ONLY in: ${language}.`, selectionContent())}
              onSaveNote={() => runAI(`Convert the following into clean study notes. Respond ONLY in: ${language}.`, selectionContent())}
              onClose={() => { setSelectedText(""); setToolbarPos(null); window.getSelection()?.removeAllRanges(); }}
            />
          )}

          {/* ── PDF Spread (flex-1 min-h-0: fills remaining height) ── */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <PdfBookSpread
              title={book}
              pdfPath={currentBook.pdf}
              pageNumber={readerPage}
              totalPages={String(totalPages)}
              layoutMode={isSpreadBook ? "spread" : "single"}
              zoom={zoom}
              pan={pan}
              textSelectMode={textSelectMode}
              imageSelectMode={imageSelectMode}
              onImageCapture={handleImageCapture}
              onPageRendered={handlePageRendered}
              onTextExtracted={handleTextExtracted}
              isFlipping={isFlipping}
              onPrevious={goPrev}
              onNext={goNext}
            />
          </div>
        </div>
      }
      rightPanel={
        <AICompanion
          aiResponse={aiLoading ? "AI is thinking…" : aiResponse}
          aiQuestion={aiQuestion}
          setAiQuestion={setAiQuestion}
          onAsk={askPremiumAI}
          onQuickAction={(label) => {
            setSelectedText(""); setToolbarPos(null);
          }}
          bookTitle={book}
          pageNumber={readerPage}
          pageText={getVisiblePageText()}
          language={language}
          onLanguageChange={setLanguage}
        />
      }
    />
  );
}

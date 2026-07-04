"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import AICompanion from "@/components/reader-premium/AICompanion";
import BookOpeningAnimation from "@/components/reader-premium/BookOpeningAnimation";
import BookCover from "@/components/reader-premium/BookCover";
import { directorBooks } from "@/lib/directorBooks";
import ReaderLayout from "@/components/reader/ReaderLayout";

const PdfBookSpread = dynamic(
  () => import("@/components/reader-premium/PdfBookSpread"),
  { ssr: false }
);

// ── Languages ────────────────────────────────────────────────────────
const LANGUAGES = ["English","Hindi","Tamil","Bengali","Marathi","Telugu"] as const;
type Lang = typeof LANGUAGES[number];

// ── ONE interaction mode enum ─────────────────────────────────────────
// Replaces textSelectMode + imageSelectMode booleans which could
// coexist and conflict. At any point EXACTLY ONE mode is active.
type InteractionMode = "none" | "text" | "image";

// ── ONE selection type ────────────────────────────────────────────────
type ActiveSelection =
  | { type: "text";  id: string; text: string;      pageNumber: number; x: number; y: number }
  | { type: "image"; id: string; imageData: string;  pageNumber: number }
  | null;

// ── AI caller ─────────────────────────────────────────────────────────
async function callAskAI(
  question: string, bookTitle: string, pageNumber: number,
  content: string, language: Lang, imageDataUrl?: string
): Promise<string> {
  const res = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: `[Study Mode: Student] ${question} Respond ONLY in: ${language}.`,
      book: bookTitle, chapter: `Page ${pageNumber}`, content,
      ...(imageDataUrl ? { imageDataUrl } : {}),
    }),
  });
  const data = await res.json();
  return data?.answer ?? "No response. Please try again.";
}

type SpeechState = "idle" | "loading" | "speaking" | "paused";
const ZOOM_MIN = 50, ZOOM_MAX = 200, ZOOM_STEP = 20;

export default function PremiumReaderPreviewContent() {
  // ── Book ──────────────────────────────────────────────────────────
  const searchParams = useSearchParams();
  const bookId = searchParams.get("book") || "nalanda";
  const currentBook = directorBooks.find((b) => b.id === bookId) || directorBooks[0];
  const book = currentBook.title;
  const totalPages = Number(currentBook.pages);
  const isSpreadBook = currentBook.layout === "spread";

  // ── Reader ────────────────────────────────────────────────────────
  const [readerPage, setReaderPage] = useState(1);
  const [bookOpened, setBookOpened] = useState(false);
  const [bookOpening, setBookOpening] = useState(false);

  // ── Zoom / pan ────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const bookAreaRef = useRef<HTMLDivElement>(null);
  const autoFitDone = useRef(false);
  const [isFlipping, setIsFlipping] = useState(false);

  // ── Page text cache ───────────────────────────────────────────────
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});

  // ── Language ──────────────────────────────────────────────────────
  const [language, setLanguage] = useState<Lang>("English");

  // ── AI ────────────────────────────────────────────────────────────
  const [aiResponse, setAiResponse] = useState(
    "Select text from the book, drag a region, or click a quick action."
  );
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // ── SINGLE INTERACTION MODE ───────────────────────────────────────
  // ONE enum. No two modes are ever both "active".
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("none");

  // ── SINGLE ACTIVE SELECTION ───────────────────────────────────────
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>(null);

  // ── Speech ────────────────────────────────────────────────────────
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // ── Go To Page ────────────────────────────────────────────────────
  const [goToInput, setGoToInput] = useState("");

  // ─────────────────────────────────────────────────────────────────
  //  SWITCH INTERACTION MODE — the ONLY way to change modes.
  //  Every toolbar button calls this. Never set individual flags directly.
  // ─────────────────────────────────────────────────────────────────
  function switchInteractionMode(newMode: InteractionMode) {
    setInteractionMode(prev => {
      if (prev === newMode) return prev; // no-op if already in this mode

      // ── Cleanup leaving previous mode ──────────────────────────
      if (prev === "text") {
        // Clear any browser text selection so it doesn't linger visually
        window.getSelection()?.removeAllRanges();
      }
      // prev === "image": ImageSelectOverlay unmounts automatically
      // because textSelectMode/imageSelectMode are derived from interactionMode

      return newMode;
    });

    // ── Clear activeSelection when switching modes ─────────────────
    // A selection belongs to the mode that created it. Switching modes
    // makes it stale — clear it so no cross-mode menu leakage occurs.
    setActiveSelection(null);

    // ── Reset pan state on every mode switch ───────────────────────
    setIsPanning(false);
  }

  // Convenience: toggle a mode (same mode → "none", different mode → that mode)
  function toggleMode(mode: InteractionMode) {
    switchInteractionMode(interactionMode === mode ? "none" : mode);
  }

  // ── Derive boolean flags from interactionMode ──────────────────────
  // PdfBookSpread still accepts these as props. They are NOT state —
  // they are computed from the single source of truth.
  const textSelectMode  = interactionMode === "text";
  const imageSelectMode = interactionMode === "image";

  // ── Floating menu is visible ONLY when selection matches mode ──────
  const showFloatingMenu =
    activeSelection !== null &&
    ((activeSelection.type === "text"  && interactionMode === "text")  ||
     (activeSelection.type === "image" && interactionMode === "image"));

  // ── resetInteractionState: clears transient drag flags ─────────────
  // Does NOT clear activeSelection or interactionMode.
  function resetInteractionState() {
    setIsPanning(false);
  }

  // ── Clear selection explicitly ──────────────────────────────────────
  function clearActiveSelection() {
    setActiveSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  // ── Page / book change cleanup ──────────────────────────────────────
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeechState("idle");
    utteranceRef.current = null;
    clearActiveSelection();
    resetInteractionState();
    setPan({ x: 0, y: 0 });
  }, [readerPage, bookId]); // eslint-disable-line

  useEffect(() => {
    setReaderPage(1);
    setBookOpened(false);
    setBookOpening(false);
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setAiResponse("Select text from the book, drag a region, or click a quick action.");
    autoFitDone.current = false;
    switchInteractionMode("none");
  }, [bookId]); // eslint-disable-line

  useEffect(() => { if (zoom <= 100) setPan({ x: 0, y: 0 }); }, [zoom]);

  // ── Auto-fit ────────────────────────────────────────────────────────
  const handlePageRendered = useCallback((cssW: number, cssH: number, cardW: number, cardH: number) => {
    if (autoFitDone.current) return;
    autoFitDone.current = true;
    if (cssW <= 0 || cssH <= 0 || cardW <= 0 || cardH <= 0) return;
    const innerW = cardW - 56, innerH = cardH - 56;
    const fitZoom = Math.min(Math.floor((innerW / cssW) * 100), Math.floor((innerH / cssH) * 100), 100);
    const snapped = Math.max(40, Math.floor(fitZoom / 5) * 5);
    if (snapped < 100) setZoom(snapped);
  }, []);

  const handleTextExtracted = useCallback((texts: Record<number, string>) => {
    setPageTexts(prev => ({ ...prev, ...texts }));
  }, []);

  // ── Visible page text ───────────────────────────────────────────────
  function getVisiblePageText(): string {
    if (isSpreadBook && readerPage > 1) {
      const l = pageTexts[readerPage] || "", r = pageTexts[readerPage + 1] || "";
      return [l, r].filter(Boolean).join("\n\n--- Next Page ---\n\n");
    }
    return pageTexts[readerPage] || "";
  }

  // ── Navigation ──────────────────────────────────────────────────────
  function triggerFlip(action: () => void) {
    setIsFlipping(true);
    setTimeout(() => { action(); setTimeout(() => setIsFlipping(false), 160); }, 140);
  }
  function goNext() {
    triggerFlip(() => {
      autoFitDone.current = false;
      if (isSpreadBook) {
        if (readerPage === 1) { setReaderPage(2); return; }
        const next = readerPage + 2;
        if (next <= totalPages) setReaderPage(next);
      } else {
        setReaderPage(p => Math.min(totalPages, p + 1));
      }
    });
  }
  function goPrev() {
    triggerFlip(() => {
      autoFitDone.current = false;
      if (isSpreadBook) {
        if (readerPage <= 2) { setReaderPage(1); return; }
        setReaderPage(p => Math.max(1, p - 2));
      } else {
        setReaderPage(p => Math.max(1, p - 1));
      }
    });
  }
  function fitScreen() { setZoom(100); setPan({ x: 0, y: 0 }); autoFitDone.current = false; }
  function goToPage(raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1 || n > totalPages) return;
    triggerFlip(() => {
      autoFitDone.current = false;
      if (isSpreadBook && n > 1) setReaderPage(n % 2 === 0 ? n : n - 1);
      else setReaderPage(n);
    });
    setGoToInput("");
  }

  // ── AI ───────────────────────────────────────────────────────────────
  async function runAI(prompt: string, content?: string, imageDataUrl?: string) {
    resetInteractionState();
    setAiLoading(true);
    setAiResponse("AI is thinking…");
    try {
      const fallback = getVisiblePageText().length > 50
        ? `Content from page ${readerPage} of "${book}":\n\n${getVisiblePageText()}`
        : `Viewing page ${readerPage} of "${book}".`;
      const answer = await callAskAI(prompt, book, readerPage, content ?? fallback, language, imageDataUrl);
      setAiResponse(answer);
    } catch {
      setAiResponse("Something went wrong. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  // ── UNIFIED SELECTION ACTION ──────────────────────────────────────────
  // ONE function. Reads ONLY from activeSelection. Never falls back to
  // page text when a selection exists. Never clears the selection.
  function handleSelectionAction(action: string) {
    if (!activeSelection) return;
    resetInteractionState();
    let prompt = "", content = "";
    let imageDataUrl: string | undefined;

    if (activeSelection.type === "text") {
      // Always embed the selected text as part of content — model cannot
      // accidentally use page context when the selection is explicit here.
      content = `SELECTED TEXT (page ${activeSelection.pageNumber} of "${book}"):\n"""\n${activeSelection.text}\n"""\nUse ONLY the text above. Do not use any other page content.`;
      switch (action) {
        case "explain":   prompt = `Explain the SELECTED TEXT above clearly for a student. Respond ONLY in: ${language}.`; break;
        case "summarize": prompt = `Summarize the SELECTED TEXT above in concise bullet points. Respond ONLY in: ${language}.`; break;
        case "translate": prompt = `Translate the SELECTED TEXT above into ${language}. Return only the translation. Respond ONLY in: ${language}.`; break;
        case "quiz":      prompt = `Create 3 quiz questions with answers from the SELECTED TEXT above. Respond ONLY in: ${language}.`; break;
        case "notes":     prompt = `Convert the SELECTED TEXT above into clean study notes. Respond ONLY in: ${language}.`; break;
        default:          prompt = `${action} Respond ONLY in: ${language}.`;
      }
    } else {
      content = `SELECTED IMAGE from page ${activeSelection.pageNumber} of "${book}". Analyze ONLY this image.`;
      imageDataUrl = activeSelection.imageData;
      switch (action) {
        case "explain":   prompt = `Explain what is shown in this SELECTED IMAGE clearly for a student. Respond ONLY in: ${language}.`; break;
        case "summarize": prompt = `Describe and summarize the key parts of this SELECTED DIAGRAM in bullet points. Respond ONLY in: ${language}.`; break;
        case "ask":       prompt = `Analyze this SELECTED IMAGE and answer student questions. Respond ONLY in: ${language}.`; break;
        default:          prompt = `${action} Respond ONLY in: ${language}.`;
      }
    }
    runAI(prompt, content, imageDataUrl);
  }

  function askPremiumAI() {
    if (!aiQuestion.trim()) return;
    const q = aiQuestion; setAiQuestion("");
    const content = getVisiblePageText().length > 50
      ? `Content from page ${readerPage} of "${book}":\n\n${getVisiblePageText()}`
      : `Viewing page ${readerPage} of "${book}".`;
    runAI(q, content);
  }

  // ── Read Aloud ────────────────────────────────────────────────────────
  async function handleReadAloud() {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (speechState === "speaking") { synth.pause(); setSpeechState("paused"); return; }
    if (speechState === "paused")  { synth.resume(); setSpeechState("speaking"); return; }
    setSpeechState("loading");
    let text = "";
    try {
      const content = getVisiblePageText().length > 50
        ? `Content from page ${readerPage} of "${book}":\n\n${getVisiblePageText()}`
        : `Viewing page ${readerPage} of "${book}".`;
      text = await callAskAI("Give a 3–4 sentence spoken summary. No markdown.", book, readerPage, content, language);
    } catch { text = `Reading page ${readerPage} of ${book}.`; }
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92;
    utt.onend = () => setSpeechState("idle");
    utt.onerror = () => setSpeechState("idle");
    utteranceRef.current = utt;
    synth.cancel(); synth.speak(utt);
    setSpeechState("speaking");
  }
  function handleStopReadAloud() {
    window.speechSynthesis?.cancel(); setSpeechState("idle"); utteranceRef.current = null;
  }

  // ── Image captured → set activeSelection (STAYS in image mode) ────────
  // Do NOT switch mode here. Staying in image mode means the user can
  // immediately see the floating menu (mode=image, selection=image) and can
  // also drag a new region to replace the selection.
  function handleImageCapture(dataUrl: string, pageNumber: number) {
    resetInteractionState();
    setActiveSelection({
      type: "image",
      id: Date.now().toString(),
      imageData: dataUrl,
      pageNumber,
    });
  }

  // ── Text selected → set activeSelection ──────────────────────────────
  function handleMouseUp(e: React.MouseEvent) {
    if (interactionMode !== "text") return;
    // Walk up DOM: ignore button/input clicks so they don't clear selection
    let node: HTMLElement | null = e.target as HTMLElement;
    while (node) {
      if (["BUTTON","INPUT","SELECT","A"].includes(node.tagName)) return;
      node = node.parentElement;
    }
    setTimeout(() => {
      const text = window.getSelection()?.toString().trim() || "";
      if (text.length < 2 || text.length > 1200) return;
      resetInteractionState();
      setActiveSelection({
        type: "text",
        id: Date.now().toString(),
        text,
        pageNumber: readerPage,
        x: e.clientX,
        y: e.clientY,
      });
    }, 10);
  }

  // ── Pan ───────────────────────────────────────────────────────────────
  function onCenterMouseDown(e: React.MouseEvent) {
    // Never start panning in a selection mode or when floating menu is visible
    if (interactionMode !== "none" || activeSelection) return;
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

  // ── Open book ─────────────────────────────────────────────────────────
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

  const readLabel = speechState === "loading" ? "⏳ Preparing…"
    : speechState === "speaking" ? "⏸ Pause"
    : speechState === "paused"   ? "▶ Resume"
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
            height: "100%", display: "flex", flexDirection: "column",
            cursor: imageSelectMode ? "crosshair"
              : textSelectMode ? "text"
              : isPanning ? "grabbing" : "grab",
          }}
        >
          {/* ── Controls strip ─────────────────────────────── */}
          <div className="mx-auto mb-2 flex w-full max-w-[1340px] flex-shrink-0 flex-wrap items-center gap-2">
            <button onClick={handleReadAloud} disabled={speechState === "loading"}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50">
              {readLabel}
            </button>
            {(speechState === "speaking" || speechState === "paused") && (
              <button onClick={handleStopReadAloud}
                className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white shadow">⏹ Stop</button>
            )}
            <span className="h-5 w-px bg-slate-300" />
            <button onClick={() => setZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN))} disabled={zoom <= ZOOM_MIN}
              className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">−</button>
            <span className="min-w-[44px] text-center text-xs font-bold text-slate-700">{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX))} disabled={zoom >= ZOOM_MAX}
              className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40">+</button>
            <button onClick={fitScreen}
              className="rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50">Fit</button>
            <span className="h-5 w-px bg-slate-300" />
            <form onSubmit={(e) => { e.preventDefault(); goToPage(goToInput); }} className="flex items-center gap-1">
              <input type="number" min={1} max={totalPages} value={goToInput}
                onChange={(e) => setGoToInput(e.target.value)} placeholder="Page #"
                className="w-16 rounded-full bg-white px-3 py-2 text-xs text-slate-800 shadow ring-1 ring-slate-200 outline-none" />
              <button type="submit"
                className="rounded-full bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow ring-1 ring-slate-200 hover:bg-slate-50">Go</button>
            </form>
            <span className="h-5 w-px bg-slate-300" />

            {/* Mode buttons — ALL use switchInteractionMode via toggleMode */}
            <button onClick={() => toggleMode("text")}
              className={`rounded-full px-4 py-2 text-xs font-bold shadow transition-colors ${
                textSelectMode ? "bg-amber-500 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              {textSelectMode ? "📖 Page Turn" : "📝 Text Select"}
            </button>
            <button onClick={() => toggleMode("image")}
              className={`rounded-full px-4 py-2 text-xs font-bold shadow transition-colors ${
                imageSelectMode ? "bg-blue-600 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              {imageSelectMode ? "✕ Cancel" : "📐 Image Select"}
            </button>
          </div>

          {/* ── UNIFIED FLOATING MENU ─────────────────────────
              Visible ONLY when activeSelection != null AND
              mode matches the selection type.
              Clicking mode buttons always hides the stale menu
              because switchInteractionMode clears activeSelection. */}
          {showFloatingMenu && activeSelection && (
            <div
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              style={{
                position: "fixed",
                top: activeSelection.type === "text"
                  ? Math.max(10, activeSelection.y - 80) : "28%",
                left: activeSelection.type === "text"
                  ? activeSelection.x : "50%",
                transform: activeSelection.type === "text"
                  ? "translate(-50%, -100%)" : "translate(-50%, -50%)",
                zIndex: 200,
                background: "rgba(255,255,255,0.97)",
                border: "1px solid #e5e0d0",
                borderRadius: 20,
                padding: "12px 14px",
                boxShadow: "0 16px 50px rgba(0,0,0,0.20)",
                backdropFilter: "blur(16px)",
                minWidth: 260,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                            marginBottom: 10, gap: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#92774a",
                            letterSpacing: "0.07em", textTransform: "uppercase",
                            maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeSelection.type === "text"
                    ? `"${activeSelection.text.slice(0, 40)}${activeSelection.text.length > 40 ? "…" : ""}"`
                    : `Image — Page ${activeSelection.pageNumber}`}
                </p>
                <button onClick={clearActiveSelection}
                  style={{ background: "#f1f0ee", border: "none", borderRadius: 999,
                            padding: "3px 10px", fontSize: 11, fontWeight: 700,
                            color: "#64748b", cursor: "pointer", flexShrink: 0 }}>
                  ✕ Clear
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {activeSelection.type === "text" ? (
                  ["explain","summarize","translate","quiz","notes"].map(action => (
                    <button key={action} onClick={() => handleSelectionAction(action)}
                      style={{ background: "#0f172a", color: "#fff", border: "none",
                                borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                fontWeight: 700, cursor: "pointer" }}>
                      { action==="explain" ? "🧠 Explain"
                      : action==="summarize" ? "📝 Summarize"
                      : action==="translate" ? "🌍 Translate"
                      : action==="quiz"      ? "❓ Quiz"
                                             : "📌 Notes" }
                    </button>
                  ))
                ) : (
                  [["explain","🔍 Explain Image"],["summarize","📊 Summarize"],["ask","❓ Ask AI"]].map(([action, label]) => (
                    <button key={action} onClick={() => handleSelectionAction(action)}
                      style={{ background: "#0f172a", color: "#fff", border: "none",
                                borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                fontWeight: 700, cursor: "pointer" }}>
                      {label}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── PDF Spread ─────────────────────────────────── */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <PdfBookSpread
              title={book}
              pdfPath={currentBook.pdf}
              pageNumber={readerPage}
              totalPages={String(totalPages)}
              layoutMode={isSpreadBook ? "spread" : "single"}
              zoom={zoom} pan={pan}
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
          aiResponse={aiResponse}
          isLoading={aiLoading}
          aiQuestion={aiQuestion}
          setAiQuestion={setAiQuestion}
          onAsk={askPremiumAI}
          onQuickAction={(label, prompt) => {
            // Quick actions in the sidebar always use VISIBLE PAGE TEXT —
            // not activeSelection. If user wants selection-specific AI,
            // they use the floating toolbar buttons.
            const content = getVisiblePageText().length > 50
              ? `Content from page ${readerPage} of "${book}":\n\n${getVisiblePageText()}`
              : `Viewing page ${readerPage} of "${book}".`;
            runAI(prompt, content);
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

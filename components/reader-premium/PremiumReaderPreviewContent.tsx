"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import AICompanion from "@/components/reader-premium/AICompanion";
import BookOpeningAnimation from "@/components/reader-premium/BookOpeningAnimation";
import BookCover from "@/components/reader-premium/BookCover";
import { directorBooks } from "@/lib/directorBooks";
import { getPublicCatalog } from "@/lib/catalog";
import { trackAIUsage, logActivity, type AIFeature } from "@/components/admin/adminData";
import ReaderLayout from "@/components/reader/ReaderLayout";
// ── Phase 2: AI Notes, Highlights, Bookmarks, Study Workspace ─────────
// Additive only — nothing below touches page turning, zoom, fullscreen,
// or the text/image selection engine above.
import {
  HighlightColor, StoredHighlight, StoredNote, StoredBookmark, RectPct,
  HIGHLIGHT_COLOR_HEX,
  loadHighlights, saveHighlights, loadNotes, saveNotes, loadBookmarks, saveBookmarks, newId,
} from "@/components/reader-premium/study/studyData";
import HighlightColorPicker from "@/components/reader-premium/study/HighlightColorPicker";
import NotePopover, { NoteAIAction } from "@/components/reader-premium/study/NotePopover";
import type { RevisionAction } from "@/components/reader-premium/study/StudyWorkspace";
import type { PageOverlayHighlight, PageOverlayNote } from "@/components/reader-premium/PdfBookSpread";

const PdfBookSpread = dynamic(
  () => import("@/components/reader-premium/PdfBookSpread"),
  { ssr: false }
);

// ── Languages ────────────────────────────────────────────────────────
const LANGUAGES = ["English","Hindi","Tamil","Bengali","Marathi","Telugu"] as const;
type Lang = typeof LANGUAGES[number];

// ── ONE interaction mode enum ─────────────────────────────────────────
// This is the ONLY thing that decides which AI context gets used.
//
// ARCHITECTURE NOTE (read this before touching selection logic):
// The user is allowed to physically drag across ANYTHING in either mode —
// text, images, diagrams, mixed content. We do not try to physically wall
// off "text" from "image" drags anymore. Both a browser text selection AND
// a cropped image CAN exist internally at the same time. The MODE alone
// decides which one the AI is allowed to see:
//   - Text Select mode  → AI uses ONLY activeSelection.text
//   - Image Select mode → AI uses ONLY activeSelection.imageData
// Every floating-toolbar button goes through ONE router — handleSelectionAction —
// which looks at interactionMode (not at browser selection, not at image
// crop) to decide which of the two mode-specific action runners to call.
type InteractionMode = "none" | "text" | "image";

// ── ONE selection type ────────────────────────────────────────────────
type ActiveSelection =
  | { type: "text";  id: string; text: string;      pageNumber: number; x: number; y: number }
  | { type: "image"; id: string; imageData: string;  pageNumber: number }
  | null;

// ── Screen-space rectangle used for drag/highlight overlays ───────────
type ScreenRect = { left: number; top: number; width: number; height: number };

// ── AI caller ─────────────────────────────────────────────────────────
async function callAskAI(
  question: string, bookTitle: string, pageNumber: number,
  content: string, language: Lang, imageDataUrl?: string,
  /** Overrides the default "Page N" chapter label sent to the AI.
   *  Selection actions pass "Selected Text" or "Selected Image" so the
   *  model uses that as its context heading instead of "Page X". */
  chapterOverride?: string
): Promise<string> {
  const res = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: `[Study Mode: Student] ${question} Respond ONLY in: ${language}.`,
      book: bookTitle,
      chapter: chapterOverride ?? `Page ${pageNumber}`,
      content,
      ...(imageDataUrl ? { imageDataUrl } : {}),
    }),
  });
  const data = await res.json();
  return data?.answer ?? "No response. Please try again.";
}

// ── AI usage tracking ────────────────────────────────────────────────
// Maps this Reader's action-name strings (used by both the floating
// toolbar and the AI Companion's quick-action buttons) onto the 6
// features Admin → AI Usage tracks. Free-form "ask" questions and image
// "ask" have no matching bucket, so they're intentionally left untracked
// by feature (still real AI calls, just not one of the 6 named ones).
function mapActionToAIFeature(action?: string): AIFeature | null {
  switch (action) {
    case "explain": return "explain";
    case "summarize": return "summarize";
    case "translate": return "translate";
    case "quiz": case "mcqs": return "quiz";
    case "flashcards": return "flashcards";
    case "notes": case "revision": return "revision";
    default: return null;
  }
}

// ── Crop a screen-space rectangle out of the current page's canvas ────
// Shared by BOTH modes: Image Select uses it directly to build the AI
// image; Text Select uses it only as an OCR fallback when the browser's
// native selection came back empty (e.g. Nalanda pages with no embedded
// text layer). This is the ONLY place canvas cropping happens — no
// duplicate crop logic lives anywhere else.
function cropCanvasRegion(
  start: { x: number; y: number },
  end: { x: number; y: number },
  pageNumber: number
): { dataUrl: string; rect: ScreenRect } | null {
  const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-pdf-page="${pageNumber}"]`);
  if (!canvas) return null;

  const canvasRect = canvas.getBoundingClientRect();
  const selLeft   = Math.max(Math.min(start.x, end.x), canvasRect.left);
  const selTop    = Math.max(Math.min(start.y, end.y), canvasRect.top);
  const selRight  = Math.min(Math.max(start.x, end.x), canvasRect.right);
  const selBottom = Math.min(Math.max(start.y, end.y), canvasRect.bottom);
  if (selRight <= selLeft || selBottom <= selTop) return null;

  // Map screen coords → canvas buffer coords (accounts for zoom + DPR)
  const bufScaleX = canvas.width  / canvasRect.width;
  const bufScaleY = canvas.height / canvasRect.height;
  const sx = Math.max(0, Math.round((selLeft   - canvasRect.left) * bufScaleX));
  const sy = Math.max(0, Math.round((selTop    - canvasRect.top)  * bufScaleY));
  const sw = Math.min(Math.round((selRight  - selLeft)  * bufScaleX), canvas.width  - sx);
  const sh = Math.min(Math.round((selBottom - selTop)   * bufScaleY), canvas.height - sy);
  if (sw < 10 || sh < 10) return null;

  const crop = document.createElement("canvas");
  crop.width = sw; crop.height = sh;
  const ctx = crop.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  let dataUrl = "";
  try { dataUrl = crop.toDataURL("image/png"); } catch { return null; }
  if (dataUrl.length < 100) return null;

  return {
    dataUrl,
    rect: { left: selLeft, top: selTop, width: selRight - selLeft, height: selBottom - selTop },
  };
}

type SpeechState = "idle" | "loading" | "speaking" | "paused";
const ZOOM_MIN = 50, ZOOM_MAX = 200, ZOOM_STEP = 20;
// Minimum pointer travel (px) before a mouse-down/up pair counts as a real
// drag. Anything below this is a plain click and must never produce a
// selection, a crop, a highlight, or the floating toolbar.
const MIN_DRAG_PX = 6;

export default function PremiumReaderPreviewContent() {
  // ── Book ──────────────────────────────────────────────────────────
  const searchParams = useSearchParams();

  // ── Hydration gate ───────────────────────────────────────────────────
  // isHydrated is false during SSR and during the client's FIRST render
  // (the one React uses to hydrate against the server markup) — those
  // two renders are therefore guaranteed identical. It only flips to
  // true in a useEffect, i.e. strictly AFTER hydration has already
  // completed successfully. Nothing below ever reads
  // localStorage/sessionStorage/window unless isHydrated is already true,
  // so the uploaded-PDF title (or any other client-only data) can never
  // leak into the server-rendered / first-client-rendered output.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // ── Unified reading experience: user-uploaded PDFs ──────────────────
  // app/read/page.tsx stores an uploaded file as a base64 data URL in
  // sessionStorage (survives both client-side navigation AND a full
  // page reload — unlike a blob: URL, which dies the moment the
  // document that created it unloads), then redirects here with
  // ?source=upload. This is the ONLY place in the whole Reader that
  // decides which "book" is active — everything downstream (PdfBookSpread,
  // AI Companion, Study Workspace, highlights, notes, bookmarks, Read
  // Aloud, translation, quiz, revision) already just consumes whatever
  // currentBook/bookId resolve to below, so none of it needed to change.
  //
  // BEFORE hydration: always the stable directorBooks default (Nalanda,
  // or whatever ?book= says) — never sessionStorage, never the uploaded
  // title. AFTER hydration: if an upload is actually present, this
  // re-evaluates on the next render (triggered by isHydrated flipping)
  // and swaps to it. That swap is a perfectly normal post-mount state
  // update, not part of hydration reconciliation, so it can never
  // produce a mismatch — this is intentionally "BookCover updates only
  // after client mount," not eliminated.
  const uploadedSource = searchParams.get("source") === "upload";
  const uploadedPdfData = isHydrated ? window.sessionStorage.getItem("ndl_uploaded_pdf_data") : null;
  const uploadedPdfName = isHydrated ? window.sessionStorage.getItem("ndl_uploaded_pdf_name") : null;
  const uploadedPdfPages = isHydrated ? window.sessionStorage.getItem("ndl_uploaded_pdf_pages") : null;
  const uploadedPdfId = isHydrated ? window.sessionStorage.getItem("ndl_uploaded_pdf_id") : null;
  // Explicit AND — requires both the URL's stated intent (?source=upload)
  // and the data actually being present, so a stale/bad link (or leftover
  // sessionStorage from a previous session) never silently hijacks a
  // normal library-book visit.
  const isUploadedBook = Boolean(isHydrated && uploadedSource && uploadedPdfData && uploadedPdfId);

  // Same before/after-hydration split as the upload data above — the
  // merged (admin-editable) catalog reads localStorage, so it's only
  // safe to use once isHydrated is true; before that, the static
  // directorBooks default keeps the first render identical to SSR.
  const catalogBooks = isHydrated ? getPublicCatalog() : directorBooks;

  const bookId = isUploadedBook ? (uploadedPdfId as string) : (searchParams.get("book") || "nalanda");
  const currentBook = isUploadedBook
    ? {
        id: uploadedPdfId as string,
        title: uploadedPdfName || "Uploaded Document",
        author: "",
        description: "",
        language: "",
        cover: "",
        // The SAME string PdfBookSpread already passes straight into
        // pdfjsLib.getDocument(pdfPath) for every catalog book — a
        // data: URL is fetchable the same way a /director-books/*.pdf
        // path is, so PdfBookSpread needed zero changes for this to work.
        pdf: uploadedPdfData as string,
        pages: Number(uploadedPdfPages) || 1,
        layout: "single" as const,
      }
    : (catalogBooks.find((b) => b.id === bookId) || catalogBooks[0]);
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

  // Tracks drag start (screen coords) — SHARED by both Text Select and
  // Image Select. Which one of the two "uses" the resulting drag is
  // decided entirely in handleMouseUp based on interactionMode, not by
  // having two separate trackers.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

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

  // ── SINGLE INTERACTION MODE — the only thing that decides which AI
  //    context (text vs image) a floating-toolbar action uses. ─────────
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("none");

  // ── SINGLE ACTIVE SELECTION ───────────────────────────────────────
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>(null);

  // ── DRAG / HIGHLIGHT VISUAL STATE ─────────────────────────────────
  // Purely presentational — never read by the AI router. What the AI
  // actually uses comes only from activeSelection, gated by interactionMode.
  //   - liveDragRect: rectangle shown WHILE the mouse is down (either mode).
  //   - selectionRects: final highlight box(es) for TEXT mode — either the
  //     real selection's getClientRects(), or (OCR path) the drag rect.
  //   - capturedImageRect: final highlight box for IMAGE mode, shown with
  //     the amber "📷 Selected" badge, same as before.
  const [liveDragRect, setLiveDragRect] = useState<ScreenRect | null>(null);
  const [selectionRects, setSelectionRects] = useState<ScreenRect[]>([]);
  const [capturedImageRect, setCapturedImageRect] = useState<ScreenRect | null>(null);

  // ── Speech ────────────────────────────────────────────────────────
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // ── Go To Page ────────────────────────────────────────────────────
  const [goToInput, setGoToInput] = useState("");

  // ── Ask About Image — custom question UI state ────────────────────
  const [askImageInput, setAskImageInput] = useState("");
  const [showAskInput, setShowAskInput] = useState(false);

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2 STATE — Highlights, Notes, Bookmarks, Study Workspace.
  // Entirely additive: none of this is read by the selection engine,
  // the page-turn engine, zoom, fullscreen, or the existing AI router
  // above. It only reads activeSelection/selectionRects/readerPage as
  // inputs once the user explicitly taps a Phase 2 button.
  // ══════════════════════════════════════════════════════════════════
  const [highlights, setHighlights] = useState<StoredHighlight[]>([]);
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [bookmarks, setBookmarks] = useState<StoredBookmark[]>([]);

  // Load from localStorage once on mount — this is what makes highlights/
  // notes/bookmarks "persist after refresh".
  useEffect(() => {
    setHighlights(loadHighlights());
    setNotes(loadNotes());
    setBookmarks(loadBookmarks());
  }, []);

  // Small popovers anchored near the current selection (shown only while
  // a text selection's floating toolbar is already showing).
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showNotePopover, setShowNotePopover] = useState(false);
  const [noteImproving, setNoteImproving] = useState(false);
  const [lastNoteWasImproved, setLastNoteWasImproved] = useState(false);

  // Which highlight is currently generating a revision card (Study tab),
  // so we can show a small per-item loading state without touching the
  // main aiLoading/aiResponse pipeline's own presentation.
  const [studyGeneratingId, setStudyGeneratingId] = useState<string | null>(null);

  // Briefly pulses the matching highlight/note overlay after "jump to
  // page" from the Study tab, as a lightweight stand-in for "scroll to
  // highlight" in a reader where each page IS the viewport.
  const [flashItemId, setFlashItemId] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────
  //  SWITCH INTERACTION MODE — the ONLY way to change modes.
  //  Every toolbar button calls this. Never set individual flags directly.
  // ─────────────────────────────────────────────────────────────────
  function switchInteractionMode(newMode: InteractionMode) {
    setInteractionMode(prev => {
      if (prev === newMode) return prev; // no-op if already in this mode
      if (newMode === "image") {
        // Image Select must never let a pre-existing native text selection
        // linger into the new mode — clear it the instant the mode turns on.
        window.getSelection()?.removeAllRanges();
      }
      // Text mode / "none": deliberately do NOT touch window.getSelection()
      // here — Text Select is allowed to coexist with whatever the browser
      // is doing, and the AI router only ever reads activeSelection anyway.
      return newMode;
    });

    // ── Clear activeSelection when switching modes ─────────────────
    // A selection belongs to the mode that created it. Switching modes
    // makes it stale — clear it so no cross-mode menu leakage occurs.
    setActiveSelection(null);
    setSelectionRects([]);
    setLiveDragRect(null);
    setCapturedImageRect(null);
    setIsPanning(false);
    dragStartRef.current = null;
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
    setShowAskInput(false);
    setAskImageInput("");
    setSelectionRects([]);
    setLiveDragRect(null);
    setCapturedImageRect(null);
    setShowColorPicker(false);
    setShowNotePopover(false);
  }

  // ── Page / book change cleanup ──────────────────────────────────────
  // Runs on EVERY page turn (Next/Previous/Go-to-page) and book switch.
  // Must fully reset drag/selection state — otherwise a drag that was
  // (even accidentally) left mid-flight can resurface as a phantom
  // selection once the new page has rendered and the mouse next moves,
  // with no new mousedown/drag having happened on the new page at all.
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeechState("idle");
    utteranceRef.current = null;
    clearActiveSelection();   // activeSelection, highlights, ask-input, floating toolbar
    resetInteractionState();  // isPanning
    dragStartRef.current = null; // drag anchor — never carry a stale one to the new page
    setLiveDragRect(null);
    window.getSelection()?.removeAllRanges(); // native browser selection
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

  // ══════════════════════════════════════════════════════════════════
  // ENTIRE BOOK scope — full-book text extraction with a graceful
  // metadata-based fallback for image-heavy/scanned books (e.g. Nalanda),
  // where per-page extraction yields little or no real text. This is
  // self-contained (its own pdfjs-dist load, independent of
  // PdfBookSpread's own rendering pipeline) so it never touches or risks
  // the existing page-rendering code.
  // ══════════════════════════════════════════════════════════════════
  const MAX_FULL_BOOK_CHARS = 12000;
  const WEAK_BOOK_TEXT_THRESHOLD = 300;

  async function extractFullBookText(): Promise<{ text: string; weak: boolean }> {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const pdf = await pdfjsLib.getDocument(currentBook.pdf).promise;
      const numPages = pdf.numPages || totalPages;

      let combined = "";
      let pagesWithText = 0;

      for (let i = 1; i <= numPages; i++) {
        if (combined.length >= MAX_FULL_BOOK_CHARS) break;
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = (textContent.items as any[])
            .map((item: any) => item.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          if (pageText.length > 10) {
            pagesWithText++;
            combined += `\n\n[Page ${i}]\n${pageText}`;
          }
        } catch {
          // One unreadable page shouldn't abort the whole extraction —
          // skip it and keep going.
        }
      }

      const trimmed = combined.trim().slice(0, MAX_FULL_BOOK_CHARS);
      // "Weak" covers both a mostly-empty extraction AND a book where only
      // a handful of pages produced any real text at all (e.g. an
      // illustrated/scanned book where embedded text is sparse or absent) —
      // either way, page-by-page extraction alone isn't a reliable basis
      // for a whole-book quiz.
      const weak = trimmed.length < WEAK_BOOK_TEXT_THRESHOLD || pagesWithText < Math.max(1, Math.ceil(numPages * 0.15));
      return { text: trimmed, weak };
    } catch (err) {
      console.error("[EntireBookQuiz] Full-book extraction failed:", err);
      return { text: "", weak: true };
    }
  }

  // Fallback grounding for weak/scanned books: book metadata (title,
  // author, description, language) plus any page text ALREADY cached
  // from pages the user has actually viewed (pageTexts) — every bit of
  // real content helps ground the quiz rather than relying purely on
  // guesswork from the title alone.
  function buildBookMetadataContext(): string {
    const metaLines = [
      `Book Title: ${currentBook.title}`,
      currentBook.author ? `Author: ${currentBook.author}` : "",
      currentBook.description ? `Description: ${currentBook.description}` : "",
      currentBook.language ? `Language: ${currentBook.language}` : "",
    ].filter(Boolean).join("\n");

    const cachedPages = Object.entries(pageTexts)
      .filter(([, txt]) => txt && txt.trim().length > 10)
      .map(([pageNum, txt]) => `[Page ${pageNum}]\n${txt.trim()}`)
      .join("\n\n");

    return [metaLines, cachedPages].filter(Boolean).join("\n\n");
  }

  // The "entire book" quiz action, wired from AICompanion's Quick Actions.
  // Distinct from the existing page-scoped Quiz action (unchanged) — this
  // is the new fourth scope alongside current page / visible pages /
  // selected text.
  async function runEntireBookQuiz() {
    resetInteractionState();
    setAiLoading(true);
    setAiResponse("Reading the entire book…");

    const { text, weak } = await extractFullBookText();

    const context = weak
      ? buildBookMetadataContext()
      : `Full text extracted from "${book}" (may be capped for length):\n\n${text}`;

    // Explicit, hard instruction: never refuse, never ask the user for
    // page content, never cite "I only have page X" — always produce a
    // complete quiz from whatever context is actually available.
    const scopeInstruction = weak
      ? `IMPORTANT: Page-by-page text extraction for this book was limited or unavailable — it is likely an illustrated or scanned book. You have been given the book's title, description, and any available page context instead. Using ONLY this context, generate a broad, useful quiz based on the book's known theme and content. Do NOT say you only have access to one page, do NOT ask the user to provide more page content, and do NOT refuse to generate the quiz — always produce a complete quiz. Begin your response with exactly this sentence: "Here is a broad quiz based on the available book context and visible content."`
      : `You have been given text extracted from across the entire book (possibly capped for length). Create a quiz that draws from the WHOLE book, not just one page — never say you only have access to a single page.`;

    const prompt = `${scopeInstruction} Create exactly 8 multiple-choice quiz questions covering the entire book "${book}". Respond ONLY in: ${language}.`;

    await runAI(prompt, context, undefined, "Entire Book Quiz", "quiz");
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
  async function runAI(prompt: string, content?: string, imageDataUrl?: string, chapterOverride?: string, action?: string) {
    resetInteractionState();
    setAiLoading(true);
    setAiResponse("AI is thinking…");
    try {
      const fallback = getVisiblePageText().length > 50
        ? `Content from page ${readerPage} of "${book}":\n\n${getVisiblePageText()}`
        : `Viewing page ${readerPage} of "${book}".`;
      const answer = await callAskAI(
        prompt, book, readerPage, content ?? fallback, language, imageDataUrl, chapterOverride
      );
      setAiResponse(answer);
      const feature = mapActionToAIFeature(action);
      if (feature) {
        trackAIUsage(feature);
        logActivity("ai", `AI ${action} used while reading "${book}"`);
      }
    } catch {
      setAiResponse("Something went wrong. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  // ── TEXT-MODE ACTION RUNNER ───────────────────────────────────────────
  // Uses ONLY the selected text. Never touches imageData, even if an
  // image crop happens to exist internally alongside it.
  function runTextSelectionAction(text: string, pageNumber: number, action: string) {
    const content = `SELECTED TEXT (page ${pageNumber} of "${book}"):\n"""\n${text}\n"""\nUse ONLY the text above. Do not use any other page content.`;
    let prompt = "";
    switch (action) {
      case "explain":   prompt = `Explain the SELECTED TEXT above clearly for a student. Respond ONLY in: ${language}.`; break;
      case "summarize": prompt = `Summarize the SELECTED TEXT above in concise bullet points. Respond ONLY in: ${language}.`; break;
      case "translate": prompt = `Translate the SELECTED TEXT above into ${language}. Return only the translation. Respond ONLY in: ${language}.`; break;
      case "quiz":      prompt = `Create 3 quiz questions with answers from the SELECTED TEXT above. Respond ONLY in: ${language}.`; break;
      case "notes":     prompt = `Convert the SELECTED TEXT above into clean study notes. Respond ONLY in: ${language}.`; break;
      case "flashcards": prompt = `Create 5 flashcards (FRONT: / BACK: format) from the SELECTED TEXT above. Respond ONLY in: ${language}.`; break;
      case "mcqs":       prompt = `Create 5 multiple-choice questions (with 4 options each and the correct answer marked) from the SELECTED TEXT above. Respond ONLY in: ${language}.`; break;
      case "revision":   prompt = `Create concise revision notes (headings + short bullet points) from the SELECTED TEXT above, suitable for quick exam revision. Respond ONLY in: ${language}.`; break;
      default:          prompt = `${action} Respond ONLY in: ${language}.`;
    }
    runAI(prompt, content, undefined, "Selected Text", action);
  }

  // ── IMAGE-MODE ACTION RUNNER ──────────────────────────────────────────
  // Uses ONLY the cropped image. Never touches selected text, even if a
  // browser text selection happens to exist internally alongside it.
  function runImageSelectionAction(imageData: string, pageNumber: number, action: string, customQuestion?: string) {
    const content = `SELECTED IMAGE from page ${pageNumber} of "${book}". Analyze ONLY this image.`;
    let prompt = "";
    switch (action) {
      case "explain":   prompt = `Explain what is shown in this SELECTED IMAGE clearly for a student. Respond ONLY in: ${language}.`; break;
      case "summarize": prompt = `Describe and summarize the key parts of this SELECTED DIAGRAM in bullet points. Respond ONLY in: ${language}.`; break;
      case "ask":
        prompt = customQuestion
          ? `${customQuestion} Focus on this specific image/diagram. Respond ONLY in: ${language}.`
          : `Analyze this SELECTED IMAGE and answer student questions. Respond ONLY in: ${language}.`;
        break;
      default:          prompt = `${action} Respond ONLY in: ${language}.`;
    }
    runAI(prompt, content, imageData, `Selected Image (page ${pageNumber})`, action);
  }

  // ── THE ROUTER — every floating-toolbar button goes through this. ────
  // No button, anywhere, directly inspects window.getSelection() or an
  // image crop. This function alone decides, based on interactionMode,
  // which of the two mode-specific runners above gets called. This is
  // the ONLY place that maps "which mode is on" → "which AI context to use".
  function handleSelectionAction(action: string, customQuestion?: string) {
    if (!activeSelection) return;
    resetInteractionState();

    if (interactionMode === "text") {
      // Defensive: activeSelection should always already be type "text"
      // here (it's only ever created that way while in text mode), but we
      // never trust anything other than the mode itself for routing.
      if (activeSelection.type !== "text") return;
      return runTextSelectionAction(activeSelection.text, activeSelection.pageNumber, action);
    }

    if (interactionMode === "image") {
      if (activeSelection.type !== "image") return;
      return runImageSelectionAction(activeSelection.imageData, activeSelection.pageNumber, action, customQuestion);
    }
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
      trackAIUsage("summarize");
      logActivity("ai", `AI Read Aloud summary generated for "${book}"`);
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

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2 — Highlights, Notes, Bookmarks, Study Workspace, Revision
  // Cards. Everything in this block is additive: it reads the existing
  // activeSelection/selectionRects/readerPage (produced by the untouched
  // selection engine below) as INPUT, and calls the existing runAI-style
  // machinery for revision cards, but never modifies how a selection or
  // a page turn is created.
  // ══════════════════════════════════════════════════════════════════

  // Convert a screen-space rect into a fraction of the CURRENT page
  // canvas's own bounding box, so it can be re-projected correctly later
  // regardless of zoom level or window size.
  function screenRectToPct(rect: ScreenRect, pageNumber: number): RectPct | null {
    const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-pdf-page="${pageNumber}"]`);
    if (!canvas) return null;
    const c = canvas.getBoundingClientRect();
    if (c.width <= 0 || c.height <= 0) return null;
    return {
      left:   (rect.left - c.left) / c.width,
      top:    (rect.top  - c.top)  / c.height,
      width:  rect.width  / c.width,
      height: rect.height / c.height,
    };
  }

  // Note: the inverse (percentage → screen rect) is no longer needed here.
  // PdfBookSpread now renders highlight/note overlays directly from the
  // stored percentages, inside its own page container — there is no
  // separate "project back to screen coordinates" step anymore.

  // ── FEATURE 1: Kindle-style Highlights ──────────────────────────────
  function addHighlight(color: HighlightColor) {
    if (!activeSelection || activeSelection.type !== "text") return;
    let sourceRects = selectionRects;
    // Defensive fallback: selectionRects is the snapshot the selection
    // engine captured at drag-time. If it's ever empty when the color is
    // picked (should not normally happen, but a highlight must never be
    // silently saved with zero visible area), fall back to whatever the
    // browser's live selection reports right now.
    if (sourceRects.length === 0) {
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          sourceRects = Array.from(sel.getRangeAt(0).getClientRects()).map(r => ({
            left: r.left, top: r.top, width: r.width, height: r.height,
          }));
        }
      } catch {}
    }
    const rectsPct = sourceRects
      .map(r => screenRectToPct(r, activeSelection.pageNumber))
      .filter((r): r is RectPct => r !== null);
    const highlight: StoredHighlight = {
      id: newId(),
      bookId,
      page: activeSelection.pageNumber,
      selectedText: activeSelection.text,
      color,
      createdAt: Date.now(),
      rectsPct,
    };
    setHighlights(prev => {
      const next = [...prev, highlight];
      saveHighlights(next);
      return next;
    });
    setShowColorPicker(false);
  }

  function removeHighlight(id: string) {
    setHighlights(prev => {
      const next = prev.filter(h => h.id !== id);
      saveHighlights(next);
      return next;
    });
  }

  // ── FEATURE 2 & 3: Notes + AI Notes ─────────────────────────────────
  function saveNote(text: string, aiImproved: boolean) {
    if (!activeSelection || activeSelection.type !== "text") return;
    const rectPct = selectionRects[0] ? screenRectToPct(selectionRects[0], activeSelection.pageNumber) ?? undefined : undefined;
    const note: StoredNote = {
      id: newId(),
      bookId,
      page: activeSelection.pageNumber,
      selectedText: activeSelection.text,
      note: text,
      createdAt: Date.now(),
      rectPct,
      aiImproved,
    };
    setNotes(prev => {
      const next = [...prev, note];
      saveNotes(next);
      return next;
    });
    setShowNotePopover(false);
  }

  function removeNote(id: string) {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id);
      saveNotes(next);
      return next;
    });
  }

  // "✨ Improve with AI" inside the note popover — expand / simplify /
  // exam notes / revision notes, all grounded in the SAME selected text
  // the note is attached to (never the whole page).
  async function improveNoteWithAI(action: NoteAIAction, currentText: string): Promise<string> {
    if (!activeSelection || activeSelection.type !== "text") return currentText;
    setNoteImproving(true);
    try {
      const basis = currentText.trim()
        ? `The student's current note is:\n"""\n${currentText}\n"""\nIt is based on this passage from the book:\n"""\n${activeSelection.text}\n"""`
        : `Base this on the following passage from the book:\n"""\n${activeSelection.text}\n"""`;
      let instruction = "";
      switch (action) {
        case "expand":   instruction = "Expand the note with more helpful detail and context."; break;
        case "simplify": instruction = "Simplify the note into short, plain-language sentences."; break;
        case "exam":     instruction = "Rewrite the note as focused exam-prep notes (key facts, definitions, likely exam points)."; break;
        case "revision": instruction = "Rewrite the note as concise revision notes (headings + short bullet points)."; break;
      }
      const res = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `${basis}\n\n${instruction} Respond ONLY in: ${language}. Return ONLY the note text — no preamble.`,
          book, chapter: "Note", content: activeSelection.text,
        }),
      });
      const data = await res.json();
      const improved = (data?.answer as string) ?? currentText;
      setLastNoteWasImproved(true);
      trackAIUsage("revision");
      logActivity("ai", `AI improved a note ("${action}") for "${book}"`);
      return improved;
    } catch {
      return currentText;
    } finally {
      setNoteImproving(false);
    }
  }

  // ── FEATURE 4: Bookmarks ────────────────────────────────────────────
  function addBookmark(title?: string) {
    const bookmark: StoredBookmark = {
      id: newId(), bookId, page: readerPage, title, createdAt: Date.now(),
    };
    setBookmarks(prev => {
      const next = [...prev, bookmark];
      saveBookmarks(next);
      return next;
    });
  }
  function removeBookmark(id: string) {
    setBookmarks(prev => {
      const next = prev.filter(b => b.id !== id);
      saveBookmarks(next);
      return next;
    });
  }
  const isCurrentPageBookmarked = bookmarks.some(b => b.bookId === bookId && b.page === readerPage);
  function toggleBookmarkCurrentPage() {
    const existing = bookmarks.find(b => b.bookId === bookId && b.page === readerPage);
    if (existing) removeBookmark(existing.id);
    else addBookmark();
  }

  // ── FEATURE 5: Study Workspace — jump + "scroll to" (flash) ─────────
  function studyJumpToPage(page: number, flashId?: string) {
    if (page !== readerPage) goToPage(String(page));
    if (flashId) {
      setFlashItemId(flashId);
      setTimeout(() => setFlashItemId(id => (id === flashId ? null : id)), 1800);
    }
  }

  // ── FEATURE 6: Revision Cards from any highlight ────────────────────
  // Reuses the EXISTING text-mode action runner unchanged for the actions
  // it already supports (flashcards); "mcqs" and "revision" are new cases
  // added to that runner's switch statement (additive only — see
  // runTextSelectionAction above).
  async function generateFromHighlight(highlight: StoredHighlight, action: RevisionAction) {
    setStudyGeneratingId(highlight.id);
    try {
      runTextSelectionAction(highlight.selectedText, highlight.page, action);
    } finally {
      setStudyGeneratingId(null);
    }
  }

  // ── Persisted highlights/notes → PdfBookSpread's page-local overlay
  // props ──────────────────────────────────────────────────────────────
  // No effects, no getBoundingClientRect(), no fixed-position math, no
  // recompute timing to get right — these are just plain derived values,
  // recalculated fresh on every render like any other derived JSX data.
  // PdfBookSpread renders them INSIDE its own PageBox (the exact container
  // that owns the canvas), as percentage-based absolute positioning, which
  // is why none of that machinery is needed anymore: percentages inside
  // the same box automatically stay correct across zoom, fullscreen, and
  // page turns with zero extra JS.
  const currentBookHighlights = highlights.filter(h => h.bookId === bookId);
  const currentBookNotes = notes.filter(n => n.bookId === bookId && n.rectPct);

  const pageHighlightsForSpread: PageOverlayHighlight[] = currentBookHighlights.map(h => ({
    id: h.id,
    page: h.page,
    fill: HIGHLIGHT_COLOR_HEX[h.color].fill,
    border: HIGHLIGHT_COLOR_HEX[h.color].border,
    rectsPct: h.rectsPct,
    flashing: flashItemId === h.id,
  }));
  const pageNotesForSpread: PageOverlayNote[] = currentBookNotes.map(n => ({
    id: n.id,
    page: n.page,
    rectPct: n.rectPct as RectPct,
    flashing: flashItemId === n.id,
  }));

  // ── TEMPORARY DEBUG (Phase 2 highlight-overlay bugfix) ───────────────
  // Safe to remove once highlight rendering is confirmed working.
  if (typeof window !== "undefined" && currentBookHighlights.length > 0) {
    console.log(
      `[HighlightOverlay] ${currentBookHighlights.length} highlight(s) loaded for book="${bookId}", viewing page ${readerPage}`,
      currentBookHighlights.map(h => ({ id: h.id, page: h.page, color: h.color, rectsPct: h.rectsPct }))
    );
  }

  // ── Unified drag finalize (mouseup) ───────────────────────────────────
  // ONE handler for BOTH modes. It always knows both what a drag physically
  // covered on screen; which of the two things it produces (text selection
  // vs image crop) is decided purely by interactionMode — never by what's
  // physically under the drag (text, image, diagram, mixed all behave the
  // same way).
  function handleMouseUp(e: React.MouseEvent) {
    if (interactionMode !== "text" && interactionMode !== "image") return;

    // Clear drag-tracking state FIRST, unconditionally — before any early
    // return below. Previously this happened AFTER the "was this a click
    // on a UI control" check, so releasing the mouse over the Next/Previous
    // button (a completely normal thing to do while a select mode is on)
    // left dragStartRef pointing at stale coordinates. The next mousemove
    // — even with no new mousedown — would then see a "drag in progress"
    // and could go on to fabricate a selection out of nothing.
    const dragStart = dragStartRef.current;
    dragStartRef.current = null;
    const endX = e.clientX, endY = e.clientY;
    setLiveDragRect(null);

    // A mouseup that lands on a UI control (button/input/select/link) is a
    // click, not a selection drag — abort here, but only AFTER the drag
    // state above has already been reset.
    let node: HTMLElement | null = e.target as HTMLElement;
    while (node) {
      if (["BUTTON","INPUT","SELECT","A"].includes(node.tagName)) {
        setSelectionRects([]);
        setCapturedImageRect(null);
        if (interactionMode === "image") window.getSelection()?.removeAllRanges();
        return;
      }
      node = node.parentElement;
    }

    // ── HARD GATE: require a real drag before anything is finalized ────
    // Applies identically to both modes — a plain click never produces a
    // selection, a crop, a highlight, or the floating toolbar.
    const dragDistance = dragStart
      ? Math.hypot(endX - dragStart.x, endY - dragStart.y)
      : 0;
    if (!dragStart || dragDistance < MIN_DRAG_PX) {
      setSelectionRects([]);
      setCapturedImageRect(null);
      return;
    }

    const mode = interactionMode; // snapshot — OCR path below is async

    // ══════════════════════════════════════════════════════════════════
    // IMAGE SELECT MODE — always produce an image crop from the drag,
    // regardless of what's underneath (text, diagram, mixed content).
    // A browser text selection may exist internally at the same time;
    // it is never read here.
    // ══════════════════════════════════════════════════════════════════
    if (mode === "image") {
      // Image mode must never surface a text selection — clear anything
      // the browser may have created internally during the drag (the
      // pointerdown/move preventDefault below should already stop most of
      // it, but this guarantees it) and never look at it again.
      window.getSelection()?.removeAllRanges();
      const cropped = cropCanvasRegion(dragStart, { x: endX, y: endY }, readerPage);
      if (!cropped) { setCapturedImageRect(null); return; }
      setCapturedImageRect(cropped.rect);
      setActiveSelection({
        type: "image",
        id: Date.now().toString(),
        imageData: cropped.dataUrl,
        pageNumber: readerPage,
      });
      return;
    }

    // ══════════════════════════════════════════════════════════════════
    // TEXT SELECT MODE — always produce selected TEXT from the drag,
    // regardless of what's underneath. An image crop may be computed
    // internally as a fallback path (below), but the AI never sees it —
    // only activeSelection.text is ever used by the router.
    // ══════════════════════════════════════════════════════════════════
    const sel = window.getSelection();
    const selText = sel?.toString().trim() || "";
    if (selText.length >= 2 && selText.length <= 1200) {
      let rects: ScreenRect[] = [];
      try {
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          rects = Array.from(range.getClientRects()).map(r => ({
            left: r.left, top: r.top, width: r.width, height: r.height,
          }));
        }
      } catch {}
      setSelectionRects(rects);
      setActiveSelection({
        type: "text", id: Date.now().toString(),
        text: selText, pageNumber: readerPage, x: endX, y: endY,
      });
      return;
    }

    // No native browser selection came back (e.g. Nalanda pages with no
    // embedded text layer) — fall back to OCR on the dragged region. The
    // crop here is used ONLY to extract text; the resulting activeSelection
    // is still type "text", never type "image".
    const cropped = cropCanvasRegion(dragStart, { x: endX, y: endY }, readerPage);
    if (!cropped) return;
    setSelectionRects([cropped.rect]);

    setAiLoading(true);
    setAiResponse("Extracting text from selected region…");
    (async () => {
      try {
        const ocrText = await callAskAI(
          "Extract all readable text from this image region exactly as it appears. " +
          "Return ONLY the extracted text, preserving line breaks and spacing. " +
          "No explanation, no commentary, no formatting — just the text.",
          book, readerPage,
          `Image region from page ${readerPage} of "${book}".`,
          language, cropped.dataUrl,
          "Selected Region"
        );
        const cleaned = ocrText.trim();
        if (cleaned.length > 1) {
          setActiveSelection({
            type: "text", id: Date.now().toString(),
            text: cleaned, pageNumber: readerPage, x: endX, y: endY,
          });
          setAiResponse("Text extracted. Use the floating menu to explain, summarize, or translate.");
        } else {
          setAiResponse("No readable text found in the selected region. Try selecting a larger area.");
          setSelectionRects([]);
        }
      } catch {
        setAiResponse("Text extraction failed. Please try again.");
        setSelectionRects([]);
      } finally {
        setAiLoading(false);
      }
    })();
  }

  // ── Pan / drag-start ──────────────────────────────────────────────────
  function onCenterMouseDown(e: React.MouseEvent) {
    if (interactionMode === "text" || interactionMode === "image") {
      if (e.button !== 0) return;

      // A mousedown on a UI control (Next/Previous/zoom/Go-to-page/mode
      // buttons, etc.) must behave like a plain click, never seed a drag.
      // Without this guard, dragStartRef gets set to the button's screen
      // position; if the paired mouseup also lands on that button it used
      // to bail out before clearing the ref (fixed below too, but this is
      // the real first line of defense) — leaving a STALE drag anchor that
      // a later mousemove (e.g. right after the page-turn animation, with
      // no new mousedown at all) would mistake for an in-progress drag.
      let node: HTMLElement | null = e.target as HTMLElement;
      while (node) {
        if (["BUTTON","INPUT","SELECT","A"].includes(node.tagName)) return;
        node = node.parentElement;
      }

      if (interactionMode === "image") {
        // Image mode: never let a native text selection seed itself.
        // Clear anything present and stop the browser's own
        // selection-start default right at the source.
        window.getSelection()?.removeAllRanges();
        e.preventDefault();
      }

      dragStartRef.current = { x: e.clientX, y: e.clientY };
      // A new drag replaces whatever was previously shown, in either mode.
      setSelectionRects([]);
      setCapturedImageRect(null);
      setLiveDragRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
      return; // never start pan while a select mode is active
    }
    if (interactionMode !== "none" || activeSelection) return;
    if (e.button !== 0) return;

    // Pan must never start from a click on a toolbar button, zoom control,
    // Go-to-page input, mode toggle, Bookmark button, etc. Without this
    // guard, every button click while idle also kicked off a phantom
    // pan-drag (setIsPanning(true) with whatever tiny mouse movement
    // happened during the click), which is exactly the kind of thing that
    // makes panning feel broken/inconsistent.
    let node: HTMLElement | null = e.target as HTMLElement;
    while (node) {
      if (["BUTTON","INPUT","SELECT","A"].includes(node.tagName)) return;
      node = node.parentElement;
    }

    setIsPanning(true);
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }
  function onCenterMouseMove(e: React.MouseEvent) {
    if ((interactionMode === "text" || interactionMode === "image") && dragStartRef.current) {
      if (interactionMode === "image") {
        // Keep suppressing native selection extension for the whole drag —
        // some browsers re-evaluate/extend a selection on every mousemove
        // even after an initial preventDefault on mousedown.
        e.preventDefault();
      }
      const s = dragStartRef.current;
      setLiveDragRect({
        left: Math.min(s.x, e.clientX),
        top: Math.min(s.y, e.clientY),
        width: Math.abs(e.clientX - s.x),
        height: Math.abs(e.clientY - s.y),
      });
    }
    // Pan continuation now happens in the window-level effect below —
    // React's onMouseMove/onMouseUp props only fire while the cursor stays
    // within this div's bounds, so a fast drag that leaves the reader area
    // (over the AI panel, left panel, or outside the browser content
    // during a big zoomed-in pan) used to "get stuck" mid-drag. window
    // listeners keep firing anywhere in the viewport, including while
    // fullscreen is active, regardless of which element fullscreen wraps.
  }
  function onCenterMouseUp() { setIsPanning(false); }

  // Robust pan-drag: attach move/up listeners to the window for the
  // duration of an active pan, instead of relying solely on this div's
  // own onMouseMove/onMouseUp. This is what makes panning work reliably
  // at any zoom level and while fullscreen is active — window-level
  // listeners aren't scoped to any particular element's visible bounds.
  useEffect(() => {
    if (!isPanning) return;
    function onWindowMouseMove(e: MouseEvent) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.mx),
        y: panStart.current.py + (e.clientY - panStart.current.my),
      });
    }
    function onWindowMouseUp() { setIsPanning(false); }
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [isPanning]);

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
          style={{
            height: "100%", display: "flex", flexDirection: "column",
            cursor: imageSelectMode ? "crosshair"
              : textSelectMode ? "text"
              : isPanning ? "grabbing" : "grab",
            // Prevent panning from ever turning into a full browser-page
            // scroll/touch gesture — panning moves the inner book content
            // via the pan.x/y transform only, never the page itself.
            touchAction: "none",
            overscrollBehavior: "contain",
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
            <span className="h-5 w-px bg-slate-300" />
            {/* Phase 2 — Feature 4: Bookmarks. Bookmarks the CURRENT page;
                tapping again while already bookmarked removes it. */}
            <button onClick={toggleBookmarkCurrentPage}
              className={`rounded-full px-4 py-2 text-xs font-bold shadow transition-colors ${
                isCurrentPageBookmarked ? "bg-amber-600 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
              {isCurrentPageBookmarked ? "🔖 Bookmarked" : "🔖 Bookmark"}
            </button>
          </div>

          {/* ── DRAG / SELECTION VISUAL OVERLAYS ───────────────
              Purely presentational — position:fixed, screen coords,
              same technique as the floating menu below (both live
              outside the zoomed/transformed subtree inside
              PdfBookSpread, so screen coords already match). */}
          {(textSelectMode || imageSelectMode) && liveDragRect && liveDragRect.width > 2 && liveDragRect.height > 2 && (
            <div style={{
              position: "fixed",
              left: liveDragRect.left, top: liveDragRect.top,
              width: liveDragRect.width, height: liveDragRect.height,
              border: "2px dashed #c18a3f",
              background: "rgba(193,138,63,0.15)",
              boxSizing: "border-box", pointerEvents: "none", zIndex: 150,
            }} />
          )}
          {/* TEXT mode result — solid blue box(es), no badge */}
          {textSelectMode && selectionRects.map((r, i) => (
            <div key={i} style={{
              position: "fixed",
              left: r.left, top: r.top, width: r.width, height: r.height,
              background: "rgba(59,130,246,0.35)",
              border: "1px solid rgba(59,130,246,0.65)",
              boxSizing: "border-box", pointerEvents: "none", zIndex: 150,
            }} />
          ))}
          {/* IMAGE mode result — amber box with "Selected" badge */}
          {imageSelectMode && capturedImageRect && (
            <div style={{
              position: "fixed",
              left: capturedImageRect.left, top: capturedImageRect.top,
              width: capturedImageRect.width, height: capturedImageRect.height,
              border: "2px solid #c18a3f",
              background: "rgba(193,138,63,0.12)",
              boxSizing: "border-box", pointerEvents: "none", zIndex: 150,
            }}>
              <div style={{
                position: "absolute", top: -20, left: 0,
                background: "#c18a3f", color: "#fff",
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                whiteSpace: "nowrap",
              }}>
                📷 Selected
              </div>
            </div>
          )}

          {/* PHASE 2 highlight/note overlays are no longer rendered here —
              they're now passed as pageHighlights/pageNotes props to
              PdfBookSpread below, which paints them INSIDE its own
              PageBox (the same container that owns the canvas), using
              percentage-based absolute positioning. See PdfBookSpread.tsx
              for the actual rendering. */}

          {/* ── UNIFIED FLOATING MENU ─────────────────────────
              Visible ONLY when activeSelection != null AND
              mode matches the selection type.
              Clicking mode buttons always hides the stale menu
              because switchInteractionMode clears activeSelection. */}
          {showFloatingMenu && activeSelection && (() => {
            // Clamp menu to viewport so it never goes off-screen
            const MENU_W = 280;
            const MENU_H = activeSelection.type === "text" ? 170 : 210;
            const PAD = 12;
            const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
            const vh = typeof window !== "undefined" ? window.innerHeight : 800;

            let rawLeft: number, rawTop: number;

            if (activeSelection.type === "text") {
              // Prefer above, fall back to below
              const spaceAbove = activeSelection.y - MENU_H - PAD;
              const showAbove = spaceAbove >= PAD;
              rawTop = showAbove
                ? activeSelection.y - MENU_H - 8
                : activeSelection.y + 24;
              rawLeft = activeSelection.x - MENU_W / 2;
            } else {
              rawLeft = vw / 2 - MENU_W / 2;
              rawTop = vh * 0.28 - MENU_H / 2;
            }

            // Hard clamp to viewport
            const left = Math.max(PAD, Math.min(rawLeft, vw - MENU_W - PAD));
            const top  = Math.max(PAD, Math.min(rawTop,  vh - MENU_H - PAD));

            return (
            <div
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              style={{
                position: "fixed",
                top, left,
                zIndex: 200,
                background: "rgba(255,255,255,0.97)",
                border: "1px solid #e5e0d0",
                borderRadius: 20,
                padding: "12px 14px",
                boxShadow: "0 16px 50px rgba(0,0,0,0.20)",
                backdropFilter: "blur(16px)",
                width: MENU_W,
                boxSizing: "border-box" as const,
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
                  <>
                    {["explain","summarize","translate","quiz","notes","flashcards"].map(action => (
                      <button key={action} onClick={() => handleSelectionAction(action)}
                        style={{ background: "#0f172a", color: "#fff", border: "none",
                                  borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                  fontWeight: 700, cursor: "pointer" }}>
                        { action==="explain" ? "🧠 Explain"
                        : action==="summarize" ? "📝 Summarize"
                        : action==="translate" ? "🌍 Translate"
                        : action==="quiz"      ? "❓ Quiz"
                        : action==="notes"     ? "📌 Notes"
                                               : "🎴 Flashcards" }
                      </button>
                    ))}
                    {/* Phase 2 — Feature 1 & 2: these open their own small
                        popovers (color picker / note editor) rather than
                        going through the AI router — they don't call an
                        AI action at all. */}
                    <button onClick={() => { setShowNotePopover(false); setShowColorPicker(true); }}
                      style={{ background: "#c18a3f", color: "#fff", border: "none",
                                borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                fontWeight: 700, cursor: "pointer" }}>
                      ⭐ Highlight
                    </button>
                    <button onClick={() => { setShowColorPicker(false); setLastNoteWasImproved(false); setShowNotePopover(true); }}
                      style={{ background: "#334155", color: "#fff", border: "none",
                                borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                fontWeight: 700, cursor: "pointer" }}>
                      📝 Add Note
                    </button>
                  </>
                ) : (
                  // Image selection menu — Explain Image + Summarize Diagram + Ask About Image (custom input)
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                    {[
                      { action: "explain",   label: "🔍 Explain Image" },
                      { action: "summarize", label: "📊 Summarize Diagram" },
                    ].map(({ action, label }) => (
                      <button key={action} onClick={() => handleSelectionAction(action)}
                        style={{ background: "#0f172a", color: "#fff", border: "none",
                                  borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                  fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                        {label}
                      </button>
                    ))}

                    {/* Ask About Image — togglable custom question input */}
                    {!showAskInput ? (
                      <button onClick={() => setShowAskInput(true)}
                        style={{ background: "#334155", color: "#e2e8f0", border: "none",
                                  borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                  fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                        ❓ Ask About Image…
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                        <input
                          autoFocus
                          value={askImageInput}
                          onChange={e => setAskImageInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && askImageInput.trim()) {
                              handleSelectionAction("ask", askImageInput.trim());
                              setAskImageInput(""); setShowAskInput(false);
                            }
                            if (e.key === "Escape") { setShowAskInput(false); setAskImageInput(""); }
                          }}
                          placeholder="Type your question about the image…"
                          style={{ borderRadius: 10, border: "1px solid #c18a3f", padding: "7px 10px",
                                    fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box" }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            disabled={!askImageInput.trim()}
                            onClick={() => {
                              if (askImageInput.trim()) {
                                handleSelectionAction("ask", askImageInput.trim());
                                setAskImageInput(""); setShowAskInput(false);
                              }
                            }}
                            style={{ flex: 1, background: "#0f172a", color: "#fff", border: "none",
                                      borderRadius: 10, padding: "7px 12px", fontSize: 12,
                                      fontWeight: 700, cursor: "pointer", opacity: askImageInput.trim() ? 1 : 0.4 }}>
                            Ask
                          </button>
                          <button onClick={() => { setShowAskInput(false); setAskImageInput(""); }}
                            style={{ background: "#f1f0ee", color: "#64748b", border: "none",
                                      borderRadius: 10, padding: "7px 12px", fontSize: 12,
                                      fontWeight: 600, cursor: "pointer" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
          })()}

          {/* ── PHASE 2 popovers — only ever shown for a TEXT selection,
              anchored at the same point the floating menu uses. ────── */}
          {showColorPicker && activeSelection && activeSelection.type === "text" && (
            <HighlightColorPicker
              left={activeSelection.x}
              top={activeSelection.y + 24}
              onPick={addHighlight}
              onCancel={() => setShowColorPicker(false)}
            />
          )}
          {showNotePopover && activeSelection && activeSelection.type === "text" && (
            <NotePopover
              left={activeSelection.x}
              top={activeSelection.y + 24}
              initialText=""
              selectedTextPreview={activeSelection.text}
              improving={noteImproving}
              onImprove={improveNoteWithAI}
              onSave={(text) => saveNote(text, lastNoteWasImproved)}
              onCancel={() => setShowNotePopover(false)}
            />
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
              pageHighlights={pageHighlightsForSpread}
              pageNotes={pageNotesForSpread}
              bookId={bookId}
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
          onQuickAction={(label, prompt, scope) => {
            // NEW: "entire book" scope, alongside the existing current
            // page / visible pages / selected text scopes. Routed to its
            // own function since it needs full-book extraction (with a
            // metadata fallback for weak/scanned books) instead of
            // getVisiblePageText().
            if (scope === "book") {
              runEntireBookQuiz();
              return;
            }
            // Quick actions in the sidebar always use VISIBLE PAGE TEXT —
            // not activeSelection. If user wants selection-specific AI,
            // they use the floating toolbar buttons.
            const content = getVisiblePageText().length > 50
              ? `Content from page ${readerPage} of "${book}":\n\n${getVisiblePageText()}`
              : `Viewing page ${readerPage} of "${book}".`;
            // AICompanion's QUICK_ACTIONS labels are "🧠 Explain", "📝
            // Summarize", etc. — derive the same action name the floating
            // toolbar uses so this goes through the same AI-usage tracking
            // in runAI, instead of duplicating the tracking logic here.
            const quickAction = label.includes("Explain") ? "explain"
              : label.includes("Summarize") ? "summarize"
              : label.includes("Translate") ? "translate"
              : label.includes("Quiz") ? "quiz"
              : label.includes("Flashcards") ? "flashcards"
              : label.includes("Notes") ? "notes"
              : undefined;
            runAI(prompt, content, undefined, undefined, quickAction);
          }}
          bookTitle={book}
          pageNumber={readerPage}
          pageText={getVisiblePageText()}
          language={language}
          onLanguageChange={setLanguage}
          studyHighlights={highlights.filter(h => h.bookId === bookId)}
          studyNotes={notes.filter(n => n.bookId === bookId)}
          studyBookmarks={bookmarks.filter(b => b.bookId === bookId)}
          onStudyJumpToPage={studyJumpToPage}
          onStudyDeleteHighlight={removeHighlight}
          onStudyDeleteNote={removeNote}
          onStudyDeleteBookmark={removeBookmark}
          onStudyGenerateFromHighlight={generateFromHighlight}
          studyGeneratingId={studyGeneratingId}
        />
      }
    />
  );
}

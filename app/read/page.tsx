"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ChangeEvent } from "react";
import { usePublicCatalog } from "@/lib/catalog";
import { getPageDisplay, resolveBookPageInput, describePageForAI, getBookPageLabel } from "@/lib/pageNumbering";
import { isSpreadPage, getSpreadRightPage, snapSpreadCursor, getNextSpreadCursor, getPrevSpreadCursor, type ReaderLayout } from "@/lib/spreadNavigation";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import PageHeader from "@/components/ui/PageHeader";
import AppButton from "@/components/ui/AppButton";
import InfoCard from "@/components/ui/InfoCard";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";
import BookCover from "@/components/ui/BookCover";
import { saveUploadedPdf, getUploadedPdf, saveUploadedBookMeta, getUploadedBookMeta, type UploadedBookMeta } from "@/lib/uploadedPdfStore";
import { detectPdfLayout } from "@/lib/pdfLayoutDetection";
import { saveCurrentBook } from "@/lib/currentBook";
import ReaderLearningMenu from "@/components/reader/ReaderLearningMenu";

// ══════════════════════════════════════════════════════════════════════
// Normal PDF Reader — /read
// ──────────────────────────────────────────────────────────────────────
// Purpose: simple, distraction-free reading. No AI sidebar, no AI
// Companion, no Study Workspace — just page navigation, zoom, fullscreen,
// fit width/page, and basic thumbnails. This is intentionally the "other"
// reading path alongside Premium Reader (/reader-premium), not a
// replacement for it.
//
// Two upload paths live on this page on purpose:
//   1. "Read Normally" upload — stays right here, renders locally via a
//      blob: URL, no persistence, no cross-mode handoff. A quick scratch
//      read for a file you don't need again after this tab closes.
//   2. "Read with AI Tutor" upload — reads the file as a base64 data
//      URL, saves the payload to IndexedDB (lib/uploadedPdfStore.ts)
//      keyed by a generated id, detects its page layout once
//      (lib/pdfLayoutDetection.ts) and persists {id, name, pages,
//      layout} as a small metadata record (also uploadedPdfStore.ts) —
//      then redirects to /reader-premium?source=upload&id=<id>.
//      Because the id + metadata are persisted (not just sessionStorage
//      pointers), THIS reader can also open the exact same upload via
//      ?source=upload&id=<id> — see the resolution effect below — so
//      switching between Normal and AI reading preserves both the page
//      and the layout, and reopening later (refresh, or from My Books'
//      "Uploaded" collection) works the same way.
// ══════════════════════════════════════════════════════════════════════

type DirectorBook = { id: string; title: string; author?: string; pdf: string; pages?: number | string; [k: string]: any };

const AI_UPLOAD_KEYS = {
  name: "ndl_uploaded_pdf_name",
  pages: "ndl_uploaded_pdf_pages",
  id: "ndl_uploaded_pdf_id",
} as const;

const THUMBNAIL_LIMIT = 30;

function ReadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const catalogChoices = usePublicCatalog();
  const bookId = searchParams.get("book");
  const catalogBook = catalogChoices.find(b => b.id === bookId) || null;

  // Locally-uploaded file for NORMAL (non-AI) reading — a plain blob: URL
  // is fine here since we never navigate away from this page for it.
  // Ephemeral by design (see file header): no id, no persistence, so its
  // layout is detected fresh each time and only kept in memory.
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string>("");
  const [localBlobLayout, setLocalBlobLayout] = useState<ReaderLayout>(undefined);
  const [aiUploadStatus, setAiUploadStatus] = useState<"idle" | "preparing" | "error">("idle");
  const [aiUploadError, setAiUploadError] = useState("");

  // ── Persisted ("Read with AI Tutor") upload — resolved by id, same
  // storage Premium Reader reads, so this reader can open the exact same
  // upload (?source=upload&id=<id>). The `id` param is preferred; the
  // sessionStorage pointer is a fallback for links generated before this
  // param existed. ────────────────────────────────────────────────────
  const uploadSourceRequested = searchParams.get("source") === "upload";
  const uploadIdParam = searchParams.get("id");
  const [uploadedBookMeta, setUploadedBookMeta] = useState<UploadedBookMeta | null>(null);
  const [uploadedBookData, setUploadedBookData] = useState<string | null>(null);
  useEffect(() => {
    if (!uploadSourceRequested) { setUploadedBookMeta(null); setUploadedBookData(null); return; }
    const id = uploadIdParam || (typeof window !== "undefined" ? window.sessionStorage.getItem(AI_UPLOAD_KEYS.id) : null);
    if (!id) return;
    let cancelled = false;
    (async () => {
      const data = await getUploadedPdf(id);
      if (cancelled || !data) return;
      setUploadedBookData(data);
      const existingMeta = getUploadedBookMeta(id);
      if (existingMeta) { setUploadedBookMeta(existingMeta); return; }
      // Backward compat: an upload made before uploaded-book metadata
      // existed has the IndexedDB payload but no metadata record — detect
      // its layout now and persist it, so every future open is instant.
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjsLib.getDocument(data).promise;
        const layout = await detectPdfLayout(doc);
        const name = window.sessionStorage.getItem(AI_UPLOAD_KEYS.name) || t.premiumReaderUploadedDocumentFallback;
        const meta: UploadedBookMeta = { id, name, pages: doc.numPages, layout, uploadedAt: Date.now() };
        saveUploadedBookMeta(meta);
        if (!cancelled) setUploadedBookMeta(meta);
      } catch {
        // Leave meta null — isUploadedBook below still resolves via
        // uploadedBookData, and layout falls back to the safe "spread"
        // default a few lines down.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadSourceRequested, uploadIdParam]);
  const isUploadedBook = Boolean(uploadSourceRequested && uploadedBookData);

  // Same canonical concept Premium Reader reads (lib/directorBooks.ts'
  // DirectorBook.layout) — see lib/spreadNavigation.ts for why every
  // reader must derive spread pairing from one resolved value instead of
  // each guessing independently. Priority: explicit persisted metadata
  // (catalog book, or a completed uploaded-book detection) first, then
  // in-session detection for a still-loading local blob upload, then the
  // safe portrait-PDF default of "spread" for anything not yet resolved.
  let layout: ReaderLayout;
  if (catalogBook) layout = catalogBook.layout;
  else if (isUploadedBook) layout = uploadedBookMeta?.layout ?? "spread";
  else if (uploadedUrl) layout = localBlobLayout ?? "spread";
  else layout = undefined;

  const pdfSource = isUploadedBook ? uploadedBookData : (catalogBook?.pdf ?? uploadedUrl);
  const displayTitle = isUploadedBook
    ? (uploadedBookMeta?.name || t.premiumReaderUploadedDocumentFallback)
    : (catalogBook?.title ?? uploadedName);

  // ── pdf.js state ─────────────────────────────────────────────────────
  const [pdf, setPdf] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<"width" | "page" | "custom">("width");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  // pdf.js refuses to start a new render() on a canvas that still has one
  // in flight ("Cannot use the same canvas during multiple render()
  // operations") — these track the live RenderTask per canvas so a new
  // effect run can explicitly .cancel() the previous one first, instead
  // of just racing it via the `cancelled` closure flag (which stops our
  // own code from proceeding but doesn't stop pdf.js's in-progress task
  // from touching the canvas).
  const leftRenderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const rightRenderTaskRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    if (!pdfSource) { setPdf(null); setNumPages(0); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        // standardFontDataUrl covers pages that reference a non-embedded
        // standard PDF font (root-caused for chandrayaan-3.pdf's cover in
        // lib/coverManager.ts) — a no-op for pages that don't need it.
        const doc = await pdfjsLib.getDocument({ url: pdfSource, standardFontDataUrl: "/standard_fonts/" }).promise;
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);

        // For a local ("Read Normally") blob upload, detect + cache its
        // layout right here so even the very first paint below already
        // reflects it — the same synchronous-first-paint reasoning as
        // the `page` snap immediately after. Catalog books and persisted
        // uploads already have their layout resolved by this point.
        let effectiveLayout = layout;
        if (!catalogBook && !isUploadedBook && uploadedUrl) {
          const detected = await detectPdfLayout(doc);
          if (cancelled) return;
          setLocalBlobLayout(detected);
          effectiveLayout = detected;
        }

        // A `?page=` in the URL (direct link, or Return to Book from
        // Notes/Revision/etc) opens straight to that physical PDF page,
        // clamped to this book's actual bounds — same canonical 1-based
        // page index Premium Reader and `ndl_current_book` already use.
        // No param falls back to page 1, exactly as before.
        const urlPage = Number(searchParams.get("page"));
        const rawInitialPage = Number.isFinite(urlPage) && urlPage >= 1
          ? Math.min(Math.floor(urlPage), doc.numPages)
          : 1;
        setPage(snapSpreadCursor(rawInitialPage, effectiveLayout));
      } catch (err) {
        console.error("[Normal Reader] Failed to load PDF:", err);
        if (!cancelled) setLoadError(t.readerLoadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfSource]);

  // ── Shared "current book" pointer for Return to Book ─────────────────
  // Catalog books and persisted uploads both have a stable id worth
  // reopening later. The local ("Read Normally") blob upload doesn't —
  // no id, nothing survives a reload — so there's nothing meaningful to
  // point at for that path.
  useEffect(() => {
    if (!numPages) return;
    if (catalogBook) {
      saveCurrentBook({ route: "/read", bookId: catalogBook.id, title: catalogBook.title, page });
    } else if (isUploadedBook && uploadedBookMeta) {
      saveCurrentBook({ route: "/read", bookId: uploadedBookMeta.id, title: uploadedBookMeta.name, page, source: "upload" });
    }
  }, [catalogBook?.id, catalogBook?.title, isUploadedBook, uploadedBookMeta?.id, uploadedBookMeta?.name, page, numPages]);

  // Spread-aware: when this book's layout is "spread" (see
  // lib/directorBooks.ts) and `page` isn't the solo cover, the right-hand
  // page (page + 1, from lib/spreadNavigation.ts — the same source
  // Premium Reader/PdfBookSpread use) renders alongside it into a second
  // canvas, so a genuine single-page-per-side PDF opens as a proper
  // two-page spread here exactly like it does in Premium Reader. "single"
  // layout books (Nalanda, Chandrayaan-3) are unaffected — their PDF
  // pages are already baked two-up spread images, so this always renders
  // just the one canvas for them, same as before.
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      try {
        const rightPageNum = getSpreadRightPage(page, layout);
        const showRight = rightPageNum != null && rightPageNum <= numPages;

        const [leftPg, rightPg] = await Promise.all([
          pdf.getPage(page),
          showRight ? pdf.getPage(rightPageNum as number) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const leftBaseVp = leftPg.getViewport({ scale: 1 });
        const rightBaseVp = rightPg ? rightPg.getViewport({ scale: 1 }) : null;

        const combinedWidth = leftBaseVp.width + (rightBaseVp ? rightBaseVp.width : 0);
        const combinedHeight = Math.max(leftBaseVp.height, rightBaseVp ? rightBaseVp.height : 0);

        let scale = zoom;
        const container = viewportContainerRef.current;
        if (fitMode === "width" && container) {
          scale = Math.max(0.2, (container.clientWidth - 48) / combinedWidth);
        } else if (fitMode === "page" && container) {
          const availW = container.clientWidth - 48;
          const availH = container.clientHeight - 48;
          scale = Math.max(0.2, Math.min(availW / combinedWidth, availH / combinedHeight));
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const leftViewport = leftPg.getViewport({ scale });
        canvas.width = Math.ceil(leftViewport.width);
        canvas.height = Math.ceil(leftViewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Cancel any still-running render before this run touches the
        // same canvases, then kick off both pages' renders WITHOUT
        // awaiting one before starting the other — pdf.js's render()
        // promise does not reliably settle for every page in every
        // environment (it still paints the canvas correctly either way),
        // so a right-page render must never be sequenced behind awaiting
        // the left page's promise. Each render() call paints its own
        // canvas independently once its own work completes.
        leftRenderTaskRef.current?.cancel();
        rightRenderTaskRef.current?.cancel();
        const leftTask = leftPg.render({ canvasContext: ctx, viewport: leftViewport, canvas });
        leftRenderTaskRef.current = leftTask;
        leftTask.promise.catch(() => {});

        if (rightPg && rightBaseVp) {
          const rightCanvas = rightCanvasRef.current;
          if (rightCanvas) {
            const rightViewport = rightPg.getViewport({ scale });
            rightCanvas.width = Math.ceil(rightViewport.width);
            rightCanvas.height = Math.ceil(rightViewport.height);
            const rightCtx = rightCanvas.getContext("2d");
            if (rightCtx) {
              const rightTask = rightPg.render({ canvasContext: rightCtx, viewport: rightViewport, canvas: rightCanvas });
              rightRenderTaskRef.current = rightTask;
              rightTask.promise.catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error("[Normal Reader] Page render error:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, page, zoom, fitMode, numPages, layout]);

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);
  function toggleFullscreen() {
    if (!document.fullscreenElement) outerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }

  // ── Page transition — simple crossfade + slight lift, no rotation. ────
  const FADE_MS = 220;
  const [pageVisible, setPageVisible] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current); };
  }, []);

  function changePage(nextPage: number) {
    setIsTransitioning(true);
    setPageVisible(false);
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    transitionTimeoutRef.current = setTimeout(() => {
      setPage(nextPage);
      transitionTimeoutRef.current = setTimeout(() => {
        setPageVisible(true);
        setIsTransitioning(false);
      }, 40);
    }, FADE_MS);
  }

  // Spread-aware stepping (lib/spreadNavigation.ts) — for a "spread" book
  // this steps by 2 pages once past the cover, the same pairing Premium
  // Reader uses, instead of always advancing by exactly 1.
  const canGoPrev = !isTransitioning && getPrevSpreadCursor(page, layout) !== page;
  const canGoNext = !isTransitioning && getNextSpreadCursor(page, numPages || 1, layout) !== page;
  function goPrev() { if (!canGoPrev) return; changePage(getPrevSpreadCursor(page, layout)); }
  function goNext() { if (!canGoNext) return; changePage(getNextSpreadCursor(page, numPages || 1, layout)); }
  function zoomIn() { setFitMode("custom"); setZoom(z => Math.min(3, z + 0.15)); }
  function zoomOut() { setFitMode("custom"); setZoom(z => Math.max(0.3, z - 0.15)); }

  // ── Voice commands ────────────────────────────────────────────────
  // This reader has no extracted page text (pages are canvas-rendered by
  // pdf.js, not a text layer), so "Read this page" speaks a short,
  // deterministic description instead of dumping arbitrary DOM text —
  // a separate, purpose-built utility from AccessibilityToolbar's own
  // generic Read Aloud, which keeps working unchanged.
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  function voiceReadPage() {
    if (typeof window === "undefined") return;
    const utt = new SpeechSynthesisUtterance(
      `Reading ${describePageForAI(page, catalogBook?.pageNumbering)}, out of ${numPages || "unknown"} pages, in ${displayTitle || "this book"}.`
    );
    utt.rate = 0.95;
    utt.onend = () => setVoiceSpeaking(false);
    utt.onerror = () => setVoiceSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
    setVoiceSpeaking(true);
  }
  function voicePauseReading() { window.speechSynthesis?.pause(); }
  function voiceResumeReading() { window.speechSynthesis?.resume(); }
  function voiceStopReading() { window.speechSynthesis?.cancel(); setVoiceSpeaking(false); }

  // Ref kept fresh every render so the ONE voice-command listener below
  // (registered once, on mount) always acts on the LATEST page/zoom/etc
  // instead of whatever was current when the listener was first attached
  // — the same stale-closure pitfall fixed in AccessibilityToolbar.
  const voiceStateRef = useRef({
    page, numPages, isTransitioning, voiceSpeaking, pageNumbering: catalogBook?.pageNumbering, layout,
    goNext, goPrev, changePage, zoomIn, zoomOut, setFitMode, toggleFullscreen,
    voiceReadPage, voicePauseReading, voiceResumeReading, voiceStopReading,
  });
  useEffect(() => {
    voiceStateRef.current = {
      page, numPages, isTransitioning, voiceSpeaking, pageNumbering: catalogBook?.pageNumbering, layout,
      goNext, goPrev, changePage, zoomIn, zoomOut, setFitMode, toggleFullscreen,
      voiceReadPage, voicePauseReading, voiceResumeReading, voiceStopReading,
    };
  });

  // VoiceAssistant (rendered inside AccessibilityToolbar) never imports
  // this page's internals — it only ever broadcasts a "ndl-voice-command"
  // CustomEvent. This is the ONLY place that turns that event into calls
  // to this reader's own existing goNext/goPrev/zoom/fullscreen functions.
  useEffect(() => {
    function onVoiceCommand(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.kind !== "reader") return;
      const v = voiceStateRef.current;
      switch (detail.action) {
        case "nextPage": v.goNext(); break;
        case "prevPage": v.goPrev(); break;
        case "goToPage": {
          // "Go to page N" means the printed book page by default, same
          // as Premium Reader — falls back to treating N as a raw PDF
          // page when this book has no mapping, or the requested printed
          // page doesn't resolve.
          if (detail.page && !v.isTransitioning) {
            const { pdfPage, usedFallback } = resolveBookPageInput(detail.page, v.pageNumbering, v.numPages || 1);
            v.changePage(snapSpreadCursor(pdfPage, v.layout));
            if (usedFallback && v.pageNumbering && typeof window !== "undefined") {
              const utt = new SpeechSynthesisUtterance(
                `No printed page ${detail.page} found — showing PDF page ${pdfPage} instead.`
              );
              window.speechSynthesis?.speak(utt);
            }
          }
          break;
        }
        case "zoomIn": v.zoomIn(); break;
        case "zoomOut": v.zoomOut(); break;
        case "fitPage": v.setFitMode("page"); break;
        case "fullscreen": if (!document.fullscreenElement) v.toggleFullscreen(); break;
        case "exitFullscreen": if (document.fullscreenElement) document.exitFullscreen(); break;
        case "read": if (!v.voiceSpeaking) v.voiceReadPage(); break;
        case "pause": v.voicePauseReading(); break;
        case "resume": v.voiceResumeReading(); break;
        case "stop": v.voiceStopReading(); break;
      }
    }
    window.addEventListener("ndl-voice-command", onVoiceCommand);
    return () => window.removeEventListener("ndl-voice-command", onVoiceCommand);
  }, []);
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  // ── Upload path 1: Read Normally (stays on this page, no AI) ─────────
  function handleNormalUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    setLocalBlobLayout(undefined); // re-detected fresh for this new file
    setUploadedUrl(URL.createObjectURL(file));
    setUploadedName(file.name);
  }

  // ── Upload path 2: Read with AI Tutor ────────────────────────────────
  async function handleAiUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setAiUploadStatus("error");
      setAiUploadError(t.readerInvalidFile);
      return;
    }
    setAiUploadStatus("preparing");
    setAiUploadError("");
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
        reader.readAsDataURL(file);
      });
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc = await pdfjsLib.getDocument(dataUrl).promise;
      const pageCount = doc.numPages;
      const layout = await detectPdfLayout(doc);
      const uploadId = `uploaded-${Date.now()}`;

      // The (potentially large) PDF payload goes to IndexedDB; the small
      // metadata record (name/pages/layout) is persisted separately so
      // this exact upload can be reopened later — by id — from either
      // reader, after a refresh, or from My Books' "Uploaded" collection.
      // sessionStorage pointer fields are still written too, purely as a
      // fallback for any link generated before the ?id= param existed.
      await saveUploadedPdf(uploadId, dataUrl);
      saveUploadedBookMeta({ id: uploadId, name: file.name, pages: pageCount, layout, uploadedAt: Date.now() });
      window.sessionStorage.setItem(AI_UPLOAD_KEYS.name, file.name);
      window.sessionStorage.setItem(AI_UPLOAD_KEYS.pages, String(pageCount));
      window.sessionStorage.setItem(AI_UPLOAD_KEYS.id, uploadId);

      router.push(`/reader-premium?source=upload&id=${uploadId}`);
    } catch (err) {
      console.error("[Normal Reader] Failed to prepare AI upload:", err);
      setAiUploadStatus("error");
      setAiUploadError(t.readerUploadError);
    }
  }

  const thumbnailPages = Array.from({ length: Math.min(THUMBNAIL_LIMIT, numPages) }, (_, i) => i + 1);

  // ── No book loaded yet: choose a library book or upload one ──────────
  if (!pdfSource) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
        <div className="mx-auto max-w-4xl">
          <PageHeader title={t.readerTagline} badge={t.readerBadge} homeLabel={t.commonHome} />

          <InfoCard>
            <h2 className="text-lg font-black text-slate-950">{t.readerChooseBook}</h2>
            {/* Equal-height, aligned book cards — flex column with the
                button pinned via mt-auto so every card's CTA lines up on
                the same row regardless of title length. */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {catalogChoices.map(b => (
                <Link
                  key={b.id}
                  href={`/read?book=${b.id}`}
                  className="flex h-full flex-col items-center rounded-2xl border border-slate-200 p-4 text-center hover:border-slate-400 hover:shadow"
                >
                  <BookCover book={b} className="h-36 w-24 rounded-lg shadow" />
                  <p className="mt-3 font-bold text-slate-900">{b.title}</p>
                  {b.author && <p className="mt-1 text-xs text-slate-500">{b.author}</p>}
                  <span className="mt-auto pt-3 inline-block rounded-full bg-slate-950 px-4 py-1.5 text-xs font-bold text-white">
                    📖 {t.readerReadNormally}
                  </span>
                </Link>
              ))}
            </div>
          </InfoCard>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <InfoCard className="flex flex-col">
              <h2 className="text-lg font-black text-slate-950">{t.readerUploadNormalTitle}</h2>
              <p className="mt-2 text-sm text-slate-500">{t.readerUploadNormalDesc}</p>
              <label className="mt-5 inline-block w-fit cursor-pointer">
                <span className="inline-block rounded-2xl bg-slate-950 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800">
                  {t.readerChoosePdf}
                </span>
                <input type="file" accept="application/pdf" onChange={handleNormalUpload} className="hidden" />
              </label>
            </InfoCard>

            <InfoCard className="flex flex-col">
              <h2 className="text-lg font-black text-slate-950">{t.readerUploadAiTitle}</h2>
              <p className="mt-2 text-sm text-slate-500">{t.readerUploadAiDesc}</p>
              <label className="mt-5 inline-block w-fit cursor-pointer">
                <span className="inline-block rounded-2xl bg-orange-600 px-6 py-3 text-sm font-bold text-white hover:bg-orange-700">
                  {aiUploadStatus === "preparing" ? t.readerPreparing : t.readerChoosePdf}
                </span>
                <input type="file" accept="application/pdf" onChange={handleAiUpload} disabled={aiUploadStatus === "preparing"} className="hidden" />
              </label>
              {aiUploadStatus === "error" && <p className="mt-3 text-xs font-semibold text-red-600">{aiUploadError}</p>}
            </InfoCard>
          </div>

          <p className="mt-6 text-center text-[11px] text-slate-400">{t.readerStoredTemporarily}</p>
        </div>
        <AccessibilityToolbar />
      </main>
    );
  }

  // ── Reading view ───────────────────────────────────────────────────
  return (
    <div ref={outerRef} className="flex h-screen flex-col bg-slate-100">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t.readerBadge}</p>
          <h1 className="truncate text-lg font-bold text-slate-900">{displayTitle}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AppButton variant="secondary" size="sm" onClick={() => setShowThumbnails(s => !s)}>
            {showThumbnails ? t.readerHideThumbs : t.readerShowThumbs}
          </AppButton>
          <AppButton variant="secondary" size="sm" onClick={zoomOut}>−</AppButton>
          <span className="text-xs font-bold text-slate-500">{Math.round(zoom * 100)}%</span>
          <AppButton variant="secondary" size="sm" onClick={zoomIn}>+</AppButton>
          <AppButton variant={fitMode === "width" ? "primary" : "secondary"} size="sm" onClick={() => setFitMode("width")}>{t.readerFitWidth}</AppButton>
          <AppButton variant={fitMode === "page" ? "primary" : "secondary"} size="sm" onClick={() => setFitMode("page")}>{t.readerFitPage}</AppButton>
          <AppButton variant="secondary" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? `⤢ ${t.readerExitFullscreen}` : `⛶ ${t.readerFullscreen}`}
          </AppButton>
          <ReaderLearningMenu />
          {catalogBook && (
            <AppButton variant="accent" size="sm" href={`/reader-premium?book=${catalogBook.id}&page=${page}`}>
              🤖 {t.readerReadWithAi}
            </AppButton>
          )}
          {isUploadedBook && uploadedBookMeta && (
            <AppButton variant="accent" size="sm" href={`/reader-premium?source=upload&id=${uploadedBookMeta.id}&page=${page}`}>
              🤖 {t.readerReadWithAi}
            </AppButton>
          )}
          <AppButton variant="danger" size="sm" href="/read">✕ {t.commonClose}</AppButton>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {showThumbnails && (
          <aside data-a11y-focus-hide className="w-40 flex-shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{t.readerPages}</p>
            <div className="flex flex-col gap-1.5">
              {thumbnailPages.map(p => (
                <button key={p} onClick={() => setPage(snapSpreadCursor(p, layout))}
                  className={`rounded-lg px-3 py-2 text-left text-xs font-bold ${page === p ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {getBookPageLabel(p, catalogBook?.pageNumbering) ?? `${t.commonPage} ${p}`}
                </button>
              ))}
              {numPages > THUMBNAIL_LIMIT && (
                <p className="mt-1 px-1 text-[10px] text-slate-400">+{numPages - THUMBNAIL_LIMIT} {t.readerMorePages}</p>
              )}
            </div>
          </aside>
        )}

        <main ref={viewportContainerRef} className="relative flex flex-1 min-w-0 items-center justify-center overflow-auto p-6">
          {loading && <p className="text-sm font-semibold text-slate-400">{t.commonLoading}</p>}
          {loadError && (
            <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow">
              <p className="font-bold text-slate-900">{t.readerCouldNotOpen}</p>
              <p className="mt-2 text-sm text-slate-500">{loadError}</p>
              <AppButton href="/read" size="sm" className="mt-4">← {t.commonBack}</AppButton>
            </div>
          )}
          {!loading && !loadError && (
            <div
              className="ndl-page-fade"
              style={{
                opacity: pageVisible ? 1 : 0,
                transform: pageVisible ? "translateY(0)" : "translateY(6px)",
                transitionDuration: `${FADE_MS}ms`,
              }}
            >
              <div className="flex items-end gap-0.5">
                <canvas ref={canvasRef} className="block shadow-xl" />
                {isSpreadPage(page, layout) && (getSpreadRightPage(page, layout) ?? 0) <= numPages && (
                  <canvas ref={rightCanvasRef} className="block shadow-xl" />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <footer className="flex flex-shrink-0 items-center justify-center gap-4 border-t border-slate-200 bg-white px-6 py-3">
        <button onClick={goPrev} disabled={!canGoPrev} className="rounded-full bg-slate-900 px-5 py-2 text-xs font-bold text-white disabled:opacity-30">← {t.commonPrevious}</button>
        {(() => {
          const rightPageNum = getSpreadRightPage(page, layout);
          const showRight = rightPageNum != null && rightPageNum <= numPages;
          const pdfRangeLabel = showRight ? `${page}–${rightPageNum}` : `${page}`;
          const display = getPageDisplay(page, numPages || 1, catalogBook?.pageNumbering);
          return display.bookLabel ? (
            <span className="flex flex-col items-center leading-tight">
              <span className="text-xs font-bold text-slate-700">{display.bookLabel}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">PDF {pdfRangeLabel} {t.commonOf} {numPages || "…"}</span>
            </span>
          ) : (
            <span className="text-xs font-bold text-slate-500">{t.commonPage} {pdfRangeLabel} {t.commonOf} {numPages || "…"}</span>
          );
        })()}
        <button onClick={goNext} disabled={!canGoNext} className="rounded-full bg-slate-900 px-5 py-2 text-xs font-bold text-white disabled:opacity-30">{t.commonNext} →</button>
      </footer>

      {/* Page transition — Normal Reader only. Deliberately simple: a
          plain crossfade with a 6px lift, the same for both directions.
          prefers-reduced-motion removes the transition entirely. */}
      <style>{`
        .ndl-page-fade { transition-property: opacity, transform; transition-timing-function: ease; }
        @media (prefers-reduced-motion: reduce) {
          .ndl-page-fade { transition: none !important; }
        }
      `}</style>
      <AccessibilityToolbar />
    </div>
  );
}
export default function ReadPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading reader...</div>}>
      <ReadPageContent />
    </Suspense>
  );
}
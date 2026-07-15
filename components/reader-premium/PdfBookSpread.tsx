"use client";

import { memo, useEffect, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// ── PHASE 2 (visual-only): highlight & note overlay shapes ─────────────
// Deliberately generic/agnostic — PdfBookSpread doesn't know anything
// about "the Study feature"; it just knows how to paint a translucent
// rectangle at a given fraction of a page, in the SAME container that
// owns that page's canvas. Colors are pre-resolved by the caller so this
// component never needs to import Study-specific constants.
export type RectPct = { left: number; top: number; width: number; height: number };
export type PageOverlayHighlight = {
  id: string;
  page: number;
  fill: string;
  border: string;
  rectsPct: RectPct[];
  /** True while this highlight should visually pulse (Study tab "jump to"). */
  flashing?: boolean;
};
export type PageOverlayNote = {
  id: string;
  page: number;
  rectPct: RectPct;
  flashing?: boolean;
};

export type PdfBookSpreadProps = {
  pdfPath: string;
  pageNumber: number;
  totalPages: string;
  zoom?: number;
  pan?: { x: number; y: number };
  textSelectMode?: boolean;
  imageSelectMode?: boolean;
  /** PHASE 2 — persisted highlights/notes to paint on whichever page(s)
   *  are currently rendered. Filtered by page internally; pass the full
   *  list for the current book. */
  pageHighlights?: PageOverlayHighlight[];
  pageNotes?: PageOverlayNote[];
  /** Current book id — threaded through to PageBox for highlight/note
   *  keying. Title and the printed-page label are computed by the
   *  caller now (Phase C3 — this component no longer renders its own
   *  header/footer chrome; PremiumReaderPreviewContent owns the
   *  surrounding toolbar/bottom-bar and computes the same printed label
   *  itself via lib/printedPageMap.ts's pure functions). */
  bookId?: string;
  /**
   * Fires after first render with canvas CSS dims AND the inner book-card
   * container dims so the parent can compute an accurate auto-fit zoom.
   */
  onPageRendered?: (cssW: number, cssH: number, cardW: number, cardH: number) => void;
  /** Fires with extracted text keyed by page number after each render. */
  onTextExtracted?: (texts: Record<number, string>) => void;
  layoutMode?: "single" | "spread";
  /** True while the user is actively drag-panning — suppresses the zoom
   *  CSS transition so panning tracks the cursor instantly instead of
   *  lagging behind a smoothed transform. */
  isPanning?: boolean;
};

// ── Render size: conservative so canvas fits on typical laptops ─────
// Parent computes fit-zoom from the card container vs this; these are
// the max rendered dimensions used when computing the CSS transform.
const PAGE_MAX_W = 860;
const PAGE_MAX_H = 700;

// ── Whitespace crop ─────────────────────────────────────────────────
const SAMPLE_STEP = 2, WHITE_THRESHOLD = 245, SAFE_PADDING = 6, MIN_CROP_FRAC = 0.04;
interface CropBox { x: number; y: number; w: number; h: number }
function detectContentBounds(data: Uint8ClampedArray, cW: number, cH: number): CropBox | null {
  let minX = cW, minY = cH, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < cH; y += SAMPLE_STEP) {
    for (let x = 0; x < cW; x += SAMPLE_STEP) {
      const i = (y * cW + x) * 4;
      if (data[i+3] < 10 || (data[i] >= WHITE_THRESHOLD && data[i+1] >= WHITE_THRESHOLD && data[i+2] >= WHITE_THRESHOLD)) continue;
      found = true;
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  if (!found) return null;
  const x = Math.max(0, minX - SAFE_PADDING), y = Math.max(0, minY - SAFE_PADDING);
  const w = Math.min(cW, maxX + SAFE_PADDING) - x, h = Math.min(cH, maxY + SAFE_PADDING) - y;
  if (w < cW * MIN_CROP_FRAC || h < cH * MIN_CROP_FRAC) return null;
  return { x, y, w, h };
}

// ── Render a PDF page → canvas + text layer, return text content ────
async function renderPdfPage(params: {
  pdf: any; pageNo: number; canvas: HTMLCanvasElement;
  textLayer: HTMLDivElement | null; pdfjsLib: any;
  maxW: number; maxH: number; cancelled: () => boolean;
}): Promise<{ cssW: number; cssH: number; text: string } | null> {
  const { pdf, pageNo, canvas, textLayer, pdfjsLib, maxW, maxH, cancelled } = params;
  if (pageNo < 1 || pageNo > pdf.numPages) return null;

  const page = await pdf.getPage(pageNo);
  if (cancelled()) return null;

  // Offscreen render at 2× for quality
  const OS = 2;
  const osVP = page.getViewport({ scale: OS });
  const os = document.createElement("canvas");
  os.width = Math.ceil(osVP.width); os.height = Math.ceil(osVP.height);
  const osCtx = os.getContext("2d", { willReadFrequently: true })!;
  osCtx.fillStyle = "#fff"; osCtx.fillRect(0, 0, os.width, os.height);

  // Extract text content in parallel with canvas render for efficiency
  const [, textContent] = await Promise.all([
    page.render({ canvasContext: osCtx, viewport: osVP, canvas: os }).promise,
    page.getTextContent().catch(() => ({ items: [] as any[] })),
  ]);
  if (cancelled()) return null;

  // Build extracted text string (used by AI when no selection is active)
  const text = (textContent.items as any[])
    .map((item: any) => item.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Crop whitespace
  let srcX = 0, srcY = 0, srcW = os.width, srcH = os.height;
  try {
    const id = osCtx.getImageData(0, 0, os.width, os.height);
    const c = detectContentBounds(id.data, os.width, os.height);
    if (c) { srcX = c.x; srcY = c.y; srcW = c.w; srcH = c.h; }
  } catch {}

  // Fit-contain
  const asp = srcW / srcH;
  let dW: number, dH: number;
  if (asp > maxW / maxH) { dW = maxW; dH = Math.floor(maxW / asp); }
  else { dH = maxH; dW = Math.floor(maxH * asp); }
  if (dW < 1 || dH < 1) return null;

  // Draw to main canvas
  canvas.width = dW; canvas.height = dH;
  canvas.style.width = dW + "px"; canvas.style.height = dH + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, dW, dH);
  ctx.drawImage(os, srcX, srcY, srcW, srcH, 0, 0, dW, dH);

  // Text selection layer
  if (textLayer) {
    textLayer.innerHTML = "";
    const displayScale = dW / (srcW / OS);
    // Crop offsets in CSS pixels: how far the visible content origin is
    // from the full-page origin at this scale.
    const cropOffsetX = (srcX / OS) * displayScale;
    const cropOffsetY = (srcY / OS) * displayScale;

    // KEY FIX — use offsetX/offsetY in the viewport so the viewport's own
    // transform maps visible PDF content directly into [0..dW]×[0..dH].
    // Without this, tVP.width > dW for cropped pages (like Nalanda's wide
    // illustrated spreads), and the text layer div overflows the container,
    // causing overflow:hidden to clip spans for content near the edges.
    // With offsetX/offsetY baked in:
    //   • text layer div is exactly dW × dH  (matches canvas CSS size)
    //   • no transform needed on the div
    //   • overflow:hidden clips non-visible whitespace spans correctly
    //   • visible content spans land at [0..dW]×[0..dH] — always inside container
    const tVP = page.getViewport({
      scale:   displayScale,
      offsetX: -cropOffsetX,
      offsetY: -cropOffsetY,
    });

    const allItems = (textContent.items as any[]);
    const textItems = allItems.filter((item: any) => item.str?.trim());

    if (textItems.length === 0) {
      // Image-based or scanned page — no selectable text. AI text-mode
      // actions fall back to OCR on the dragged region (handled by the
      // parent component); this div still exists purely as a drag surface.
    } else {
      try {
        const task = (pdfjsLib as any).renderTextLayer({
          textContentSource: page.streamTextContent(),
          container: textLayer,
          viewport: tVP,
        });
        if (task?.promise) await task.promise; else if (task?.then) await task;
      } catch {
        // convertToViewportPoint returns canvas-local coordinates directly.
        try {
          textItems.forEach((item: any) => {
            const span = document.createElement("span");
            span.textContent = item.str + (item.hasEOL ? "\n" : " ");
            const [, , , d, e, f] = item.transform;
            const pt = tVP.convertToViewportPoint(e, f);
            span.style.cssText = [
              "position:absolute",
              `left:${pt[0]}px`,
              `top:${pt[1] - Math.abs(d) * displayScale}px`,
              `font-size:${Math.abs(d) * displayScale}px`,
              "font-family:sans-serif", "white-space:pre",
              "color:transparent", "cursor:text",
            ].join(";");
            textLayer.appendChild(span);
          });
        } catch {}
      }

      // Enforce layout AFTER renderTextLayer, in BOTH the success and
      // catch paths — PDF.js may add its own "textLayer" class / inline
      // transform in the success path too, and its injected stylesheet's
      // opacity:0.25 rule would silently kill our highlight color if we
      // didn't strip it back out here.
      textLayer.style.transform = "none";
      textLayer.classList.remove("textLayer");
    }
  }

  return { cssW: dW, cssH: dH, text };
}

// ── Page cache — instant Next/Previous ───────────────────────────────
// renderPdfPage above is the expensive part (2× offscreen rasterize +
// whitespace-crop pixel scan + text-layer build). Once a page has been
// rendered, its finished canvas + text-layer HTML is cached here so
// revisiting it is a single synchronous drawImage() instead of redoing
// all of that work. Keyed by pdfPath+pageNo+variant so single/spread
// halves never collide; cleared whenever the book changes.
type CachedPageEntry = { canvas: HTMLCanvasElement; cssW: number; cssH: number; text: string; textHTML: string };

async function getOrRenderPage(
  cache: Map<string, CachedPageEntry>, cacheKey: string,
  pdf: any, pageNo: number, pdfjsLib: any, maxW: number, maxH: number,
  cancelled: () => boolean
): Promise<CachedPageEntry | null> {
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const offCanvas = document.createElement("canvas");
  const offText = document.createElement("div");
  const result = await renderPdfPage({ pdf, pageNo, canvas: offCanvas, textLayer: offText, pdfjsLib, maxW, maxH, cancelled });
  if (!result || cancelled()) return null;
  const entry: CachedPageEntry = { canvas: offCanvas, cssW: result.cssW, cssH: result.cssH, text: result.text, textHTML: offText.innerHTML };
  cache.set(cacheKey, entry);
  return entry;
}

// Paints an already-rendered entry onto the LIVE canvas/text-layer — a
// cheap synchronous drawImage + innerHTML swap, not an async re-render.
function paintEntry(entry: CachedPageEntry, canvas: HTMLCanvasElement, textLayer: HTMLDivElement | null) {
  canvas.width = entry.canvas.width;
  canvas.height = entry.canvas.height;
  canvas.style.width = entry.cssW + "px";
  canvas.style.height = entry.cssH + "px";
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(entry.canvas, 0, 0);
  if (textLayer) {
    textLayer.innerHTML = entry.textHTML;
    textLayer.style.width = entry.cssW + "px";
    textLayer.style.height = entry.cssH + "px";
    textLayer.style.transform = "none";
    textLayer.classList.remove("textLayer");
  }
}

// ── Per-page box: canvas + text layer ───────────────────────────────
// NOTE ON ARCHITECTURE: there is deliberately no separate "image capture
// overlay" element here. The text layer div is the drag surface, but it
// is only pointer-interactive in Text Select mode — in Image Select mode
// it has pointerEvents:none so a drag passes straight through to the
// canvas/outer container beneath, where the parent component's own
// mouse handlers (which own interactionMode) already track the drag and
// crop the canvas. This is what keeps the two modes fully isolated: Image
// Select can never start a native text selection, and Text Select never
// needs to — a browser text selection is the ONLY thing it ever reads.
// The parent's AI-facing router still decides which of the two results
// (selected text vs. cropped image) an action actually uses, based purely
// on interactionMode, never on what's physically under the drag.
// Memoized — Perf pass (Phase C1): this re-renders on every zoom/pan tick
// of its parent otherwise, despite its own props (refs, page size,
// highlights for THIS page) rarely changing that often. React.memo's
// default shallow-prop comparison is enough here since every prop is
// either a stable ref or a primitive/small derived array.
const PageBox = memo(function PageBox({ canvasRef, textLayerRef, size, textSelectMode, imageSelectMode, pageNumber, bookId, highlights, notes }: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  textLayerRef: React.RefObject<HTMLDivElement | null>;
  size: { w: number; h: number } | null;
  textSelectMode: boolean;
  imageSelectMode: boolean;
  pageNumber: number;
  bookId?: string;
  highlights?: PageOverlayHighlight[];
  notes?: PageOverlayNote[];
}) {
  // Some select mode (either one) is active — the text layer is a live,
  // interactive drag/selection surface in both cases. It is only fully
  // inert in Pan/"none" mode, so ordinary dragging can pan the page
  // instead of starting a selection.
  const isModeActive = textSelectMode || imageSelectMode;

  const pageHighlights = (highlights ?? []).filter(h => h.page === pageNumber);
  const pageNoteMarkers = (notes ?? []).filter(n => n.page === pageNumber);

  // flatMap (not a nested .map().map()) so this produces ONE flat array of
  // already-keyed elements directly — no ambiguity about whether the
  // OUTER per-highlight group also needs its own key.
  const highlightBoxes = pageHighlights.flatMap(h =>
    h.rectsPct.map((r, i) => ({ boxKey: `${h.id}-${i}`, rect: r, fill: h.fill, border: h.border, flashing: h.flashing }))
  );

  return (
    // userSelect:contain is critical in spread mode: it creates a
    // selection boundary so dragging across the spine never bleeds
    // into the other page's text layer. Without this, a drag starting
    // at the beginning of page 2 can accidentally select all of page 3.
    <div style={{
      position: "relative",
      width: size?.w || undefined,
      height: size?.h || undefined,
      display: size ? "block" : "none",
      // Native text selection is only ever allowed in Text Select mode —
      // Image Select must never let the browser start a text selection
      // (that's what let a drag in Image mode visibly highlight text).
      userSelect: textSelectMode ? "text" : "none",
    }}>
      <canvas
        ref={canvasRef}
        data-pdf-page={pageNumber}
        style={{ display: "block", borderRadius: 10, position: "relative", zIndex: 1 }}
      />

      {/* ── PHASE 2: persisted highlight overlays ───────────────────────
          Rendered HERE — inside the exact same relatively-positioned box
          that sizes the canvas — using percentage-based absolute
          positioning. This is deliberately NOT position:fixed and NOT
          computed via getBoundingClientRect() from a distant parent
          component: because left/top/width/height are fractions of THIS
          container's own box, they automatically stay aligned under zoom
          (the whole PageBox is inside the zoomed CSS transform),
          fullscreen (still the same box, just bigger), and page
          turns/refresh (recomputed fresh every render from plain data,
          no async DOM measurement or timing race involved at all).
          z-index 2: above the canvas (z-index 1) and below the text
          layer (z-index 3, just below) / floating toolbar (rendered far
          above this, in the parent, at z-index 150-200). */}
      {highlightBoxes.map(({ boxKey, rect, fill, border, flashing }) => (
        <div key={boxKey} style={{
          position: "absolute",
          left: `${rect.left * 100}%`,
          top: `${rect.top * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
          background: fill,
          borderRadius: 2,
          pointerEvents: "none",
          zIndex: 2,
          transition: "outline 200ms ease",
          outline: flashing ? `3px solid ${border}` : "none",
          outlineOffset: 2,
        }} />
      ))}

      {/* ── PHASE 2: small note indicator icon ──────────────────────── */}
      {pageNoteMarkers.map(n => (
        <div key={n.id} style={{
          position: "absolute",
          left: `${(n.rectPct.left + n.rectPct.width) * 100}%`,
          top: `${n.rectPct.top * 100}%`,
          transform: "translate(-50%, -50%)",
          width: 18, height: 18, borderRadius: "50%",
          background: "#334155", color: "#fbbf24",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          pointerEvents: "none", zIndex: 2,
          outline: n.flashing ? "3px solid #fbbf24" : "none",
          outlineOffset: 2,
        }}>
          📝
        </div>
      ))}

      {/* Text layer wrapper — z-index 3, above the canvas (1) AND above
          the highlight/note overlays (2), so text selection and the
          floating toolbar are never blocked by a highlight sitting
          underneath. */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 3 }}>
        <div ref={textLayerRef} className="ndl-text-layer" style={{
          position: "absolute", top: 0, left: 0,
          // Interactive ONLY in Text Select mode — this is the native
          // text-selection surface. Image Select must never let the
          // browser start a text selection, so its drag is handled
          // entirely by the parent's mouse handlers on the elements
          // beneath this one (pointerEvents:none lets the drag pass
          // straight through instead of being captured here).
          pointerEvents: textSelectMode ? "auto" : "none",
          userSelect: textSelectMode ? "text" : "none",
          cursor: imageSelectMode ? "crosshair" : textSelectMode ? "text" : "default",
        }} />
      </div>
    </div>
  );
});

// ── Main component ──────────────────────────────────────────────────
export default function PdfBookSpread({
  pdfPath, pageNumber, totalPages,
  zoom = 100, pan = { x: 0, y: 0 },
  textSelectMode = false,
  imageSelectMode = false,
  pageHighlights = [],
  pageNotes = [],
  bookId,
  onPageRendered,
  onTextExtracted,
  layoutMode = "single",
  isPanning = false,
}: PdfBookSpreadProps) {
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const textRef    = useRef<HTMLDivElement | null>(null);
  const leftCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const leftTextRef    = useRef<HTMLDivElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightTextRef   = useRef<HTMLDivElement | null>(null);
  // Ref to the inner book card div — for measuring available area
  const bookCardRef = useRef<HTMLDivElement | null>(null);
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const renderIdRef = useRef(0);
  const renderedCallbackFired = useRef(false);
  // "loading" only ever drives a small non-blocking indicator now — it
  // never hides or clears the page that's already on screen.
  const [loading, setLoading] = useState(false);
  const [singleSize, setSingleSize] = useState<{ w: number; h: number } | null>(null);
  const [leftSize,   setLeftSize]   = useState<{ w: number; h: number } | null>(null);
  const [rightSize,  setRightSize]  = useState<{ w: number; h: number } | null>(null);

  const safePage = Math.max(1, Number(pageNumber) || 1);
  const total    = Math.max(1, Number(totalPages)  || 1);
  const isSpread = layoutMode === "spread" && safePage > 1;
  const rightPage = safePage + 1;

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // ── Page cache + fast Next/Previous ──────────────────────────────────
  // Persists across navigations within the same book; cleared whenever
  // the book (pdfPath) changes.
  const pageCacheRef = useRef<Map<string, CachedPageEntry>>(new Map());
  useEffect(() => {
    pageCacheRef.current.clear();
  }, [pdfPath]);

  // Direction is derived from the raw page-number delta — no parent-owned
  // animation phase/timeout is involved in changing the page anymore.
  const prevPageRef = useRef(safePage);
  const enterDirRef = useRef<"next" | "prev">("next");

  // Lightweight entrance-only pulse (no "outgoing" phase, nothing delays
  // the page-state change itself): "start" is the synchronous pre-pose
  // (no transition) applied the instant new content is painted, "end" is
  // the eased resting pose, flipped to on the very next frame so the
  // browser actually paints the "start" pose first.
  const [enterPhase, setEnterPhase] = useState<"start" | "end">("end");
  function pulseEnter(dir: "next" | "prev", isCancelled: () => boolean) {
    if (isCancelled()) return;
    enterDirRef.current = dir;
    setEnterPhase("start");
    requestAnimationFrame(() => {
      if (isCancelled()) return;
      requestAnimationFrame(() => { if (!isCancelled()) setEnterPhase("end"); });
    });
  }

  useEffect(() => {
    const id = ++renderIdRef.current;
    let cancelled = false;
    const isCancelled = () => cancelled || renderIdRef.current !== id;

    const direction: "next" | "prev" = safePage === prevPageRef.current
      ? enterDirRef.current
      : safePage > prevPageRef.current ? "next" : "prev";
    prevPageRef.current = safePage;

    renderedCallbackFired.current = false;
    // Deliberately NOT clearing singleSize/leftSize/rightSize here — the
    // canvas keeps showing the outgoing page's pixels until the new page
    // is actually ready to paint over it, so there is never a blank frame.

    async function go() {
      const cache = pageCacheRef.current;
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (isCancelled()) return;

        const pdf = await pdfjsLib.getDocument(pdfPath).promise;
        if (isCancelled()) return;

        const extractedTexts: Record<number, string> = {};

        if (!isSpread) {
          if (!canvasRef.current) return;
          const key = `${pdfPath}::${safePage}::s`;
          const cached = cache.get(key);
          if (!cached) setLoading(true);
          const entry = cached ?? await getOrRenderPage(cache, key, pdf, safePage, pdfjsLib, PAGE_MAX_W, PAGE_MAX_H, isCancelled);
          if (isCancelled()) return;
          setLoading(false);
          if (entry) {
            paintEntry(entry, canvasRef.current, textRef.current);
            setSingleSize({ w: entry.cssW, h: entry.cssH });
            extractedTexts[safePage] = entry.text;
            pulseEnter(direction, isCancelled);
            if (!renderedCallbackFired.current) {
              renderedCallbackFired.current = true;
              requestAnimationFrame(() => {
                const card = bookCardRef.current;
                onPageRendered?.(entry.cssW, entry.cssH, card?.clientWidth || 0, card?.clientHeight || 0);
              });
            }
          }
        } else {
          const halfW = Math.floor(PAGE_MAX_W * 0.50);
          const lKey = `${pdfPath}::${safePage}::l`;
          const rKey = `${pdfPath}::${rightPage}::r`;
          const lCached = cache.get(lKey);
          const rCached = rightPage <= total ? cache.get(rKey) : null;
          if (!lCached || (rightPage <= total && !rCached)) setLoading(true);
          const [lResult, rResult] = await Promise.all([
            lCached ?? (leftCanvasRef.current ? getOrRenderPage(cache, lKey, pdf, safePage, pdfjsLib, halfW, PAGE_MAX_H, isCancelled) : Promise.resolve(null)),
            rCached ?? (rightPage <= total && rightCanvasRef.current ? getOrRenderPage(cache, rKey, pdf, rightPage, pdfjsLib, halfW, PAGE_MAX_H, isCancelled) : Promise.resolve(null)),
          ]);
          if (isCancelled()) return;
          setLoading(false);
          if (lResult && leftCanvasRef.current) { paintEntry(lResult, leftCanvasRef.current, leftTextRef.current); setLeftSize({ w: lResult.cssW, h: lResult.cssH }); extractedTexts[safePage] = lResult.text; }
          if (rResult && rightCanvasRef.current) { paintEntry(rResult, rightCanvasRef.current, rightTextRef.current); setRightSize({ w: rResult.cssW, h: rResult.cssH }); extractedTexts[rightPage] = rResult.text; }
          if (lResult || rResult) {
            pulseEnter(direction, isCancelled);
            if (!renderedCallbackFired.current) {
              renderedCallbackFired.current = true;
              const totalW = (lResult?.cssW || 0) + (rResult?.cssW || 0) + 4;
              const maxH   = Math.max(lResult?.cssH || 0, rResult?.cssH || 0);
              requestAnimationFrame(() => {
                const card = bookCardRef.current;
                onPageRendered?.(totalW, maxH, card?.clientWidth || 0, card?.clientHeight || 0);
              });
            }
          }
        }

        if (!isCancelled() && Object.keys(extractedTexts).length > 0) {
          onTextExtracted?.(extractedTexts);
        }

        // ── Background preload of adjacent pages ─────────────────────
        // Starts only after the current page above is fully painted, and
        // renders sequentially (not in parallel) so it never competes
        // with a fresh user-triggered navigation for CPU. Each iteration
        // re-checks isCancelled() so a new page/book change aborts it.
        if (!isCancelled()) {
          const neighbors: Array<{ pageNo: number; key: string; maxW: number; maxH: number }> = [];
          if (!isSpread) {
            if (safePage + 1 <= total) neighbors.push({ pageNo: safePage + 1, key: `${pdfPath}::${safePage + 1}::s`, maxW: PAGE_MAX_W, maxH: PAGE_MAX_H });
            if (safePage - 1 >= 1)     neighbors.push({ pageNo: safePage - 1, key: `${pdfPath}::${safePage - 1}::s`, maxW: PAGE_MAX_W, maxH: PAGE_MAX_H });
          } else {
            const halfW = Math.floor(PAGE_MAX_W * 0.50);
            const nextLeft = safePage + 2, prevLeft = safePage - 2;
            if (nextLeft <= total) {
              neighbors.push({ pageNo: nextLeft, key: `${pdfPath}::${nextLeft}::l`, maxW: halfW, maxH: PAGE_MAX_H });
              if (nextLeft + 1 <= total) neighbors.push({ pageNo: nextLeft + 1, key: `${pdfPath}::${nextLeft + 1}::r`, maxW: halfW, maxH: PAGE_MAX_H });
            }
            if (prevLeft >= 1) {
              neighbors.push({ pageNo: prevLeft, key: `${pdfPath}::${prevLeft}::l`, maxW: halfW, maxH: PAGE_MAX_H });
              if (prevLeft + 1 <= total) neighbors.push({ pageNo: prevLeft + 1, key: `${pdfPath}::${prevLeft + 1}::r`, maxW: halfW, maxH: PAGE_MAX_H });
            }
          }
          for (const n of neighbors) {
            if (isCancelled()) break;
            if (cache.has(n.key)) continue;
            await getOrRenderPage(cache, n.key, pdf, n.pageNo, pdfjsLib, n.maxW, n.maxH, isCancelled);
          }
        }
      } catch (err) {
        console.error("PDF render error:", err);
        if (!cancelled && renderIdRef.current === id) setLoading(false);
      }
    }

    go();
    return () => { cancelled = true; };
  }, [pdfPath, safePage, isSpread, total]); // eslint-disable-line

  const zoomTransform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`;

  // Zoom/pan share one `transform`, but only zoom (button/wheel-driven)
  // should ever animate — while actively drag-panning, the transform must
  // track the cursor with zero transition lag, or the drag feels rubbery.
  const zoomTransition = isPanning
    ? "none"
    : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";

  // ── Lightweight page-change transition ───────────────────────────────
  // Deliberately NOT a page-turn animation: no rotateY, no lift/curl, no
  // staged out→in sequence. The page-state change itself already
  // happened (synchronously, in the effect above) — this only decorates
  // however the new content settles in: a short slide + fade so it
  // doesn't feel like the page popped in with no acknowledgement, but
  // fast enough that navigating never feels delayed.
  const ENTER_MS = 150; // within the requested 120-180ms window
  const ENTER_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  const enterDirSign = enterDirRef.current === "prev" ? -1 : 1;

  function getEnterStyle(): React.CSSProperties {
    if (reduceMotion) return { transform: zoomTransform, opacity: 1, transition: zoomTransition };
    if (enterPhase === "start") {
      // Synchronous pre-pose, no transition — the very next frame flips
      // to "end" so the browser actually paints this frame first.
      return { transform: `${zoomTransform} translateX(${enterDirSign * 8}px)`, opacity: 0.92, transition: "none" };
    }
    return { transform: zoomTransform, opacity: 1, transition: `transform ${ENTER_MS}ms ${ENTER_EASE}, opacity ${ENTER_MS}ms ${ENTER_EASE}` };
  }

  function getCardShadow(): { boxShadow: string; transition: string } {
    if (reduceMotion) return { boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)", transition: "none" };
    if (enterPhase === "start") {
      return { boxShadow: `${enterDirSign * 6}px 8px 20px rgba(75,45,12,0.18), inset 0 1px 3px rgba(0,0,0,0.05)`, transition: "none" };
    }
    return { boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)", transition: `box-shadow ${ENTER_MS}ms ${ENTER_EASE}` };
  }
  const flipStyle = getEnterStyle();
  const cardShadow = getCardShadow();

  return (
    <section className="flex h-full flex-col bg-[radial-gradient(circle_at_center,#fff8e8_0%,#ead2a6_50%,#c18a3f_100%)] px-6 py-3">
      {/* Header/footer chrome (title, printed-page badge, Previous/Next,
          progress bar) moved OUT to PremiumReaderPreviewContent (Phase
          C3) — this component now owns only the book card itself, so it
          gets the maximum available reading space. Nothing about how a
          page renders, caches, or transitions changed. */}

      {/* Book card — flex-1 min-h-0 so it fills available column height */}
      <main ref={bookCardRef} className="relative mx-auto flex w-full max-w-[1500px] flex-1 min-h-0 items-center justify-center">
        <div className="absolute bottom-6 h-14 w-[74%] rounded-full bg-black/20 blur-3xl" />

        <div
          className="relative z-10 flex h-full w-full max-w-[1340px] items-center justify-center rounded-[2.5rem] border border-amber-200 bg-[#fffaf0] p-3 shadow-[0_25px_70px_rgba(75,45,12,0.28)]"
          style={{ overflow: zoom > 100 ? "auto" : "hidden", perspective: 1800 }}
        >
          {imageSelectMode && !textSelectMode && (
            <div className="absolute left-4 top-4 z-40 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow ndl-fade-in-scale">
              📐 {t.premiumReaderImageSelect}
            </div>
          )}
          {textSelectMode && (
            <div className="absolute left-4 top-4 z-40 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white shadow ndl-fade-in-scale">
              📝 {t.premiumReaderTextSelect}
            </div>
          )}

          {/* Only the true first-load (nothing has ever been painted yet in
              this reader session) shows a full placeholder — there is no
              "current page" to keep visible in that case. Every later
              navigation keeps the outgoing page on screen and shows just
              this small corner badge instead, per the "no blank frame"
              requirement. */}
          {loading && !singleSize && !leftSize && !rightSize && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#fffaf0]/90 ndl-fade-in-scale">
              <div className="flex flex-col items-center gap-3">
                <div className="ndl-skeleton h-[520px] w-[380px] rounded-[1.5rem] shadow-lg" />
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
                  {t.premiumReaderLoadingPage}
                </div>
              </div>
            </div>
          )}
          {loading && (singleSize || leftSize || rightSize) && (
            <div className="absolute right-4 top-4 z-40 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-slate-500 shadow ndl-fade-in-scale">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
              {t.commonLoading}
            </div>
          )}

          <div style={{
            ...flipStyle,
            transformOrigin: "center center",
            transformStyle: "preserve-3d",
            display: "inline-flex",
            position: "relative",
          }}>
            <div
              className="relative flex items-center justify-center rounded-[2rem] bg-white p-3"
              style={cardShadow}
            >{/* directional shadow during out/enterStart, settles to a flat inset shadow at rest */}
              {!isSpread ? (
                <PageBox
                  canvasRef={canvasRef} textLayerRef={textRef} size={singleSize}
                  textSelectMode={textSelectMode} imageSelectMode={imageSelectMode}
                  pageNumber={safePage}
                  bookId={bookId} highlights={pageHighlights} notes={pageNotes}
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  <PageBox
                    canvasRef={leftCanvasRef} textLayerRef={leftTextRef} size={leftSize}
                    textSelectMode={textSelectMode} imageSelectMode={imageSelectMode}
                    pageNumber={safePage}
                    bookId={bookId} highlights={pageHighlights} notes={pageNotes}
                  />
                  <div style={{ width: 3, alignSelf: "stretch", margin: "8px 0",
                                background: "linear-gradient(to right,#d4c5a9,#e8dfc8,#d4c5a9)",
                                flexShrink: 0, userSelect: "none" }} />
                  {rightPage <= total ? (
                    <PageBox
                      canvasRef={rightCanvasRef} textLayerRef={rightTextRef} size={rightSize}
                      textSelectMode={textSelectMode} imageSelectMode={imageSelectMode}
                      pageNumber={rightPage}
                      bookId={bookId} highlights={pageHighlights} notes={pageNotes}
                    />
                  ) : (
                    <div style={{ width: leftSize?.w || 400, height: leftSize?.h || 600, background: "#fdfcf9", borderRadius: 10 }} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        /*
          PDF.js v4+ injects a global stylesheet with:
            .textLayer { opacity: 0.25; }
          and then adds the "textLayer" class to whatever element is passed
          to renderTextLayer. Our div gets BOTH "ndl-text-layer" and "textLayer",
          so we must override opacity to 1 or the selection highlight is invisible
          (0.28 background × 0.25 opacity = effectively transparent).
        */
        .ndl-text-layer {
          opacity: 1 !important;
        }

        /* Spans: invisible text so canvas shows through */
        .ndl-text-layer span,
        .ndl-text-layer br,
        .ndl-text-layer .markedContent {
          color: transparent !important;
          background: transparent !important; /* override any PDF.js span background-color */
          mix-blend-mode: normal !important;
        }

        /*
          Selection highlight: do NOT set color:transparent here.
          Several browsers suppress the background rendering entirely
          when color:transparent is set inside ::selection (treating
          "invisible text" as "nothing to paint"). The span's own
          color:transparent (above) keeps the text invisible whether
          selected or not — we only need the background here.

          This selection highlight only ever renders in Text Select mode —
          the text layer has pointerEvents:none in Image Select mode, so
          the browser has nothing to select there in the first place.
        */
        .ndl-text-layer span::selection,
        .ndl-text-layer br::selection,
        .ndl-text-layer *::selection {
          background: rgba(59, 130, 246, 0.50) !important;
        }
      `}</style>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

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
  title: string;
  pdfPath: string;
  pageNumber: number;
  totalPages: string;
  onPrevious: () => void;
  onNext: () => void;
  zoom?: number;
  pan?: { x: number; y: number };
  textSelectMode?: boolean;
  imageSelectMode?: boolean;
  /** PHASE 2 — persisted highlights/notes to paint on whichever page(s)
   *  are currently rendered. Filtered by page internally; pass the full
   *  list for the current book. */
  pageHighlights?: PageOverlayHighlight[];
  pageNotes?: PageOverlayNote[];
  /** Current book id — only used for the temporary debug logging below. */
  bookId?: string;
  /**
   * Fires after first render with canvas CSS dims AND the inner book-card
   * container dims so the parent can compute an accurate auto-fit zoom.
   */
  onPageRendered?: (cssW: number, cssH: number, cardW: number, cardH: number) => void;
  /** Fires with extracted text keyed by page number after each render. */
  onTextExtracted?: (texts: Record<number, string>) => void;
  layoutMode?: "single" | "spread";
  /** Triggers a brief fade-slide animation (used by parent on page change). */
  isFlipping?: boolean;
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

    console.log(
      `[TextLayer] page=${pageNo}` +
      ` | spans=${textItems.length}` +
      ` | textLen=${text.length}` +
      ` | canvas=${dW}×${dH}` +
      ` | cropOffset=(${cropOffsetX.toFixed(1)},${cropOffsetY.toFixed(1)})` +
      ` | src=(${srcX},${srcY},${srcW},${srcH})`
    );

    // The text layer div is always sized to exactly cover the canvas —
    // even on image-only pages with zero text spans. This matters under
    // the current architecture: the div (not just its spans) is the
    // drag surface that both text selection AND image-crop dragging rely
    // on, so it must never collapse to 0×0 just because a page has no
    // extractable text.
    textLayer.style.width  = dW + "px";
    textLayer.style.height = dH + "px";

    if (textItems.length === 0) {
      // Image-based or scanned page — no selectable text. AI text-mode
      // actions fall back to OCR on the dragged region (handled by the
      // parent component); this div still exists purely as a drag surface.
      console.warn(`[TextLayer] page=${pageNo}: No text spans — image-based page. Native text selection unavailable; OCR fallback will be used.`);
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

// ── Per-page box: canvas + text layer ───────────────────────────────
// NOTE ON ARCHITECTURE: there is deliberately no separate "image capture
// overlay" here anymore. Both Text Select and Image Select modes share
// the exact same drag surface (the text layer div, which is always sized
// to cover the canvas). The parent component (which owns interactionMode)
// reads window.getSelection() AND is able to crop the canvas from the
// same drag — which one it actually USES is decided purely by mode, in
// one router function. We are not trying to physically stop the browser
// from selecting text in Image Select mode, and we are not trying to stop
// image cropping from working in Text Select mode — both are always
// physically possible; only the AI-facing router cares which mode is on.
function PageBox({ canvasRef, textLayerRef, size, textSelectMode, imageSelectMode, pageNumber, bookId, highlights, notes }: {
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

  // ── TEMPORARY DEBUG (Phase 2 highlight-overlay bugfix) ───────────────
  // Exactly the values requested: bookId, page, rectsPct, and the final
  // rendered overlay count for this page. Safe to remove once confirmed.
  if (typeof window !== "undefined" && (pageHighlights.length > 0 || pageNoteMarkers.length > 0)) {
    console.log(
      `[HighlightOverlay] bookId=${bookId ?? "?"} page=${pageNumber} ` +
      `highlightsForPage=${pageHighlights.length} renderedBoxes=${highlightBoxes.length} notes=${pageNoteMarkers.length}`,
      { rectsPct: pageHighlights.map(h => ({ id: h.id, rectsPct: h.rectsPct })) }
    );
  }

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
      userSelect: isModeActive ? "contain" : "none",
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
          // Interactive in EITHER select mode — this is the shared drag
          // surface for both native text selection and image cropping.
          pointerEvents: isModeActive ? "auto" : "none",
          userSelect: isModeActive ? "text" : "none",
          cursor: imageSelectMode ? "crosshair" : textSelectMode ? "text" : "default",
        }} />
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────
export default function PdfBookSpread({
  title, pdfPath, pageNumber, totalPages,
  onPrevious, onNext,
  zoom = 100, pan = { x: 0, y: 0 },
  textSelectMode = false,
  imageSelectMode = false,
  pageHighlights = [],
  pageNotes = [],
  bookId,
  onPageRendered,
  onTextExtracted,
  layoutMode = "single",
  isFlipping = false,
}: PdfBookSpreadProps) {
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const textRef    = useRef<HTMLDivElement | null>(null);
  const leftCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const leftTextRef    = useRef<HTMLDivElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightTextRef   = useRef<HTMLDivElement | null>(null);
  // Ref to the inner book card div — for measuring available area
  const bookCardRef = useRef<HTMLDivElement | null>(null);

  const renderIdRef = useRef(0);
  const renderedCallbackFired = useRef(false);
  const [loading, setLoading] = useState(false);
  const [singleSize, setSingleSize] = useState<{ w: number; h: number } | null>(null);
  const [leftSize,   setLeftSize]   = useState<{ w: number; h: number } | null>(null);
  const [rightSize,  setRightSize]  = useState<{ w: number; h: number } | null>(null);

  const safePage = Math.max(1, Number(pageNumber) || 1);
  const total    = Math.max(1, Number(totalPages)  || 1);
  const isSpread = layoutMode === "spread" && safePage > 1;
  const rightPage = safePage + 1;

  useEffect(() => {
    const id = ++renderIdRef.current;
    let cancelled = false;
    const isCancelled = () => cancelled || renderIdRef.current !== id;

    setSingleSize(null); setLeftSize(null); setRightSize(null);
    renderedCallbackFired.current = false;
    setLoading(true);

    async function go() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (isCancelled()) return;

        const pdf = await pdfjsLib.getDocument(pdfPath).promise;
        if (isCancelled()) return;

        const extractedTexts: Record<number, string> = {};

        if (!isSpread) {
          if (!canvasRef.current) return;
          const result = await renderPdfPage({
            pdf, pageNo: safePage, canvas: canvasRef.current,
            textLayer: textRef.current, pdfjsLib,
            maxW: PAGE_MAX_W, maxH: PAGE_MAX_H, cancelled: isCancelled,
          });
          if (result && !isCancelled()) {
            setSingleSize({ w: result.cssW, h: result.cssH });
            extractedTexts[safePage] = result.text;
            console.log(`[AI] Page ${safePage} text extracted: ${result.text.length} chars`);
            if (!renderedCallbackFired.current) {
              renderedCallbackFired.current = true;
              // Fire after a tick so bookCardRef has laid out
              requestAnimationFrame(() => {
                const card = bookCardRef.current;
                const cardW = card?.clientWidth  || 0;
                const cardH = card?.clientHeight || 0;
                onPageRendered?.(result.cssW, result.cssH, cardW, cardH);
              });
            }
          }
        } else {
          const halfW = Math.floor(PAGE_MAX_W * 0.50);
          const [lResult, rResult] = await Promise.all([
            leftCanvasRef.current ? renderPdfPage({
              pdf, pageNo: safePage, canvas: leftCanvasRef.current,
              textLayer: leftTextRef.current, pdfjsLib,
              maxW: halfW, maxH: PAGE_MAX_H, cancelled: isCancelled,
            }) : Promise.resolve(null),
            rightPage <= total && rightCanvasRef.current ? renderPdfPage({
              pdf, pageNo: rightPage, canvas: rightCanvasRef.current,
              textLayer: rightTextRef.current, pdfjsLib,
              maxW: halfW, maxH: PAGE_MAX_H, cancelled: isCancelled,
            }) : Promise.resolve(null),
          ]);
          if (!isCancelled()) {
            if (lResult) { setLeftSize({ w: lResult.cssW, h: lResult.cssH }); extractedTexts[safePage] = lResult.text; }
            if (rResult) { setRightSize({ w: rResult.cssW, h: rResult.cssH }); extractedTexts[rightPage] = rResult.text; }
            console.log(`[AI] Spread pages ${safePage}-${rightPage} extracted: ${(lResult?.text?.length||0) + (rResult?.text?.length||0)} chars`);
            if ((lResult || rResult) && !renderedCallbackFired.current) {
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
      } catch (err) {
        console.error("PDF render error:", err);
      } finally {
        if (!cancelled && renderIdRef.current === id) setLoading(false);
      }
    }

    go();
    return () => { cancelled = true; };
  }, [pdfPath, safePage, isSpread, total]); // eslint-disable-line

  const zoomTransform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`;
  const pageLabel = isSpread
    ? `Pages ${safePage}–${Math.min(rightPage, total)} of ${total}`
    : `Page ${safePage} of ${total}`;

  return (
    <section className="flex h-full flex-col bg-[radial-gradient(circle_at_center,#fff8e8_0%,#ead2a6_50%,#c18a3f_100%)] px-6 py-3">
      <header className="mx-auto mb-3 flex w-full max-w-[1500px] flex-shrink-0 items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-800">National Digital Library AI</p>
          <h1 className="mt-0.5 text-2xl font-black text-slate-950">{title}</h1>
        </div>
        <div className="rounded-full bg-white/80 px-4 py-1.5 text-sm font-bold text-slate-700 shadow">
          {pageLabel}
        </div>
      </header>

      {/* Book card — flex-1 min-h-0 so it fills available column height */}
      <main ref={bookCardRef} className="relative mx-auto flex w-full max-w-[1500px] flex-1 min-h-0 items-center justify-center">
        <div className="absolute bottom-6 h-14 w-[74%] rounded-full bg-black/20 blur-3xl" />

        <div
          className="relative z-10 flex h-full w-full max-w-[1340px] items-center justify-center rounded-[2.5rem] border border-amber-200 bg-[#fffaf0] p-3 shadow-[0_25px_70px_rgba(75,45,12,0.28)]"
          style={{ overflow: zoom > 100 ? "auto" : "hidden" }}
        >
          {imageSelectMode && !textSelectMode && (
            <div className="absolute left-4 top-4 z-40 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow">
              📐 Image Select Mode
            </div>
          )}
          {textSelectMode && (
            <div className="absolute left-4 top-4 z-40 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white shadow">
              📝 Text Select
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#fffaf0]/80">
              <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-3 shadow-lg">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
                <span className="text-sm font-bold text-slate-600">Loading…</span>
              </div>
            </div>
          )}

          <div style={{
            transform: zoomTransform,
            transformOrigin: "center center",
            transition: "transform 100ms ease",
            display: "inline-flex",
            position: "relative",
            opacity: isFlipping ? 0 : 1,
            scale: isFlipping ? "0.97" : "1",
            transitionProperty: "transform, opacity, scale",
            transitionDuration: "150ms",
            transitionTimingFunction: "ease",
          }}>
            <div className="relative flex items-center justify-center rounded-[2rem] bg-white p-3 shadow-inner">
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

      <footer className="mx-auto mt-3 flex w-full max-w-[1300px] flex-shrink-0 items-center justify-between gap-5">
        <button onClick={onPrevious} className="rounded-full bg-slate-950 px-7 py-2.5 text-sm font-black text-white shadow-xl">
          ← Previous
        </button>
        <div className="flex-1">
          <div className="h-2.5 rounded-full bg-white/75 shadow-inner">
            <div className="h-2.5 rounded-full bg-amber-500"
              style={{ width: `${Math.min(100, Math.round((safePage / total) * 100))}%` }} />
          </div>
        </div>
        <button onClick={onNext} className="rounded-full bg-blue-600 px-7 py-2.5 text-sm font-black text-white shadow-xl">
          Next →
        </button>
      </footer>

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

          We are not trying to hide or fight this native highlight in
          Image Select mode anymore — it may legitimately show while the
          user drags to crop an image, and that's fine; the AI router
          simply ignores it in that mode.
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  onImageCapture?: (dataUrl: string, pageNumber: number) => void;
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
    const tVP = page.getViewport({ scale: displayScale });
    const cropOffsetX = (srcX / OS) * displayScale;
    const cropOffsetY = (srcY / OS) * displayScale;
    textLayer.style.width = Math.round(tVP.width) + "px";
    textLayer.style.height = Math.round(tVP.height) + "px";
    textLayer.style.transform = `translate(${-cropOffsetX}px, ${-cropOffsetY}px)`;
    try {
      const task = pdfjsLib.renderTextLayer({
        textContentSource: page.streamTextContent(), container: textLayer, viewport: tVP,
      });
      if (task?.promise) await task.promise; else if (task?.then) await task;
    } catch {
      try {
        (textContent.items as any[]).forEach((item: any) => {
          if (!item.str?.trim()) return;
          const span = document.createElement("span");
          span.textContent = item.str + (item.hasEOL ? "\n" : " ");
          const [a, , , d, e, f] = item.transform;
          const pt = tVP.convertToViewportPoint(e, f);
          span.style.cssText = [
            "position:absolute", `left:${pt[0]}px`,
            `top:${pt[1] - Math.abs(d) * displayScale}px`,
            `font-size:${Math.abs(d) * displayScale}px`,
            "font-family:sans-serif", "white-space:pre", "color:transparent", "cursor:text",
          ].join(";");
          textLayer.appendChild(span);
        });
      } catch {}
    }
  }

  return { cssW: dW, cssH: dH, text };
}

// ── Per-page image selection overlay ───────────────────────────────
// One instance per PageBox. Pointer events are captured on this overlay
// (position:absolute; inset:0 inside PageBox). The selection rectangle
// is rendered via createPortal to document.body with position:fixed —
// this bypasses all ancestor CSS transforms (zoom scale) so the rectangle
// always appears at the exact screen position of the drag, every time.
function ImageSelectOverlay({ canvasRef, pageNumber, onCapture }: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  pageNumber: number;
  onCapture: (dataUrl: string, pageNumber: number) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  // Cleanup on unmount — release any active pointer capture so events don't
  // get routed to a dead overlay element after the component is removed.
  useEffect(() => {
    return () => {
      dragStartRef.current = null;
      if (activePointerIdRef.current !== null && overlayRef.current) {
        try { overlayRef.current.releasePointerCapture(activePointerIdRef.current); } catch {}
        activePointerIdRef.current = null;
      }
    };
  }, []);
  // screenRect: VIEWPORT coordinates — used both for createPortal rectangle
  // rendering AND for canvas buffer coordinate mapping via getBoundingClientRect
  const [screenRect, setScreenRect] = useState<{
    left: number; top: number; width: number; height: number;
  } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    overlayRef.current?.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setScreenRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
    console.log(`[ImageSelect] ▼ pointerDown page=${pageNumber} at (${Math.round(e.clientX)}, ${Math.round(e.clientY)})`);
  }, [pageNumber]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const s = dragStartRef.current;
    const left   = Math.min(s.x, e.clientX);
    const top    = Math.min(s.y, e.clientY);
    const width  = Math.abs(e.clientX - s.x);
    const height = Math.abs(e.clientY - s.y);
    setScreenRect({ left, top, width, height });
    if (width > 20 && height > 20) {
      console.log(`[ImageSelect] ↔ move ${Math.round(width)}×${Math.round(height)} screen px`);
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    overlayRef.current?.releasePointerCapture(e.pointerId);
    activePointerIdRef.current = null;
    const r = screenRect;
    const canvas = canvasRef.current;
    dragStartRef.current = null;
    setScreenRect(null); // always clear rectangle on up

    console.log(`[ImageSelect] ▲ pointerUp rect=${r ? `${Math.round(r.width)}×${Math.round(r.height)}` : "null"}`);

    if (!r || r.width < 8 || r.height < 8) {
      console.warn("[ImageSelect] Too small — skip");
      return;
    }
    if (!canvas) {
      console.warn("[ImageSelect] No canvas ref");
      return;
    }

    // canvas.getBoundingClientRect() is in SCREEN pixels (post-zoom, post-transform)
    const canvasRect = canvas.getBoundingClientRect();
    console.log(`[ImageSelect] canvas screen=${Math.round(canvasRect.width)}×${Math.round(canvasRect.height)} buf=${canvas.width}×${canvas.height}`);

    // Intersect drag screen rect with canvas screen rect
    const selLeft   = Math.max(r.left,          canvasRect.left);
    const selTop    = Math.max(r.top,           canvasRect.top);
    const selRight  = Math.min(r.left + r.width, canvasRect.right);
    const selBottom = Math.min(r.top  + r.height, canvasRect.bottom);

    if (selRight <= selLeft || selBottom <= selTop) {
      console.warn("[ImageSelect] Selection does not intersect canvas");
      return;
    }

    // Map screen coords → canvas buffer coords
    // bufScale = buffer pixels per screen pixel, accounts for zoom & DPR
    const bufScaleX = canvas.width  / canvasRect.width;
    const bufScaleY = canvas.height / canvasRect.height;
    const sx = Math.max(0, Math.round((selLeft   - canvasRect.left) * bufScaleX));
    const sy = Math.max(0, Math.round((selTop    - canvasRect.top)  * bufScaleY));
    const sw = Math.min(Math.round((selRight  - selLeft)  * bufScaleX), canvas.width  - sx);
    const sh = Math.min(Math.round((selBottom - selTop)   * bufScaleY), canvas.height - sy);

    console.log(`[ImageSelect] crop sx=${sx} sy=${sy} sw=${sw} sh=${sh} bufScale=${bufScaleX.toFixed(2)}×${bufScaleY.toFixed(2)}`);

    if (sw < 4 || sh < 4) {
      console.warn("[ImageSelect] Buffer crop too small");
      return;
    }

    const crop = document.createElement("canvas");
    crop.width = sw; crop.height = sh;
    const ctx = crop.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    let dataUrl = "";
    try { dataUrl = crop.toDataURL("image/png"); } catch (err) {
      console.error("[ImageSelect] toDataURL:", err); return;
    }
    console.log(`[ImageSelect] ✓ base64 length=${dataUrl.length} page=${pageNumber}`);
    if (dataUrl.length < 100) { console.warn("[ImageSelect] Empty dataUrl"); return; }

    onCapture(dataUrl, pageNumber);
  }, [screenRect, canvasRef, pageNumber, onCapture]);

  return (
    <>
      {/* Pointer-event capture layer, fills PageBox exactly */}
      <div
        ref={overlayRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: "absolute", inset: 0,
          cursor: "crosshair", zIndex: 30,
          userSelect: "none",
        }}
      />

      {/* Rectangle via portal: position:fixed on document.body so it renders
          at exact viewport coordinates, completely unaffected by zoom transforms */}
      {screenRect && screenRect.width > 2 && screenRect.height > 2 &&
        typeof document !== "undefined" &&
        createPortal(
          <div style={{
            position: "fixed",
            left:   screenRect.left,
            top:    screenRect.top,
            width:  screenRect.width,
            height: screenRect.height,
            border: "2px solid #3b82f6",
            background: "rgba(59,130,246,0.15)",
            boxSizing: "border-box",
            pointerEvents: "none",
            zIndex: 99999,
          }} />,
          document.body
        )
      }
    </>
  );
}

function PageBox({ canvasRef, textLayerRef, size, textSelectMode, imageSelectMode, pageNumber, onCapture }: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  textLayerRef: React.RefObject<HTMLDivElement | null>;
  size: { w: number; h: number } | null;
  textSelectMode: boolean;
  imageSelectMode: boolean;
  pageNumber: number;
  onCapture?: (dataUrl: string, pageNumber: number) => void;
}) {
  return (
    <div style={{ position: "relative", width: size?.w || undefined, height: size?.h || undefined, display: size ? "block" : "none" }}>
      <canvas ref={canvasRef} data-pdf-page={pageNumber} style={{ display: "block", borderRadius: 10 }} />
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div ref={textLayerRef} className="ndl-text-layer" style={{
          position: "absolute", top: 0, left: 0,
          pointerEvents: (textSelectMode && !imageSelectMode) ? "auto" : "none",
          userSelect: (textSelectMode && !imageSelectMode) ? "text" : "none",
          cursor: (textSelectMode && !imageSelectMode) ? "text" : "default",
        }} />
      </div>
      {/* Per-page image select overlay — renders rect via portal so zoom transform doesn't affect it */}
      {imageSelectMode && onCapture && (
        <ImageSelectOverlay canvasRef={canvasRef} pageNumber={pageNumber} onCapture={onCapture} />
      )}
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
  onImageCapture,
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

          {/* No global overlay — each PageBox has its own ImageSelectOverlay */}

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
                  pageNumber={safePage} onCapture={onImageCapture}
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  <PageBox
                    canvasRef={leftCanvasRef} textLayerRef={leftTextRef} size={leftSize}
                    textSelectMode={textSelectMode} imageSelectMode={imageSelectMode}
                    pageNumber={safePage} onCapture={onImageCapture}
                  />
                  <div style={{ width: 3, alignSelf: "stretch", margin: "8px 0",
                                background: "linear-gradient(to right,#d4c5a9,#e8dfc8,#d4c5a9)", flexShrink: 0 }} />
                  {rightPage <= total ? (
                    <PageBox
                      canvasRef={rightCanvasRef} textLayerRef={rightTextRef} size={rightSize}
                      textSelectMode={textSelectMode} imageSelectMode={imageSelectMode}
                      pageNumber={rightPage} onCapture={onImageCapture}
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
        .ndl-text-layer span, .ndl-text-layer br, .ndl-text-layer .markedContent {
          color: transparent !important;
        }
        .ndl-text-layer span::selection, .ndl-text-layer *::selection {
          background: rgba(59,130,246,0.28) !important;
          color: transparent !important;
        }
      `}</style>
    </section>
  );
}

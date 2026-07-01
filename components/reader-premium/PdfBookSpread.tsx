"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PdfBookSpreadProps = {
  title: string;
  pdfPath: string;
  pageNumber: number;
  totalPages: string;
  onPrevious: () => void;
  onNext: () => void;
  /** 100 = fit (default). CSS transform zoom — no canvas re-render. */
  zoom?: number;
  /** Pan offset in CSS pixels, applied together with zoom transform. */
  pan?: { x: number; y: number };
  imageSelectMode?: boolean;
  onImageCapture?: (dataUrl: string, pageNumber: number) => void;
};

const SAMPLE_STEP = 2;
const WHITE_THRESHOLD = 245;
const SAFE_PADDING = 8;
const MIN_CROP_FRACTION = 0.05;

interface CropBox { x: number; y: number; w: number; h: number }

function detectContentBounds(
  data: Uint8ClampedArray, canvasW: number, canvasH: number
): CropBox | null {
  let minX = canvasW, minY = canvasH, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < canvasH; y += SAMPLE_STEP) {
    for (let x = 0; x < canvasW; x += SAMPLE_STEP) {
      const idx = (y * canvasW + x) * 4;
      if (data[idx + 3] < 10) continue;
      if (data[idx] >= WHITE_THRESHOLD && data[idx+1] >= WHITE_THRESHOLD && data[idx+2] >= WHITE_THRESHOLD) continue;
      found = true;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  if (!found) return null;
  const x = Math.max(0, minX - SAFE_PADDING);
  const y = Math.max(0, minY - SAFE_PADDING);
  const w = Math.min(canvasW, maxX + SAFE_PADDING) - x;
  const h = Math.min(canvasH, maxY + SAFE_PADDING) - y;
  if (w < canvasW * MIN_CROP_FRACTION || h < canvasH * MIN_CROP_FRACTION) return null;
  return { x, y, w, h };
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 1; canvas.height = 1;
}

// ── Image selection overlay ──────────────────────────────────────────
interface DragRect { x: number; y: number; w: number; h: number }

function ImageSelectOverlay({
  canvasRef, pageNumber, onCapture,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  pageNumber: number;
  onCapture: (dataUrl: string, pageNumber: number) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<DragRect | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = overlayRef.current; if (!el) return;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    dragStart.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    setDrag({ x: e.clientX - r.left, y: e.clientY - r.top, w: 0, h: 0 });
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const el = overlayRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    setDrag({
      x: Math.min(dragStart.current.x, cx), y: Math.min(dragStart.current.y, cy),
      w: Math.abs(cx - dragStart.current.x), h: Math.abs(cy - dragStart.current.y),
    });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    overlayRef.current?.releasePointerCapture(e.pointerId);
    if (!drag || drag.w < 8 || drag.h < 8) { dragStart.current = null; setDrag(null); return; }
    const canvas = canvasRef.current;
    if (!canvas) { dragStart.current = null; setDrag(null); return; }
    const canvasRect = canvas.getBoundingClientRect();
    const overlayRect = overlayRef.current!.getBoundingClientRect();
    const cssX = overlayRect.left + drag.x - canvasRect.left;
    const cssY = overlayRect.top + drag.y - canvasRect.top;
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    let sx = Math.max(0, Math.round(cssX * scaleX));
    let sy = Math.max(0, Math.round(cssY * scaleY));
    let sw = Math.max(1, Math.min(Math.round(drag.w * scaleX), canvas.width - sx));
    let sh = Math.max(1, Math.min(Math.round(drag.h * scaleY), canvas.height - sy));
    const crop = document.createElement("canvas");
    crop.width = sw; crop.height = sh;
    const ctx = crop.getContext("2d");
    if (ctx) {
      ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      try { onCapture(crop.toDataURL("image/png"), pageNumber); } catch {}
    }
    dragStart.current = null; setDrag(null);
  }, [drag, canvasRef, pageNumber, onCapture]);

  return (
    <div
      ref={overlayRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ position: "absolute", inset: 0, cursor: "crosshair", zIndex: 30 }}
    >
      {drag && drag.w > 2 && drag.h > 2 && (
        <div style={{
          position: "absolute", left: drag.x, top: drag.y, width: drag.w, height: drag.h,
          border: "2px dashed #3b82f6", background: "rgba(59,130,246,0.12)", pointerEvents: "none",
        }} />
      )}
      <div style={{
        position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.72)", color: "#fff", borderRadius: 999,
        padding: "4px 14px", fontSize: 11, fontWeight: 700, pointerEvents: "none", whiteSpace: "nowrap",
      }}>
        Drag to select an image or diagram region
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────
export default function PdfBookSpread({
  title, pdfPath, pageNumber, totalPages,
  onPrevious, onNext,
  zoom = 100, pan = { x: 0, y: 0 },
  imageSelectMode = false, onImageCapture,
}: PdfBookSpreadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const renderIdRef = useRef(0);
  const [loading, setLoading] = useState(false);
  // Rendered canvas CSS dimensions — the text layer must match these exactly.
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const safePage = Number(pageNumber) || 1;
  const total = Number(totalPages || 1);

  useEffect(() => {
    const currentRenderId = ++renderIdRef.current;
    clearCanvas(canvasRef.current);
    // Clear text layer
    if (textLayerRef.current) textLayerRef.current.innerHTML = "";
    setCanvasSize({ w: 0, h: 0 });
    let cancelled = false;

    async function renderBook() {
      try {
        setLoading(true);
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (cancelled || renderIdRef.current !== currentRenderId) return;

        const pdf = await pdfjsLib.getDocument(pdfPath).promise;
        if (cancelled || renderIdRef.current !== currentRenderId) return;
        if (safePage > pdf.numPages) return;

        const page = await pdf.getPage(safePage);
        if (cancelled || renderIdRef.current !== currentRenderId) return;

        // ── Render canvas ──────────────────────────────────────────
        const MAX_W = 1250, MAX_H = 900;
        const offscreenScale = 2;
        const offscreenVP = page.getViewport({ scale: offscreenScale });

        const offscreen = document.createElement("canvas");
        offscreen.width = Math.ceil(offscreenVP.width);
        offscreen.height = Math.ceil(offscreenVP.height);
        const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
        if (!offCtx) return;
        offCtx.fillStyle = "#ffffff";
        offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
        await page.render({ canvasContext: offCtx, viewport: offscreenVP, canvas: offscreen }).promise;
        if (cancelled || renderIdRef.current !== currentRenderId) return;

        // Crop whitespace
        let srcX = 0, srcY = 0, srcW = offscreen.width, srcH = offscreen.height;
        try {
          const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
          const crop = detectContentBounds(imgData.data, offscreen.width, offscreen.height);
          if (crop) { srcX = crop.x; srcY = crop.y; srcW = crop.w; srcH = crop.h; }
        } catch {}

        const aspect = srcW / srcH;
        let destW: number, destH: number;
        if (aspect > MAX_W / MAX_H) { destW = MAX_W; destH = Math.floor(MAX_W / aspect); }
        else { destH = MAX_H; destW = Math.floor(MAX_H * aspect); }
        if (!destW || !destH) return;

        const canvas = canvasRef.current;
        if (!canvas || cancelled || renderIdRef.current !== currentRenderId) return;
        canvas.width = destW; canvas.height = destH;
        canvas.style.width = `${destW}px`; canvas.style.height = `${destH}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, destW, destH);
        ctx.drawImage(offscreen, srcX, srcY, srcW, srcH, 0, 0, destW, destH);

        // ── Render text layer for native text selection ────────────
        // The text layer must use the SAME scale as the CSS display
        // dimensions (destW/destH), not the offscreen render scale.
        // We get the native 1x viewport, then scale it so text items
        // land exactly over the cropped/resized canvas pixels.
        const nativeVP = page.getViewport({ scale: 1 });
        // Scale factors from native PDF units → display CSS pixels,
        // accounting for the whitespace crop (srcX/srcY/srcW/srcH in
        // offscreen coords → convert back to native PDF units).
        const cropScaleX = offscreen.width / srcW;   // how much of offscreen is content
        const cropScaleY = offscreen.height / srcH;
        const displayScaleX = destW / (nativeVP.width * offscreenScale / cropScaleX);
        const displayScaleY = destH / (nativeVP.height * offscreenScale / cropScaleY);
        const displayScale = Math.min(displayScaleX, displayScaleY);
        const textVP = page.getViewport({ scale: displayScale });

        if (textLayerRef.current && !cancelled && renderIdRef.current === currentRenderId) {
          const tl = textLayerRef.current;
          tl.innerHTML = "";
          tl.style.width = `${destW}px`;
          tl.style.height = `${destH}px`;

          try {
            // PDF.js v5: renderTextLayer takes { textContentSource, container, viewport }
            const task = (pdfjsLib as any).renderTextLayer({
              textContentSource: page.streamTextContent(),
              container: tl,
              viewport: textVP,
            });
            // task may return an object with .promise or be a promise itself
            if (task?.promise) await task.promise;
            else if (task?.then) await task;
          } catch (e) {
            // Fallback: manually place text spans from getTextContent
            try {
              const tc = await page.getTextContent();
              tc.items.forEach((item: any) => {
                if (!item.str?.trim()) return;
                const span = document.createElement("span");
                span.textContent = item.str + (item.hasEOL ? "\n" : " ");
                // item.transform = [a, b, c, d, e, f] in PDF coords
                const [a, b, c, d, e, f] = item.transform;
                // Convert PDF Y (bottom-up) to CSS Y (top-down) using viewport
                const tx = textVP.convertToViewportPoint(e, f);
                const fontSize = Math.sqrt(a * a + b * b) * displayScale;
                span.style.cssText = `
                  position:absolute;
                  left:${tx[0]}px;
                  top:${tx[1] - fontSize}px;
                  font-size:${fontSize}px;
                  font-family:sans-serif;
                  white-space:pre;
                  color:transparent;
                  cursor:text;
                  transform-origin:0 0;
                  user-select:text;
                `;
                tl.appendChild(span);
              });
            } catch {}
          }

          setCanvasSize({ w: destW, h: destH });
        }
      } catch (err) {
        console.error("PDF render error:", err);
      } finally {
        if (!cancelled && renderIdRef.current === currentRenderId) setLoading(false);
      }
    }

    renderBook();
    return () => { cancelled = true; };
  }, [pdfPath, safePage]);

  // Zoom + pan transform — applied to canvas+textlayer wrapper
  const scale = zoom / 100;
  const zoomTransform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;

  return (
    <section className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_center,#fff8e8_0%,#ead2a6_50%,#c18a3f_100%)] px-8 py-6">
      <header className="mx-auto mb-5 flex w-full max-w-[1500px] items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-800">National Digital Library AI</p>
          <h1 className="mt-1 text-3xl font-black text-slate-950">{title}</h1>
        </div>
        <div className="rounded-full bg-white/80 px-5 py-2 text-sm font-bold text-slate-700 shadow">
          Page {safePage} of {total}
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-[1500px] flex-1 items-center justify-center">
        <div className="absolute bottom-8 h-20 w-[74%] rounded-full bg-black/30 blur-3xl" />

        <div
          className="relative z-10 flex min-h-[760px] w-full max-w-[1340px] items-center justify-center rounded-[2.5rem] border border-amber-200 bg-[#fffaf0] p-5 shadow-[0_35px_90px_rgba(75,45,12,0.30)]"
          style={{ overflow: zoom > 100 ? "auto" : "hidden" }}
        >
          {imageSelectMode && (
            <div className="absolute left-4 top-4 z-40 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow">
              📐 Image Select Mode
            </div>
          )}

          {/* Zoom + pan wrapper — this is what transforms, not the outer card */}
          <div
            style={{
              transform: zoomTransform,
              transformOrigin: "center center",
              transition: "transform 120ms ease",
              display: "inline-flex",
              position: "relative",
            }}
          >
            <div className="relative flex items-center justify-center rounded-[2rem] bg-white p-3 shadow-inner">
              {loading && (
                <div className="absolute top-5 z-20 rounded-full bg-white/90 px-4 py-2 text-xs font-bold text-slate-500 shadow">
                  Loading page...
                </div>
              )}

              {/* Canvas */}
              <canvas
                ref={canvasRef}
                style={{ display: loading ? "none" : "block", maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }}
              />

              {/* Text layer — absolutely positioned over canvas, same size */}
              <div
                ref={textLayerRef}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%)`,
                  width: canvasSize.w || 0,
                  height: canvasSize.h || 0,
                  overflow: "hidden",
                  pointerEvents: imageSelectMode ? "none" : "auto",
                  userSelect: imageSelectMode ? "none" : "text",
                  // Text layer CSS: text is invisible but selectable
                }}
              />

              {/* Image select overlay sits above text layer */}
              {imageSelectMode && !loading && onImageCapture && (
                <ImageSelectOverlay canvasRef={canvasRef} pageNumber={safePage} onCapture={onImageCapture} />
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="mx-auto mt-5 flex w-full max-w-[1300px] items-center justify-between gap-5">
        <button onClick={onPrevious} className="rounded-full bg-slate-950 px-8 py-3 text-sm font-black text-white shadow-xl">
          ← Previous
        </button>
        <div className="flex-1">
          <div className="h-3 rounded-full bg-white/75 shadow-inner">
            <div className="h-3 rounded-full bg-amber-500" style={{ width: `${Math.min(100, Math.round((safePage / total) * 100))}%` }} />
          </div>
        </div>
        <button onClick={onNext} className="rounded-full bg-blue-600 px-8 py-3 text-sm font-black text-white shadow-xl">
          Next →
        </button>
      </footer>

      {/* Global text layer selection style */}
      <style>{`
        .textLayer span, .textLayer br { color: transparent; cursor: text; }
        .textLayer ::selection { background: rgba(59,130,246,0.28); color: transparent; }
        .textLayer span::selection { background: rgba(59,130,246,0.28); }
      `}</style>
    </section>
  );
}

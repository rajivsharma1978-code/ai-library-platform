"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type PdfBookSpreadProps = {
  title: string;
  pdfPath: string;
  pageNumber: number;
  totalPages: string;
  onPrevious: () => void;
  onNext: () => void;
};

type PageMode = "adaptive-single";

const SAMPLE_STEP = 2;
const WHITE_THRESHOLD = 245;
const SAFE_PADDING = 8;
const MIN_CROP_FRACTION = 0.05;

interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function detectContentBounds(
  data: Uint8ClampedArray,
  canvasW: number,
  canvasH: number
): CropBox | null {
  let minX = canvasW;
  let minY = canvasH;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < canvasH; y += SAMPLE_STEP) {
    for (let x = 0; x < canvasW; x += SAMPLE_STEP) {
      const idx = (y * canvasW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 10) continue;
      if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) continue;

      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!found) return null;

  const x = Math.max(0, minX - SAFE_PADDING);
  const y = Math.max(0, minY - SAFE_PADDING);
  const w = Math.min(canvasW, maxX + SAFE_PADDING) - x;
  const h = Math.min(canvasH, maxY + SAFE_PADDING) - y;

  if (w < canvasW * MIN_CROP_FRACTION || h < canvasH * MIN_CROP_FRACTION) {
    return null;
  }

  return { x, y, w, h };
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 1;
  canvas.height = 1;
}

export default function PdfBookSpread({
  title,
  pdfPath,
  pageNumber,
  totalPages,
  onPrevious,
  onNext,
}: PdfBookSpreadProps) {
  const singleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderIdRef = useRef(0);

  const [loading, setLoading] = useState(false);
  const [pageMode] = useState<PageMode>("adaptive-single");

  const safePage = Number(pageNumber) || 1;
  const total = Number(totalPages || 1);

  useEffect(() => {
    const currentRenderId = ++renderIdRef.current;
    clearCanvas(singleCanvasRef.current);

    let cancelled = false;

    async function renderPageToCanvas(
      pdf: pdfjsLib.PDFDocumentProxy,
      pageNo: number,
      canvas: HTMLCanvasElement | null,
      maxWidth: number,
      maxHeight: number
    ) {
      if (!canvas || pageNo > pdf.numPages) return;

      const page = await pdf.getPage(pageNo);

      if (cancelled || renderIdRef.current !== currentRenderId) return;

      const baseViewport = page.getViewport({ scale: 1 });

      const offscreenScale = 2;
      const offscreenViewport = page.getViewport({ scale: offscreenScale });

      const offscreen = document.createElement("canvas");
      offscreen.width = Math.ceil(offscreenViewport.width);
      offscreen.height = Math.ceil(offscreenViewport.height);

      const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
      if (!offCtx) return;

      offCtx.fillStyle = "#ffffff";
      offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

      await page.render({
        canvasContext: offCtx,
        viewport: offscreenViewport,
        canvas: offscreen,
      }).promise;

      if (cancelled || renderIdRef.current !== currentRenderId) return;

      let srcX = 0;
      let srcY = 0;
      let srcW = offscreen.width;
      let srcH = offscreen.height;

      try {
        const imageData = offCtx.getImageData(
          0,
          0,
          offscreen.width,
          offscreen.height
        );

        const crop = detectContentBounds(
          imageData.data,
          offscreen.width,
          offscreen.height
        );

        if (crop) {
          srcX = crop.x;
          srcY = crop.y;
          srcW = crop.w;
          srcH = crop.h;
        }
      } catch (error) {
        console.warn("NDL PDF crop fallback:", error);
      }

      const cropAspect = srcW / srcH;
      const containerAspect = maxWidth / maxHeight;

      let destW: number;
      let destH: number;

      if (cropAspect > containerAspect) {
        destW = maxWidth;
        destH = Math.floor(maxWidth / cropAspect);
      } else {
        destH = maxHeight;
        destW = Math.floor(maxHeight * cropAspect);
      }

      if (!destW || !destH || destW < 1 || destH < 1) return;

      if (cancelled || renderIdRef.current !== currentRenderId) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = destW;
      canvas.height = destH;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, destW, destH);

      ctx.drawImage(
        offscreen,
        srcX,
        srcY,
        srcW,
        srcH,
        0,
        0,
        destW,
        destH
      );

      console.warn("NDL crop render:", {
        pageNo,
        pdfWidth: baseViewport.width,
        pdfHeight: baseViewport.height,
        srcW,
        srcH,
        destW,
        destH,
      });
    }

    async function renderBook() {
      try {
        setLoading(true);

        const pdf = await pdfjsLib.getDocument(pdfPath).promise;

        if (cancelled || renderIdRef.current !== currentRenderId) return;

        await renderPageToCanvas(
          pdf,
          safePage,
          singleCanvasRef.current,
          1250,
          900
        );
      } catch (error) {
        console.error("PDF render error:", error);
      } finally {
        if (!cancelled && renderIdRef.current === currentRenderId) {
          setLoading(false);
        }
      }
    }

    renderBook();

    return () => {
      cancelled = true;
    };
  }, [pdfPath, safePage]);

  return (
    <section className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_center,#fff8e8_0%,#ead2a6_50%,#c18a3f_100%)] px-8 py-6">
      <header className="mx-auto mb-5 flex w-full max-w-[1500px] items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-800">
            National Digital Library AI
          </p>
          <h1 className="mt-1 text-3xl font-black text-slate-950">{title}</h1>
        </div>

        <div className="rounded-full bg-white/80 px-5 py-2 text-sm font-bold text-slate-700 shadow">
          Page {safePage} of {total}
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-[1500px] flex-1 items-center justify-center">
        <div className="absolute bottom-8 h-20 w-[74%] rounded-full bg-black/30 blur-3xl" />

        {pageMode === "adaptive-single" && (
          <div className="relative z-10 flex min-h-[760px] w-full max-w-[1340px] items-center justify-center rounded-[2.5rem] border border-amber-200 bg-[#fffaf0] p-5 shadow-[0_35px_90px_rgba(75,45,12,0.30)]">
            <div className="relative flex items-center justify-center rounded-[2rem] bg-white p-3 shadow-inner">
              {loading && (
                <div className="absolute top-5 z-20 rounded-full bg-white/90 px-4 py-2 text-xs font-bold text-slate-500 shadow">
                  Loading page...
                </div>
              )}

              <canvas
                ref={singleCanvasRef}
                className="max-h-full max-w-full rounded-xl"
              />
            </div>
          </div>
        )}
      </main>

      <footer className="mx-auto mt-5 flex w-full max-w-[1300px] items-center justify-between gap-5">
        <button
          onClick={onPrevious}
          className="rounded-full bg-slate-950 px-8 py-3 text-sm font-black text-white shadow-xl"
        >
          ← Previous
        </button>

        <div className="flex-1">
          <div className="h-3 rounded-full bg-white/75 shadow-inner">
            <div
              className="h-3 rounded-full bg-amber-500"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((safePage / Number(totalPages || safePage)) * 100)
                )}%`,
              }}
            />
          </div>
        </div>

        <button
          onClick={onNext}
          className="rounded-full bg-blue-600 px-8 py-3 text-sm font-black text-white shadow-xl"
        >
          Next →
        </button>
      </footer>
    </section>
  );
}
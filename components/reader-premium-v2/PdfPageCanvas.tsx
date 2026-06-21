"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

interface PdfPageCanvasProps {
  pdf: PDFDocumentProxy | null;
  pageNumber: number;
  width: number;
  height: number;
  className?: string;
  onRendered?: (dims: { width: number; height: number }) => void;
}

export default function PdfPageCanvas({
  pdf,
  pageNumber,
  width,
  height,
  className,
  onRendered,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderIdRef = useRef(0);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!pdf || width <= 0 || height <= 0) return;

const safePdf = pdf;
const currentRenderId = ++renderIdRef.current;
    let cancelled = false;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    async function render() {
      setIsLoading(true);

      try {
        const page = await safePdf.getPage(pageNumber);
        if (cancelled || renderIdRef.current !== currentRenderId) return;

        const nativeViewport = page.getViewport({ scale: 1 });
        const nativeWidth = nativeViewport.width;
        const nativeHeight = nativeViewport.height;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const fitScale = Math.min(width / nativeWidth, height / nativeHeight);
        const renderScale = fitScale * dpr;

        const viewport = page.getViewport({ scale: renderScale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        const cssWidth = Math.round(nativeWidth * fitScale);
        const cssHeight = Math.round(nativeHeight * fitScale);

        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const task = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        });
        renderTaskRef.current = task;

        await task.promise;

        if (renderTaskRef.current === task) {
          renderTaskRef.current = null;
        }

        if (cancelled || renderIdRef.current !== currentRenderId) return;

        setRenderedSize({ width: cssWidth, height: cssHeight });

        onRendered?.({ width: nativeWidth, height: nativeHeight });

        setIsLoading(false);
      } catch (err: any) {
        if (err?.name === "RenderingCancelledException") return;

        console.error(`[PdfPageCanvas] render error on page ${pageNumber}:`, err);
        if (!cancelled && renderIdRef.current === currentRenderId) {
          setIsLoading(false);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdf, pageNumber, width, height, onRendered]);

  return (
    <div
      className={className}
      style={{
        width,
        height,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fdfcf9",
        overflow: "hidden",
      }}
    >
      {isLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fdfcf9",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "3px solid #e5e7eb",
              borderTopColor: "#9a6b2f",
              animation: "ndl-spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes ndl-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: renderedSize.width || undefined,
          height: renderedSize.height || undefined,
          display: isLoading ? "none" : "block",
        }}
      />
    </div>
  );
}
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

  useEffect(() => {
    if (!pdf || width <= 0 || height <= 0) return;

const safePdf = pdf;
const currentRenderId = ++renderIdRef.current;
let cancelled = false;

    // Cancel any render still in flight on this canvas before starting
    // a new one — this is the actual fix. Without this, pdfjs throws
    // "Cannot use the same canvas during multiple render() operations."
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    async function render() {
      setIsLoading(true);

      try {
        const page = await safePdf.getPage(pageNumber); 
        if (cancelled || renderIdRef.current !== currentRenderId) return;

        const naturalViewport = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = (width / naturalViewport.width) * dpr;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Track the render task so it can be cancelled if this effect
        // re-runs (new page/size) before the render finishes.
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

        onRendered?.({
          width: naturalViewport.width,
          height: naturalViewport.height,
        });

        setIsLoading(false);
      } catch (err: any) {
        // pdfjs throws a RenderingCancelledException when we cancel on
        // purpose above — this is expected and not a real error.
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
            background: "#fafafa",
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
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          display: isLoading ? "none" : "block",
        }}
      />
    </div>
  );
}
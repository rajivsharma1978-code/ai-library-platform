"use client";

import { useCallback, useRef, useState } from "react";

export interface ImageSelectionResult {
  dataUrl: string;
  pageNumber: number;
  /** Selection rect in THIS layer's own local CSS pixels — useful for positioning a popup near the selection. */
  rect: { left: number; top: number; width: number; height: number };
}

interface ImageSelectionLayerProps {
  pageNumber: number;
  width: number | string;
  height: number | string;
  left?: number | string;
  onImageSelected: (result: ImageSelectionResult) => void;
}

const MIN_SELECTION_PX = 12;

/**
 * Rectangle drag-to-select overlay for capturing an image/diagram
 * region from a rendered PDF page, rather than selecting text.
 *
 * Locates the actual <canvas data-pdf-canvas={pageNumber}> rendered
 * by PdfPageCanvas via a DOM query scoped to this page's own
 * [data-page-number] leaf wrapper (the same attribute FlipEngine
 * already adds to every leaf — added during an earlier debugging
 * pass and left in place). This is the SAME architectural pattern
 * BookSpread already uses for its text-selection overlays: rendered
 * as a sibling of FlipEngine, finding the real canvas at the moment
 * of use rather than needing FlipEngine to know anything about
 * image selection. FlipEngine's page-sequencing logic is completely
 * untouched by this component.
 *
 * On pointer up, crops the EXACT dragged rectangle out of the live
 * canvas (mapping CSS-pixel drag coordinates to the canvas's actual
 * internal pixel buffer, which can differ due to devicePixelRatio
 * scaling in PdfPageCanvas) into a new offscreen canvas, and reports
 * it as a PNG data URL via onImageSelected.
 */
export default function ImageSelectionLayer({
  pageNumber,
  width,
  height,
  left = 0,
  onImageSelected,
}: ImageSelectionLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null
  );

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const layer = layerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    dragStartRef.current = { x, y };
    setDragRect({ x, y, w: 0, h: 0 });
    layer.setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    const layer = layerRef.current;
    if (!start || !layer) return;
    const rect = layer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragRect({
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      w: Math.abs(x - start.x),
      h: Math.abs(y - start.y),
    });
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const layer = layerRef.current;
      const start = dragStartRef.current;
      dragStartRef.current = null;
      layer?.releasePointerCapture?.(e.pointerId);

      if (!layer || !start || !dragRect) {
        setDragRect(null);
        return;
      }

      const { x, y, w, h } = dragRect;
      setDragRect(null);

      if (w < MIN_SELECTION_PX || h < MIN_SELECTION_PX) return;

      // Find the real <canvas> for this page, scoped to its own leaf
      // wrapper so this never accidentally grabs a different page's
      // canvas in a two-page spread.
      const pageLeaf = document.querySelector(`[data-page-number="${pageNumber}"]`);
      const canvas = pageLeaf?.querySelector(
        `canvas[data-pdf-canvas="${pageNumber}"]`
      ) as HTMLCanvasElement | null;
      if (!canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();

      // Selection coords are relative to THIS layer; convert to
      // coordinates relative to the canvas's own displayed (CSS) box,
      // since the canvas may be smaller than/offset within the layer
      // (it's centered by PdfPageCanvas's own wrapper).
      const selLeftInCanvasCss = layerRect.left + x - canvasRect.left;
      const selTopInCanvasCss = layerRect.top + y - canvasRect.top;

      // Map CSS pixels -> the canvas's actual internal pixel buffer
      // (PdfPageCanvas renders at up to 2x devicePixelRatio, so
      // canvas.width/height are usually larger than its CSS size).
      const scaleX = canvas.width / canvasRect.width;
      const scaleY = canvas.height / canvasRect.height;

      let sx = Math.round(selLeftInCanvasCss * scaleX);
      let sy = Math.round(selTopInCanvasCss * scaleY);
      let sw = Math.round(w * scaleX);
      let sh = Math.round(h * scaleY);

      // Clamp to the canvas's actual bounds — a drag can start/end
      // slightly outside the canvas itself (within the centering
      // wrapper), which would otherwise crop nothing or throw.
      sx = Math.max(0, Math.min(sx, canvas.width - 1));
      sy = Math.max(0, Math.min(sy, canvas.height - 1));
      sw = Math.max(1, Math.min(sw, canvas.width - sx));
      sh = Math.max(1, Math.min(sh, canvas.height - sy));

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) return;

      cropCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

      let dataUrl: string;
      try {
        dataUrl = cropCanvas.toDataURL("image/png");
      } catch (err) {
        console.error("[ImageSelectionLayer] Failed to capture image region:", err);
        return;
      }

      onImageSelected({
        dataUrl,
        pageNumber,
        rect: { left: x, top: y, width: w, height: h },
      });
    },
    [dragRect, pageNumber, onImageSelected]
  );

  return (
    <div
      ref={layerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "absolute",
        top: 0,
        left,
        width,
        height,
        cursor: "crosshair",
        pointerEvents: "auto",
        zIndex: 20,
      }}
    >
      {dragRect && (
        <div
          style={{
            position: "absolute",
            left: dragRect.x,
            top: dragRect.y,
            width: dragRect.w,
            height: dragRect.h,
            border: "2px dashed #9a6b2f",
            background: "rgba(180, 140, 60, 0.15)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

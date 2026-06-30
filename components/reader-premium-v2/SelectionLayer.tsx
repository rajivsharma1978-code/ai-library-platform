"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";

export interface SelectionLayerResult {
  text: string;
  rect: DOMRect;
  pageNumber: number;
}

interface SelectionLayerProps {
  pageNumber: number;
  text: string;
  width: number | string;
  height: number | string;
  /** Horizontal offset of this half within its positioned ancestor. Defaults to 0 (left edge). */
  left?: number | string;
  onSelection: (result: SelectionLayerResult | null) => void;
}

const NDL_SELECTION_CLASS = "premium-selection-layer";

/**
 * SELECTION OVERLAY — one instance per visible page-half.
 *
 * Now a forwardRef component: BookSpread renders TWO of these side by
 * side (one per visible page) and holds a direct ref to each one's
 * root DOM node, so it can synchronously disable/enable each half on
 * pointerdown (see BookSpread's overlay container handler) — this is
 * what stops a single drag from spanning both pages, without
 * reintroducing the earlier Map-based registration system.
 *
 * Text remains fully invisible (color + WebkitTextFillColor both
 * "transparent") while staying selectable.
 *
 * Highlight is drawn on an explicit <canvas> overlay using
 * range.getClientRects() filtered to individual text line rects —
 * NOT via the browser's native ::selection, which highlights the
 * entire text container bounding box (causing the giant blocky
 * rectangle that extends well outside actual selected text lines).
 * Each line rect is drawn with a 2px border-radius and light-blue
 * transparent fill. Rects smaller than the minimum thresholds (noise
 * from collapsed ranges, empty lines) and rects outside the layer
 * bounds are filtered/clamped before drawing.
 */
const SelectionLayer = forwardRef<HTMLDivElement, SelectionLayerProps>(function SelectionLayer(
  { pageNumber, text, width, height, left = 0, onSelection },
  forwardedRef
) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [highlightRects, setHighlightRects] = useState<DOMRect[]>([]);

  // Keep our own internal ref (needed for selection-range containment
  // checks below) in sync with whatever ref BookSpread passed in.
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      layerRef.current = el;
      if (typeof forwardedRef === "function") {
        forwardedRef(el);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }
    },
    [forwardedRef]
  );

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    const layer = layerRef.current;
    if (!layer) return;

    // Truly empty/collapsed selection — safe for either layer's
    // handler to report this; both will agree, no race.
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setHighlightRects([]);
      onSelection(null);
      return;
    }

    const anchorNode = selection.anchorNode;

    // If the selection isn't anchored inside THIS layer, do NOTHING —
    // do not call onSelection(null) here. `selectionchange` is a
    // single document-level event, so BOTH the left and right
    // SelectionLayer instances' handlers fire for every selection,
    // regardless of which page it was actually made in.
    if (!anchorNode || !layer.contains(anchorNode)) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length === 0) {
      setHighlightRects([]);
      onSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);

    // Use getClientRects() for per-line highlight rectangles instead
    // of getBoundingClientRect() (which merges everything into one
    // giant block). Filter noise and clamp to layer bounds.
    const layerRect = layer.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects());
    const filtered = clientRects
      .filter((r) => r.width >= 4 && r.height >= 3)
      .map((r) => {
        // Convert from viewport coords to layer-local coords
        return new DOMRect(
          r.left - layerRect.left,
          r.top - layerRect.top,
          r.width,
          r.height
        );
      })
      .filter((r) => {
        // Clamp: discard rects entirely outside the layer
        return (
          r.right > 0 &&
          r.bottom > 0 &&
          r.left < layerRect.width &&
          r.top < layerRect.height
        );
      });

    setHighlightRects(filtered);

    // Report the overall bounding rect (for popup positioning) using
    // the original viewport-coord bounding rect, not the local coords
    const boundingRect = range.getBoundingClientRect();
    const fallbackRect =
      boundingRect.width === 0 && boundingRect.height === 0
        ? layerRect
        : boundingRect;

    onSelection({ text: selectedText, rect: fallbackRect, pageNumber });
  }, [onSelection, pageNumber]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // Draw highlight rects on canvas whenever they change
  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    if (!canvas || !layer) return;

    const w = layer.offsetWidth;
    const h = layer.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (highlightRects.length === 0) return;

    ctx.scale(dpr, dpr);
    ctx.fillStyle = "rgba(96, 165, 250, 0.28)";

    for (const r of highlightRects) {
      // Clamp each rect to the canvas bounds to prevent overflow drawing
      const x = Math.max(0, r.left);
      const y = Math.max(0, r.top);
      const right = Math.min(w, r.right);
      const bottom = Math.min(h, r.bottom);
      const rw = right - x;
      const rh = bottom - y;
      if (rw <= 0 || rh <= 0) continue;

      // Rounded rect with 2px border-radius
      const radius = Math.min(2, rw / 2, rh / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + rw - radius, y);
      ctx.quadraticCurveTo(x + rw, y, x + rw, y + radius);
      ctx.lineTo(x + rw, y + rh - radius);
      ctx.quadraticCurveTo(x + rw, y + rh, x + rw - radius, y + rh);
      ctx.lineTo(x + radius, y + rh);
      ctx.quadraticCurveTo(x, y + rh, x, y + rh - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
    }
  }, [highlightRects]);

  return (
    <>
      {/* No ::selection CSS at all — highlight is drawn on the canvas
          overlay below using per-line getClientRects() instead. The
          browser's native ::selection on a transparent-text div
          highlights the entire container bounding box rather than
          per-line rects, which produced the giant blocky rectangles. */}
      <div
        ref={setRefs}
        data-page-number={pageNumber}
        className={NDL_SELECTION_CLASS}
        style={{
          position: "absolute",
          top: 0,
          left,
          width,
          height,
          color: "transparent",
          WebkitTextFillColor: "transparent",
          // Suppress native ::selection entirely on this element since
          // we draw our own per-line highlights via the canvas below
          userSelect: "text",
          WebkitUserSelect: "text",
          cursor: "text",
          fontSize: 13,
          lineHeight: 1.35,
          overflow: "hidden",
          padding: 16,
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          boxSizing: "border-box",
          pointerEvents: "auto",
          zIndex: 20,
          background: "transparent",
        }}
      >
        {text}
      </div>
      {/* Canvas draws per-line highlight rectangles from getClientRects().
          pointer-events:none so it never intercepts clicks/drags. */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left,
          width,
          height,
          pointerEvents: "none",
          zIndex: 21,
        }}
      />
    </>
  );
});

export default SelectionLayer;

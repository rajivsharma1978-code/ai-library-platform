"use client";

import { forwardRef, useCallback, useEffect, useRef } from "react";

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
 * "transparent") while staying selectable. A subtle, precise gold
 * ::selection highlight is scoped via the premium-selection-layer
 * class.
 *
 * Renders immediately regardless of whether `text` has resolved yet —
 * an empty string just means an empty (but still correctly sized and
 * positioned) selectable layer until OCR/text resolution fills it in.
 *
 * Does NOT call preventDefault() or removeAllRanges() anywhere.
 */
const SelectionLayer = forwardRef<HTMLDivElement, SelectionLayerProps>(function SelectionLayer(
  { pageNumber, text, width, height, left = 0, onSelection },
  forwardedRef
) {
  const layerRef = useRef<HTMLDivElement | null>(null);

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

    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      onSelection(null);
      return;
    }

    const anchorNode = selection.anchorNode;
    if (!anchorNode || !layer.contains(anchorNode)) {
      onSelection(null);
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length === 0) {
      onSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const fallbackRect =
      rect.width === 0 && rect.height === 0 ? layer.getBoundingClientRect() : rect;

    onSelection({ text: selectedText, rect: fallbackRect, pageNumber });
  }, [onSelection, pageNumber]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  return (
    <>
      <style>{`
        .${NDL_SELECTION_CLASS}::selection {
          background: rgba(176, 124, 45, 0.22);
        }
      `}</style>
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
          zIndex: 9999,
          background: "transparent",
        }}
      >
        {text}
      </div>
    </>
  );
});

export default SelectionLayer;

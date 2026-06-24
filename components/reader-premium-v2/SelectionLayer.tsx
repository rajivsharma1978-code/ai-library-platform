"use client";

import { useCallback, useEffect, useRef, type PointerEvent, type MouseEvent } from "react";

export interface SelectionLayerResult {
  text: string;
  rect: DOMRect;
  pageNumber: number;
}

interface SelectionLayerProps {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
  onSelection: (result: SelectionLayerResult | null) => void;
  /** Fired the instant a pointerdown happens inside this layer. */
  onActivate: (pageNumber: number) => void;
  /** True only for the page the CURRENT gesture started in. */
  isActivePage: boolean;
}

/**
 * One per-page selectable text overlay, rendered by FlipEngine itself
 * (via its renderSelectionLayer prop) directly inside that page's own
 * leaf container — sized to the EXACT same leafBox FlipEngine uses for
 * <PdfPageCanvas>.
 *
 * This layer NEVER performs any Range mutation: no setStart, setEnd,
 * cloneRange, or any other rewriting of the browser's native
 * selection. It allows completely native browser text selection and
 * only determines two things: (a) which page a selection gesture
 * started in, via onActivate() on pointerdown, and (b) whether a
 * given selectionchange event's anchor node belongs to THIS page's
 * DOM subtree before reporting it upward.
 *
 * Page isolation relies on exactly one mechanism, which is both
 * correct and sufficient: the ACTIVE-PAGE GATE. On pointerdown, this
 * layer calls onActivate() and the parent (BookSpread) locks onto
 * this page for the duration of the gesture. Every selectionchange
 * event checks isActivePageRef FIRST — only the currently-active
 * page's layer ever reports a selection at all. Native browser text
 * selection itself is left completely untouched (no preventDefault,
 * no Range manipulation) so selecting text works exactly as it would
 * with no overlay logic at all.
 */
export default function SelectionLayer({
  pageNumber,
  text,
  width,
  height,
  onSelection,
  onActivate,
  isActivePage,
}: SelectionLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const isActivePageRef = useRef(isActivePage);

  useEffect(() => {
    isActivePageRef.current = isActivePage;
  }, [isActivePage]);

  // stopPropagation ONLY — this prevents the pointerdown from
  // reaching FlipEngine's own click/drag flip listeners (which are
  // attached higher up in the DOM by react-pageflip), so a text
  // selection drag is never misread as a page-turn gesture. We
  // deliberately do NOT call preventDefault() anywhere: doing so
  // would block the browser's native text-selection behavior itself,
  // which is exactly what broke selection in the previous version's
  // related (but separate) over-clamping bug. Native selection must
  // remain completely free to operate.
  const handlePointerDown = useCallback(
    (e: PointerEvent | MouseEvent) => {
      e.stopPropagation();
      onActivate(pageNumber);
    },
    [pageNumber, onActivate]
  );

  const handleSelectionChange = useCallback(() => {
    // Hard gate: only the page the CURRENT gesture started in is ever
    // allowed to report a selection. Every other page's layer stays
    // completely silent, regardless of what the native browser
    // selection happens to contain.
    if (!isActivePageRef.current) return;

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

    const text = selection.toString().trim();
    if (text.length === 0) {
      onSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const fallbackRect =
      rect.width === 0 && rect.height === 0 ? layer.getBoundingClientRect() : rect;

    onSelection({ text, rect: fallbackRect, pageNumber });
  }, [onSelection, pageNumber]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  return (
    <div
      ref={layerRef}
      data-page-number={pageNumber}
      onPointerDown={handlePointerDown}
      onMouseDown={handlePointerDown}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        color: "transparent",
        userSelect: "text",
        WebkitUserSelect: "text",
        cursor: "text",
        fontSize: 11,
        lineHeight: 1.5,
        overflow: "hidden",
        padding: 12,
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        boxSizing: "border-box",
        pointerEvents: "auto",
        zIndex: 5,
      }}
    >
      {text}
    </div>
  );
}

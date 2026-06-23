"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import FlipEngine, { type FlipEngineHandle } from "./FlipEngine";
import { observeSize } from "@/lib/premium-reader/viewport";
import type { RealPageDims } from "@/lib/premium-reader/pdfLayoutAnalyzer";
import type { BookProfile } from "@/lib/premium-reader/bookProfile";

interface ResolvedPageEntry {
  pageNumber: number;
  text: string;
}

export type SelectionMode = "page-turn" | "text-selection";

interface BookSpreadProps {
  pdf: PDFDocumentProxy | null;
  profile: BookProfile;
  pageDims: Map<number, RealPageDims>;
  zoom: number;
  onPageChange: (info: { pageNumbers: number[]; label: string }) => void;
  /**
   * Plain-text content of the currently visible page(s). Each entry
   * gets its OWN separate overlay div (requirement #4) — never
   * combined into one block — so a drag selection can never span two
   * pages of a spread.
   */
  resolvedPages?: ResolvedPageEntry[];
  /**
   * Fired whenever the user's selection inside ONE page's overlay
   * changes to a non-empty string. pageNumber identifies exactly
   * which page the selection came from (requirement #5/#6).
   */
  onSelectionChange?: (
    info: { text: string; rect: DOMRect; pageNumber: number } | null
  ) => void;
  /**
   * "page-turn" (default): overlay never captures pointer events —
   * flip/click/drag behaves exactly as without any overlay at all.
   * "text-selection": overlay captures pointer events for text
   * selection only, within each page's own bounds.
   */
  selectionMode: SelectionMode;
}

export type BookSpreadHandle = FlipEngineHandle;

const FRAME_PADDING = 32;

const BookSpread = forwardRef<BookSpreadHandle, BookSpreadProps>(
  function BookSpread(
    {
      pdf,
      profile,
      pageDims,
      zoom,
      onPageChange,
      resolvedPages,
      onSelectionChange,
      selectionMode,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    // One ref PER overlay div, keyed by page number, so selection
    // handling can determine exactly which page's overlay a selection
    // originated in.
    const overlayRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const [availSize, setAvailSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      setAvailSize({ width: el.clientWidth, height: el.clientHeight });
      return observeSize(el, setAvailSize);
    }, []);

    const innerW = Math.max(availSize.width - FRAME_PADDING * 2, 0);
    const innerH = Math.max(availSize.height - FRAME_PADDING * 2, 0);

    // ── Page-scoped selection tracking ───────────────────────────────
    // Determines which overlay (i.e. which page) the CURRENT browser
    // selection's anchor node falls inside, and reports only that
    // page's text + pageNumber. Because each page has its own
    // separately-positioned, non-overlapping overlay div, a native
    // drag selection can never have an anchor that "belongs" to two
    // pages at once — this is what makes selection page-scoped rather
    // than spread-scoped.
    const handleSelectionChange = useCallback(() => {
      if (!onSelectionChange) return;
      if (selectionMode !== "text-selection") return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        onSelectionChange(null);
        return;
      }

      const text = selection.toString().trim();
      if (text.length === 0) {
        onSelectionChange(null);
        return;
      }

      const anchorNode = selection.anchorNode;
      if (!anchorNode) return;

      let matchedPageNumber: number | null = null;
      for (const [pageNumber, el] of overlayRefs.current.entries()) {
        if (el.contains(anchorNode)) {
          matchedPageNumber = pageNumber;
          break;
        }
      }

      // Selection didn't originate in any of our overlays (e.g. it's
      // inside the AI Companion panel) — ignore it entirely.
      if (matchedPageNumber === null) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      onSelectionChange({ text, rect, pageNumber: matchedPageNumber });
    }, [onSelectionChange, selectionMode]);

    useEffect(() => {
      if (!onSelectionChange) return;
      document.addEventListener("selectionchange", handleSelectionChange);
      return () => {
        document.removeEventListener("selectionchange", handleSelectionChange);
      };
    }, [handleSelectionChange, onSelectionChange]);

    // Leaving text-selection mode (back to page-turn) must clear any
    // in-progress browser selection immediately, so stale highlighted
    // text doesn't visually linger (even though it's invisible, the
    // native selection state itself should not persist).
    useEffect(() => {
      if (selectionMode === "page-turn") {
        window.getSelection()?.removeAllRanges();
        onSelectionChange?.(null);
      }
    }, [selectionMode, onSelectionChange]);

    const pages = resolvedPages ?? [];
    const isSpread = pages.length === 2;

    return (
      <div
        ref={containerRef}
        className="ndl-book-stage"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: "center center",
            transition: "transform 160ms ease",
            position: "relative",
          }}
        >
          <FlipEngine
            ref={ref}
            pdf={pdf}
            profile={profile}
            pageDims={pageDims}
            stageWidth={innerW}
            stageHeight={innerH}
            onPageChange={onPageChange}
          />

          {/* ── Per-page invisible selectable text overlays ───────────
              Requirement #1/#2: in "page-turn" mode, pointerEvents is
              "none" on every overlay — they are completely inert and
              cannot interfere with FlipEngine's own click/drag flip
              handling in any way, since the browser routes all pointer
              events straight through to whatever is beneath them.

              Requirement #4: each page gets its OWN separate div,
              positioned over exactly its half of the spread (or the
              full width in single-page mode) — never one combined
              block — so a drag gesture starting in the left half
              physically cannot extend its DOM selection into the
              right half's separate element. */}
          {pages.length > 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                pointerEvents: selectionMode === "text-selection" ? "auto" : "none",
                zIndex: selectionMode === "text-selection" ? 5 : -1,
              }}
            >
              {pages.map((page) => (
                <div
                  key={page.pageNumber}
                  ref={(el) => {
                    if (el) overlayRefs.current.set(page.pageNumber, el);
                    else overlayRefs.current.delete(page.pageNumber);
                  }}
                  data-page-number={page.pageNumber}
                  style={{
                    flex: isSpread ? "0 0 50%" : "1 1 100%",
                    width: isSpread ? "50%" : "100%",
                    height: "100%",
                    color: "transparent",
                    userSelect:
                      selectionMode === "text-selection" ? "text" : "none",
                    WebkitUserSelect:
                      selectionMode === "text-selection" ? "text" : "none",
                    cursor: selectionMode === "text-selection" ? "text" : "default",
                    fontSize: 11,
                    lineHeight: 1.5,
                    overflow: "hidden",
                    padding: 12,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "break-word",
                    boxSizing: "border-box",
                  }}
                >
                  {page.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default BookSpread;

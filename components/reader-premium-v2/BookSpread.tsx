"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import FlipEngine, { type FlipEngineHandle } from "./FlipEngine";
import SelectionLayer, { type SelectionLayerResult } from "./SelectionLayer";
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
  resolvedPages?: ResolvedPageEntry[];
  onSelectionChange?: (info: SelectionLayerResult | null) => void;
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
    const [availSize, setAvailSize] = useState({ width: 0, height: 0 });

    // Lock to exactly the page the CURRENT gesture started in. A ref
    // (not state) so it updates synchronously, with zero re-render
    // delay, before any selectionchange handler runs.
    const activeSelectionPageRef = useRef<number | null>(null);
    const [activeSelectionPage, setActiveSelectionPage] = useState<number | null>(null);
    // Tracks whether the active page has a genuine, non-empty
    // REPORTED selection — distinct from merely having been
    // "activated" by a pointerdown with no resulting selection.
    const hasReportedSelectionRef = useRef(false);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      setAvailSize({ width: el.clientWidth, height: el.clientHeight });
      return observeSize(el, setAvailSize);
    }, []);

    const innerW = Math.max(availSize.width - FRAME_PADDING * 2, 0);
    const innerH = Math.max(availSize.height - FRAME_PADDING * 2, 0);

    const handleActivate = useCallback((pageNumber: number) => {
      // Only clear native selection when starting a NEW gesture on a
      // DIFFERENT page AFTER an existing (genuinely reported)
      // selection already exists on the previous page. A plain
      // pointerdown/click that never produced a selection must never
      // trigger a clear on its own.
      const previous = activeSelectionPageRef.current;
      if (previous !== null && previous !== pageNumber && hasReportedSelectionRef.current) {
        window.getSelection()?.removeAllRanges();
        onSelectionChange?.(null);
        hasReportedSelectionRef.current = false;
      }
      activeSelectionPageRef.current = pageNumber;
      setActiveSelectionPage(pageNumber);
    }, [onSelectionChange]);

    const handleLayerSelection = useCallback(
      (result: SelectionLayerResult | null) => {
        if (!onSelectionChange) return;

        if (result === null) {
          hasReportedSelectionRef.current = false;
          onSelectionChange(null);
          return;
        }

        // Final guard: only ever forward a result for the CURRENTLY
        // locked active page, read synchronously from the ref.
        if (activeSelectionPageRef.current !== result.pageNumber) return;

        hasReportedSelectionRef.current = true;
        onSelectionChange(result);
      },
      [onSelectionChange]
    );

    useEffect(() => {
      if (selectionMode !== "text-selection") return;

      function handlePointerUp() {
        // Gesture ended — release the lock so the NEXT pointerdown
        // (on any page) can freely re-activate. We deliberately do
        // NOT clear the reported selection here: the user should
        // still see the floating menu after releasing the mouse.
        activeSelectionPageRef.current = null;
      }

      document.addEventListener("pointerup", handlePointerUp);
      document.addEventListener("mouseup", handlePointerUp);
      return () => {
        document.removeEventListener("pointerup", handlePointerUp);
        document.removeEventListener("mouseup", handlePointerUp);
      };
    }, [selectionMode]);

    useEffect(() => {
      if (selectionMode === "page-turn") {
        window.getSelection()?.removeAllRanges();
        activeSelectionPageRef.current = null;
        hasReportedSelectionRef.current = false;
        setActiveSelectionPage(null);
        onSelectionChange?.(null);
      }
    }, [selectionMode, onSelectionChange]);

    const pages = resolvedPages ?? [];
    const pageTextByNumber = new Map<number, string>(
      pages.map((p): [number, string] => [p.pageNumber, p.text])
    );

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
          // Allow the scaled content to overflow this box safely (so
          // zoom-in never gets hard-clipped at the container edge).
          overflow: "visible",
        }}
      >
        <div
          style={{
            display: "inline-flex",
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
            renderSelectionLayer={
              selectionMode === "text-selection"
                ? (pageNumber, leafBox) => {
                    const text = pageTextByNumber.get(pageNumber);
                    if (text === undefined) return null;

                    return (
                      <SelectionLayer
                        key={pageNumber}
                        pageNumber={pageNumber}
                        text={text}
                        width={leafBox.width}
                        height={leafBox.height}
                        onSelection={handleLayerSelection}
                        onActivate={handleActivate}
                        isActivePage={activeSelectionPage === pageNumber}
                      />
                    );
                  }
                : undefined
            }
          />
        </div>
      </div>
    );
  }
);

export default BookSpread;

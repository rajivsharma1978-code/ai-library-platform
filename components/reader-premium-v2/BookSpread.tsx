"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
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
  /** Page numbers currently visible — used to mount selection overlays
   *  IMMEDIATELY, independent of whether resolvedPages text has
   *  arrived yet (which depends on the OCR pipeline and was the
   *  source of the mode-switch delay). */
  currentPageNumbers: number[];
  resolvedPages?: ResolvedPageEntry[];
  onSelectionChange?: (info: SelectionLayerResult | null) => void;
  selectionMode: SelectionMode;
  /** Bumped by PremiumReaderV2 whenever fullscreen state changes. Used
   *  ONLY to force a fresh container re-measurement below — never as
   *  a React key, so it never remounts BookSpread/FlipEngine (which
   *  would reset the current page). */
  layoutVersion?: number;
}

export type BookSpreadHandle = FlipEngineHandle;

/**
 * Two independent half-page selection overlays, rendered as plain
 * siblings of <FlipEngine> (not through its renderSelectionLayer
 * slot — bypassing that slot is what made basic selection work in the
 * first place, per the confirmed-working build).
 *
 * CROSS-PAGE FIX: each half is mounted unconditionally selectable
 * (userSelect:"text" set directly inside SelectionLayer, always).
 * What stops a single drag from spanning both halves is a single
 * pointerdown-capture handler on the shared overlay container: on
 * every pointerdown, it looks at which half the gesture started in
 * (via clientX vs. the container's horizontal midpoint) and
 * synchronously sets the OTHER half's userSelect/pointerEvents to
 * "none"/"none" while leaving the active half as "text"/"auto" — all
 * direct DOM writes, no React state, no per-instance registration
 * map. This is deliberately much lighter than the earlier ref-map
 * system: just two refs and one event handler.
 *
 * DELAY FIX: overlays are mounted from `currentPageNumbers` directly,
 * not from whether `resolvedPages` already contains text for that
 * page. An empty string just renders an empty (but already selectable
 * and correctly positioned) layer; text fills in via a normal
 * re-render once OCR/text resolution completes — no blocking, no
 * loading gate.
 */
const BookSpread = forwardRef<BookSpreadHandle, BookSpreadProps>(
  function BookSpread(
    {
      pdf,
      profile,
      pageDims,
      zoom,
      onPageChange,
      currentPageNumbers,
      resolvedPages,
      onSelectionChange,
      selectionMode,
      layoutVersion,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [availSize, setAvailSize] = useState({ width: 0, height: 0 });

    // zoom is accepted for prop-interface compatibility with
    // PremiumReaderV2's existing zoom controls, but is intentionally
    // not applied here anymore (no CSS transform/scale) — per the
    // fit-contain-only sizing approach now used throughout.
    void zoom;

    const overlayContainerRef = useRef<HTMLDivElement | null>(null);
    const leftLayerRef = useRef<HTMLDivElement | null>(null);
    const rightLayerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      setAvailSize({ width: el.clientWidth, height: el.clientHeight });
      return observeSize(el, setAvailSize);
    }, []);

    // Forces a fresh re-measurement whenever fullscreen state changes
    // (layoutVersion bumps on every isFullscreen flip in
    // PremiumReaderV2). This is purely a re-measure, NEVER a remount —
    // containerRef/availSize/FlipEngine's own mounted instance are all
    // untouched; only the measured width/height get refreshed.
    //
    // Measures on a cascade (immediately, next animation frame, then
    // at 50ms/150ms/300ms) rather than a single fixed delay, plus
    // listens for the browser's own fullscreenchange and window resize
    // events directly — covers cases where the CSS grid's column/row
    // transition settles at a slightly different time than any single
    // fixed timeout would predict (varies by browser/OS fullscreen
    // transition timing). Uses getBoundingClientRect() rather than
    // clientWidth/clientHeight for the measurement itself, which is
    // what the diagnosis specifically called for.
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      function measure() {
        const node = containerRef.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        setAvailSize({ width: rect.width, height: rect.height });
      }

      measure();
      const rafId = requestAnimationFrame(measure);
      const timeoutIds = [50, 150, 300].map((delay) => window.setTimeout(measure, delay));

      document.addEventListener("fullscreenchange", measure);
      window.addEventListener("resize", measure);

      return () => {
        cancelAnimationFrame(rafId);
        timeoutIds.forEach((id) => window.clearTimeout(id));
        document.removeEventListener("fullscreenchange", measure);
        window.removeEventListener("resize", measure);
      };
    }, [layoutVersion]);

    // Passes the actual measured container size directly to
    // FlipEngine — no FRAME_PADDING subtraction, no fullscreen-
    // specific adjustment. FlipEngine's own SAFETY_MARGIN (see
    // FlipEngine.tsx) is now solely responsible for keeping the
    // rendered spread comfortably inside this size.
    const innerW = Math.max(Math.floor(availSize.width), 1);
    const innerH = Math.max(Math.floor(availSize.height), 1);

    useEffect(() => {
      if (selectionMode === "page-turn") {
        window.getSelection()?.removeAllRanges();
        onSelectionChange?.(null);
      }
    }, [selectionMode, onSelectionChange]);

    // Explicitly clears any in-progress browser selection whenever
    // selectionMode changes OR layoutVersion changes (i.e. on every
    // fullscreen transition). A stale Range anchored to a
    // SelectionLayer that has since been resized/repositioned (e.g.
    // by a fullscreen toggle) is exactly what produced the long,
    // misaligned horizontal highlight bars — clearing it here removes
    // that stale Range outright rather than relying on it to resolve
    // itself.
    useEffect(() => {
      document.getSelection()?.removeAllRanges();
    }, [selectionMode, layoutVersion]);

    // Reset both halves to fully selectable whenever we enter Text
    // Selection Mode, the visible page numbers change, OR a fullscreen
    // transition happens (layoutVersion) — guarantees the cursor is
    // immediately selectable on both sides with no stale "disabled"
    // state left over from a previous page/gesture/fullscreen toggle.
    useEffect(() => {
      if (selectionMode !== "text-selection") return;
      const left = leftLayerRef.current;
      const right = rightLayerRef.current;
      if (left) {
        left.style.userSelect = "text";
        (left.style as any).webkitUserSelect = "text";
        left.style.pointerEvents = "auto";
      }
      if (right) {
        right.style.userSelect = "text";
        (right.style as any).webkitUserSelect = "text";
        right.style.pointerEvents = "auto";
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectionMode, currentPageNumbers.join(","), layoutVersion]);

    useEffect(() => {
      if (selectionMode !== "text-selection") return;
      const container = overlayContainerRef.current;
      if (!container) return;

      function handlePointerDownCapture(e: PointerEvent) {
        const rect = container!.getBoundingClientRect();
        const isLeftSide = e.clientX < rect.left + rect.width / 2;

        const activeEl = isLeftSide ? leftLayerRef.current : rightLayerRef.current;
        const inactiveEl = isLeftSide ? rightLayerRef.current : leftLayerRef.current;

        // Disable the OTHER half first, synchronously, in the same
        // tick as the pointerdown — so a drag starting on this side
        // has nothing selectable to extend into once it crosses the
        // midpoint into the other half.
        if (inactiveEl) {
          inactiveEl.style.userSelect = "none";
          (inactiveEl.style as any).webkitUserSelect = "none";
          inactiveEl.style.pointerEvents = "none";
        }
        if (activeEl) {
          activeEl.style.userSelect = "text";
          (activeEl.style as any).webkitUserSelect = "text";
          activeEl.style.pointerEvents = "auto";
        }
      }

      container.addEventListener("pointerdown", handlePointerDownCapture, { capture: true });
      return () => {
        container.removeEventListener("pointerdown", handlePointerDownCapture, { capture: true });
      };
    }, [selectionMode]);

    const pages = resolvedPages ?? [];
    const pageTextByNumber = new Map<number, string>(
      pages.map((p): [number, string] => [p.pageNumber, p.text])
    );

    // currentPageNumbers (not resolvedPages) stays the source of truth
    // for WHICH pages mount immediately, regardless of whether their
    // text has resolved yet — this is what keeps Text Selection Mode
    // delay-free (see the class-level doc comment above).
    //
    // FALLBACK: some spreads (e.g. the cover) are visually a two-page-
    // looking illustration but are actually a SINGLE underlying PDF
    // page — currentPageNumbers has only one entry for those. Without
    // this fallback, the right overlay simply never mounted at all in
    // that case (rightPageNumber was undefined), which is exactly why
    // the right half never showed a text cursor. Now, when there's
    // only one visible page, the right overlay still mounts, using
    // that SAME page's number/text — so both halves stay selectable,
    // attributing a right-half selection to the one actual page when
    // there genuinely isn't a second one.
    const leftPageNumber = currentPageNumbers[0];
    const rightPageNumber =
      currentPageNumbers.length > 1 ? currentPageNumbers[1] : leftPageNumber;

    const leftText =
      leftPageNumber !== undefined ? pageTextByNumber.get(leftPageNumber) ?? "" : "";
    const rightText =
      rightPageNumber !== undefined ? pageTextByNumber.get(rightPageNumber) ?? "" : "";

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
            width: innerW,
            height: innerH,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/*
            BOOK-SIZED WRAPPER — preserves the SelectionLayer overlay-
            alignment fix (untouched per "do not touch selection
            popup"): this wrapper uses width/height:"fit-content", so
            it sizes itself to EXACTLY match FlipEngine's actual
            rendered box (FlipEngine is its only sized child) — never
            bigger than innerW/innerH, since FlipEngine's own leafBox
            calculation is bounded by its own SAFETY_MARGIN to fit
            within stageWidth/stageHeight. The overlay below is
            100%/100% of THIS wrapper, so it stays clipped to the real
            book area only, not the larger outer stage.
          */}
          <div style={{ width: "fit-content", height: "fit-content", position: "relative", zIndex: 10 }}>
            <div
              style={{
                // FlipEngine must not receive pointer events at all while
                // in Text Selection Mode, so a page-flip drag can never
                // start while the user is trying to select text. The
                // overlay container below is a SIBLING of this div, so
                // it is unaffected.
                pointerEvents: selectionMode === "text-selection" ? "none" : "auto",
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
            </div>

            {selectionMode === "text-selection" && leftPageNumber !== undefined && (
              <div
                ref={overlayContainerRef}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 20,
                }}
              >
                <SelectionLayer
                  ref={leftLayerRef}
                  pageNumber={leftPageNumber}
                  text={leftText}
                  left={0}
                  width="50%"
                  height="100%"
                  onSelection={onSelectionChange ?? (() => {})}
                />
                {rightPageNumber !== undefined && (
                  <SelectionLayer
                    ref={rightLayerRef}
                    pageNumber={rightPageNumber}
                    text={rightText}
                    left="50%"
                    width="50%"
                    height="100%"
                    onSelection={onSelectionChange ?? (() => {})}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

export default BookSpread;

"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import FlipEngine, { type FlipEngineHandle } from "./FlipEngine";
import SelectionLayer, { type SelectionLayerResult } from "./SelectionLayer";
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
  pan?: { x: number; y: number };
  isResizingReader?: boolean;
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
  /**
   * Explicitly threaded through from PremiumReaderV2 so FlipEngine can
   * use a smaller SAFETY_MARGIN in immersive mode (more visual size,
   * still never cropped). This is a deliberate, explicit reversal of
   * the earlier "BookSpread/FlipEngine must not know fullscreen
   * exists" rule — requested directly for this specific purpose.
   */
  isImmersiveMode?: boolean;
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
      pan = { x: 0, y: 0 },
      isResizingReader,
      onPageChange,
      currentPageNumbers,
      resolvedPages,
      onSelectionChange,
      selectionMode,
      layoutVersion,
      isImmersiveMode,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [availSize, setAvailSize] = useState({ width: 0, height: 0 });

    // zoom is now forwarded directly to FlipEngine, which applies it
    // as a multiplier on top of its own fit-contain leafBox
    // calculation — no CSS transform/scale here in BookSpread itself,
    // consistent with the fit-contain-only sizing approach already
    // used throughout.

    const overlayContainerRef = useRef<HTMLDivElement | null>(null);
    const leftLayerRef = useRef<HTMLDivElement | null>(null);
    const rightLayerRef = useRef<HTMLDivElement | null>(null);

    // SINGLE consolidated measurement effect. One measure() function,
    // triggered by: layoutVersion changing (this effect's dependency)
    // and the container's own ResizeObserver firing — plus an
    // immediate + rAF + staggered timeout cascade every time the
    // effect re-runs, since a single measurement can land before a
    // CSS transition (grid columns changing, etc.) has actually
    // settled. This component has NO awareness of fullscreen as a
    // concept at all — no isFullscreen/isImmersiveMode props, no
    // fullscreenchange listener (the app no longer uses the browser
    // Fullscreen API at all, so that event would never fire anyway).
    // All fullscreen/immersive-mode decisions live in PremiumReaderV2
    // only; this component just re-measures whenever its own
    // container resizes or layoutVersion is bumped.
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const measure = () => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setAvailSize({ width: rect.width, height: rect.height });
      };

      measure();
      const rafId = requestAnimationFrame(measure);
      const timeoutId = window.setTimeout(measure, 150);

      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(el);

      // Also listen for synthetic window resize events dispatched by
      // PremiumReaderV2's fullscreenchange handler — these fire after
      // the browser layout has actually settled post-fullscreen, which
      // is sometimes later than the ResizeObserver or the
      // layoutVersion cascade alone.
      window.addEventListener("resize", measure);

      return () => {
        cancelAnimationFrame(rafId);
        window.clearTimeout(timeoutId);
        resizeObserver.disconnect();
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
          // BookSpread itself is always overflow:hidden — panning is
          // handled by translate() in the CSS transform of the
          // fit-content wrapper below, not by scrolling this container.
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
            // overflow always hidden — pan is handled via translate()
            // in the transform below, not by overflow scrolling.
            overflow: "hidden",
          }}
        >
          {/* fit-content wrapper: sizes itself to FlipEngine's exact
              rendered box so the selection overlay is always clipped
              to the real book area, never the larger outer stage.
              CSS transform here is INSTANT (no canvas re-render):
              zoom/100 scales the already-rendered pixels. Canvas
              resolution stays constant because leafBox/FlipEngine
              never changes on zoom — only this transform does. */}
          <div
            style={{
              width: "fit-content",
              height: "fit-content",
              position: "relative",
              zIndex: 10,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
              transformOrigin: "center center",
            }}
          >
            <div
              style={{
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
                isImmersiveMode={isImmersiveMode}
                isResizingReader={isResizingReader}
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

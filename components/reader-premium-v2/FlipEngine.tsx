"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import PdfPageCanvas from "./PdfPageCanvas";
import type { RealPageDims } from "@/lib/premium-reader/pdfLayoutAnalyzer";
import { resolveFrontMatterPages, resolvePageRole } from "@/lib/premium-reader/pdfLayoutAnalyzer";
import type { BookProfile, ReadingDirection } from "@/lib/premium-reader/bookProfile";
import { getPdfPageMode, getDisplayLabel } from "@/lib/premium-reader/bookProfile";

export interface FlipEngineHandle {
  flipNext: () => void;
  flipPrev: () => void;
  flipToPage: (pageIndex: number) => void;
}

export type FlipMode = "single" | "double";

interface FlipEngineProps {
  pdf: PDFDocumentProxy | null;
  profile: BookProfile;
  pageDims: Map<number, RealPageDims>;
  stageWidth: number;
  stageHeight: number;
  /** Now reports a display LABEL (e.g. "02–03", "Cover") alongside raw page numbers. */
  onPageChange: (info: { pageNumbers: number[]; label: string }) => void;
  /**
   * Optional render-prop injection point. If provided, FlipEngine
   * calls this for EVERY page leaf, immediately after rendering its
   * <PdfPageCanvas>, passing the EXACT same leafBox dimensions used
   * for that canvas. This lets a caller (BookSpread) render a
   * perfectly-aligned overlay INSIDE each page's own leaf container —
   * never an approximated split across the whole spread — without
   * FlipEngine itself knowing anything about selection, OCR, or AI
   * features. No flip/pairing/sequencing logic is affected by this
   * prop in any way; it is purely an additive rendering hook.
   */
  renderSelectionLayer?: (
    pageNumber: number,
    leafBox: { width: number; height: number }
  ) => ReactNode;
  /**
   * Explicit, deliberate exception to "FlipEngine must not know
   * fullscreen exists" — used ONLY to select a smaller SAFETY_MARGIN
   * in immersive mode (more visual size for the book, still never
   * cropped). Does not affect page-turn/pairing/sequencing logic in
   * any way; it only changes the numeric margin in the leafBox fit
   * calculation below.
   */
  isImmersiveMode?: boolean;
  /**
   * The DEBOUNCED/settled zoom percentage (100 = fit-contain) — NEVER
   * the instant click-by-click zoom value. PremiumReaderV2 only
   * updates this ~250ms after the user stops clicking +/-, which is
   * what makes this safe to use for actual sizing here: applied as a
   * multiplier on top of the existing fit-contain leafBox calculation
   * below, it triggers a real PdfPageCanvas re-render (for sharp text
   * at the new resolution) at most once per "settle", not once per
   * click. Instant visual feedback during the click itself comes from
   * a separate CSS transform in BookSpread, which this component has
   * no involvement in at all.
   */
  renderZoom?: number;
}

const FALLBACK_ASPECT = 0.72;

// Shared with the outer wrapper's width style below, so the spread
// width used for layout (leafBox.width * 2 + GUTTER) and the
// constraint leafBox is computed against always agree on the same gap.
const GUTTER = 6;

function detectOverallModeSinglePages(
  pageDims: Map<number, RealPageDims>,
  frontMatterPages: number
): FlipMode {
  const firstContent = pageDims.get(frontMatterPages + 1);
  if (!firstContent) return "double";
  return firstContent.orientation === "landscape" ? "single" : "double";
}

function resolveAspectSinglePages(
  pageDims: Map<number, RealPageDims>,
  frontMatterPages: number
): number {
  const firstContent = pageDims.get(frontMatterPages + 1);
  if (firstContent) return firstContent.width / firstContent.height;

  const anyFrontMatter = Array.from(pageDims.values())[0];
  if (anyFrontMatter) return anyFrontMatter.width / anyFrontMatter.height;

  return FALLBACK_ASPECT;
}

/**
 * In "prebuilt-spreads" mode, the leaf box must fit the WIDEST real
 * page in the book (since each PDF page is already a full spread and
 * may vary slightly in aspect ratio between pages). We use the first
 * known page as the reference, falling back to a wide-spread default
 * aspect ratio if nothing has loaded yet.
 */
function resolveAspectPrebuiltSpreads(pageDims: Map<number, RealPageDims>): number {
  const first = pageDims.get(1);
  if (first) return first.width / first.height;

  const any = Array.from(pageDims.values())[0];
  if (any) return any.width / any.height;

  // Wide-spread fallback (roughly two portrait pages side by side).
  return 1.4;
}

const FlipEngine = forwardRef<FlipEngineHandle, FlipEngineProps>(
  function FlipEngine(
    { pdf, profile, pageDims, stageWidth, stageHeight, onPageChange, renderSelectionLayer, isImmersiveMode, renderZoom = 100 },
    ref
  ) {
    const flipBookRef = useRef<any>(null);
    const flipStageRef = useRef<HTMLDivElement | null>(null);
    const [bookOpened, setBookOpened] = useState(false);
    const [HTMLFlipBook, setHTMLFlipBook] = useState<any>(null);
    // Tracks the actually-displayed leaf's page number, updated from
    // handleFlip on every page turn. This is what lets `aspect` below
    // be recomputed PER CURRENTLY-VISIBLE PAGE instead of being fixed
    // once from a single reference page (page 1) for the entire book —
    // that fixed-aspect approach was the actual root cause of the
    // right-side crop: if a given page's real aspect ratio differs
    // from whatever page the global aspect was derived from (or if
    // page 1's dims simply hadn't loaded yet when that one-time
    // calculation ran), the leafBox would be sized to the WRONG
    // aspect, and the actual rendered page image — wider than that
    // box — would get clipped.
    const [currentPageNumber, setCurrentPageNumber] = useState(1);

    // ── Custom prebuilt-spreads flip state ──────────────────────────
    // react-pageflip is NOT used for prebuilt-spreads books anymore
    // (see the branched return below) — this is the state machine for
    // a hand-rolled CSS rotateY page-turn instead. `transitioningTo`
    // is the page being turned TO; while non-null, the current page
    // is animating away and the incoming page is revealed underneath.
    // `currentPageNumber` above doubles as the "currently fully shown"
    // page for this mode too — no separate state needed for that.
    const [transitioningTo, setTransitioningTo] = useState<number | null>(null);
    const [transitionDirection, setTransitionDirection] = useState<"next" | "prev" | null>(null);
    const spreadAnimTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
      return () => {
        if (spreadAnimTimeoutRef.current) {
          window.clearTimeout(spreadAnimTimeoutRef.current);
        }
      };
    }, []);

    useEffect(() => {
      let cancelled = false;
      import("react-pageflip").then((mod) => {
        if (!cancelled) setHTMLFlipBook(mod.default);
      });
      return () => {
        cancelled = true;
      };
    }, []);

    const pdfPageMode = useMemo(() => getPdfPageMode(profile), [profile]);
    const isPrebuiltSpreads = pdfPageMode === "prebuilt-spreads";

    const frontMatterPages = useMemo(
      () =>
        isPrebuiltSpreads
          ? 0
          : resolveFrontMatterPages(profile, pageDims),
      [profile, pageDims, isPrebuiltSpreads]
    );

    // In prebuilt-spreads mode the book is ALWAYS single-leaf-at-a-time
    // (usePortrait must be true, per requirement) — there is no
    // pairing concept since each PDF page already IS the full spread.
    const mode: FlipMode = useMemo(() => {
      if (isPrebuiltSpreads) return "single";
      return detectOverallModeSinglePages(pageDims, frontMatterPages);
    }, [isPrebuiltSpreads, pageDims, frontMatterPages]);

    // Single mode: use the ACTUAL aspect ratio of the page currently
    // being displayed, read directly from pageDims — never a fixed/
    // global aspect computed once from a different reference page.
    // Falls back to the previous page-1-or-any-loaded-page logic only
    // when this specific page's dims haven't loaded yet (first paint
    // before getRealPageDims resolves for it).
    // Double mode: unchanged — paired leaves share the existing
    // first-content-page-derived aspect, since pairs are expected to
    // be the same physical page format throughout a single-pages book.
    const aspect = useMemo(() => {
      if (mode === "single") {
        const currentDims = pageDims.get(currentPageNumber);
        if (currentDims) return currentDims.width / currentDims.height;
        return isPrebuiltSpreads
          ? resolveAspectPrebuiltSpreads(pageDims)
          : resolveAspectSinglePages(pageDims, frontMatterPages);
      }
      return resolveAspectSinglePages(pageDims, frontMatterPages);
    }, [mode, pageDims, currentPageNumber, isPrebuiltSpreads, frontMatterPages]);

    // Fit-contain sizing: the rendered leaf (or leaf pair, in double/
    // spread mode) must NEVER exceed the available stage. The original
    // math here was already correct in isolation (Math.floor only
    // rounds down, so doubling a floored value can't exceed 2× the
    // usable width) — this version makes the constraint explicit via
    // named constants, adds a small defensive safety margin, and
    // clamps the final result once more. The margin/clamp exist purely
    // as a guard against any subpixel/border/shadow overhead
    // react-pageflip itself may add internally (not visible from this
    // file), which could otherwise eat into the last pixel or two now
    // that ancestor containers use overflow:"hidden" instead of
    // "visible".
    //
    // SAFETY_MARGIN is a real, visible margin (48px on each side,
    // 96px total per axis) — this guarantees the rendered spread is
    // comfortably smaller than the stage, which is what actually
    // prevents toolbar/nav clipping and page-edge crop. At 100% zoom,
    // "Fit" always means contain, never crop, even if the book ends
    // up noticeably smaller than the available space.
    const leafBox = useMemo(() => {
      if (stageWidth <= 0 || stageHeight <= 0) {
        return { width: 0, height: 0 };
      }

      // Smaller safety margin in immersive mode — more visual size for
      // the book, since the safety net only needs to guard against
      // react-pageflip's own internal overhead, not also reserve room
      // for a left info panel that's already removed from the grid
      // entirely in this mode.
      const SAFETY_MARGIN = isImmersiveMode ? 8 : 48;

      const maxSpreadWidth = Math.max(stageWidth - SAFETY_MARGIN * 2, 1);
      const maxSpreadHeight = Math.max(stageHeight - SAFETY_MARGIN * 2, 1);

      // mode is always "single" in prebuilt-spreads mode, so the leaf
      // always gets the FULL stage width — never halved for pairing.
      const usableWidth =
        mode === "double" ? (maxSpreadWidth - GUTTER) / 2 : maxSpreadWidth;
      const usableHeight = maxSpreadHeight;

      const widthFromHeight = usableHeight * aspect;

      let leafWidth: number;
      let leafHeight: number;

      if (widthFromHeight <= usableWidth) {
        leafHeight = usableHeight;
        leafWidth = widthFromHeight;
      } else {
        leafWidth = usableWidth;
        leafHeight = usableWidth / aspect;
      }

      leafWidth = Math.max(Math.floor(leafWidth), 1);
      leafHeight = Math.max(Math.floor(leafHeight), 1);

      // Final defensive clamp: re-check the actual constraint this
      // function exists to guarantee, and shrink (never grow) if it
      // somehow doesn't hold — e.g. the full spread width (leaf width
      // doubled, plus gutter) must never exceed maxSpreadWidth.
      const spreadWidth = mode === "double" ? leafWidth * 2 + GUTTER : leafWidth;
      if (spreadWidth > maxSpreadWidth) {
        const overshoot = spreadWidth - maxSpreadWidth;
        const perLeafReduction = mode === "double" ? Math.ceil(overshoot / 2) : overshoot;
        leafWidth = Math.max(leafWidth - perLeafReduction, 1);
        leafHeight = Math.max(Math.floor(leafWidth / aspect), 1);
      }
      if (leafHeight > maxSpreadHeight) {
        leafHeight = Math.max(Math.floor(maxSpreadHeight), 1);
        leafWidth = Math.max(Math.floor(leafHeight * aspect), 1);
      }

      // Apply the DEBOUNCED renderZoom on top of the base (100%)
      // fit-contain size computed above. At renderZoom===100 (the
      // default, and what Fit/fullscreen reset snap back to
      // immediately rather than waiting for the debounce) this is a
      // pure no-op — leafBox is then governed by fit-contain alone,
      // per "at 100/Fit, do not apply zoom scale; calculate using
      // fit-contain only". Because renderZoom only ever changes after
      // PremiumReaderV2's debounce settles, this useMemo — and the
      // PdfPageCanvas re-render its output feeds — only re-runs once
      // per zoom "settle", not once per click.
      const renderZoomFactor = renderZoom / 100;
      leafWidth = Math.max(Math.floor(leafWidth * renderZoomFactor), 1);
      leafHeight = Math.max(Math.floor(leafHeight * renderZoomFactor), 1);

      return { width: leafWidth, height: leafHeight };
    }, [aspect, mode, stageWidth, stageHeight, isImmersiveMode, renderZoom]);

    // Per-page fit-contain: leafBox above is the SHARED, CONSTANT
    // frame size react-pageflip's HTMLFlipBook/.stf__item is given —
    // it cannot resize per page mid-book, and keeping it constant is
    // what makes the flip animation operate on a consistent element
    // (see the .stf__item CSS fix above). But a page whose own real
    // aspect ratio differs from `aspect` (e.g. a Title/Credits page
    // mixed in among landscape spread pages) must still fit-contain
    // WITHOUT being cropped or stretched to fill that frame — this
    // computes a SMALLER, correctly-proportioned box for that
    // specific page's own dimensions, fit entirely inside leafBox,
    // to be centered within it. For a page whose aspect matches
    // `aspect` already, this returns the same size as leafBox.
    function getPageContainBox(pageNumber: number): { width: number; height: number } {
      if (leafBox.width <= 0 || leafBox.height <= 0) {
        return { width: 0, height: 0 };
      }

      const dims = pageDims.get(pageNumber);
      const pageAspect = dims ? dims.width / dims.height : aspect;

      const widthFromHeight = leafBox.height * pageAspect;

      let width: number;
      let height: number;
      if (widthFromHeight <= leafBox.width) {
        height = leafBox.height;
        width = widthFromHeight;
      } else {
        width = leafBox.width;
        height = leafBox.width / pageAspect;
      }

      return {
        width: Math.max(Math.floor(width), 1),
        height: Math.max(Math.floor(height), 1),
      };
    }

    // ── Custom prebuilt-spreads flip handlers ───────────────────────
    // Same EXTERNAL contract as the react-pageflip path below
    // (onPageChange shape, page numbers) — this is purely an
    // alternative INTERNAL mechanism for advancing the page, so
    // PremiumReaderV2's Previous/Next buttons, current page state,
    // and labels all keep working unchanged through the same
    // FlipEngineHandle/onPageChange contract.
    function customFlipNext() {
      if (transitioningTo !== null) return; // ignore while already animating
      const next = Math.min(currentPageNumber + 1, profile.totalPages);
      if (next === currentPageNumber) return;

      setTransitionDirection("next");
      setTransitioningTo(next);

      if (spreadAnimTimeoutRef.current) window.clearTimeout(spreadAnimTimeoutRef.current);
      spreadAnimTimeoutRef.current = window.setTimeout(() => {
        setCurrentPageNumber(next);
        setTransitioningTo(null);
        setTransitionDirection(null);
        onPageChange({ pageNumbers: [next], label: getDisplayLabel(profile, next) });
      }, 500);
    }

    function customFlipPrev() {
      if (transitioningTo !== null) return;
      const prev = Math.max(currentPageNumber - 1, 1);
      if (prev === currentPageNumber) return;

      setTransitionDirection("prev");
      setTransitioningTo(prev);

      if (spreadAnimTimeoutRef.current) window.clearTimeout(spreadAnimTimeoutRef.current);
      spreadAnimTimeoutRef.current = window.setTimeout(() => {
        setCurrentPageNumber(prev);
        setTransitioningTo(null);
        setTransitionDirection(null);
        onPageChange({ pageNumbers: [prev], label: getDisplayLabel(profile, prev) });
      }, 500);
    }

    function customFlipToPage(pageIndex: number) {
      // Direct jump (no animation) — matches react-pageflip's own
      // .flip(pageIndex) behavior, which also jumps without a
      // dedicated turn animation when called programmatically far
      // from the current page.
      const target = Math.max(1, Math.min(pageIndex + 1, profile.totalPages));
      if (spreadAnimTimeoutRef.current) window.clearTimeout(spreadAnimTimeoutRef.current);
      setTransitioningTo(null);
      setTransitionDirection(null);
      setCurrentPageNumber(target);
      onPageChange({ pageNumbers: [target], label: getDisplayLabel(profile, target) });
    }

    useImperativeHandle(ref, () => ({
      flipNext: () => {
        if (isPrebuiltSpreads) {
          customFlipNext();
        } else {
          flipBookRef.current?.pageFlip?.()?.flipNext();
        }
      },
      flipPrev: () => {
        if (isPrebuiltSpreads) {
          customFlipPrev();
        } else {
          flipBookRef.current?.pageFlip?.()?.flipPrev();
        }
      },
      flipToPage: (pageIndex: number) => {
        if (isPrebuiltSpreads) {
          customFlipToPage(pageIndex);
        } else {
          flipBookRef.current?.pageFlip?.()?.flip(pageIndex);
        }
      },
    }));

    useEffect(() => {
      if (!pdf) return;
      const timeout = setTimeout(() => setBookOpened(true), 80);
      return () => clearTimeout(timeout);
    }, [pdf]);

    useEffect(() => {
      if (!pdf || !HTMLFlipBook || isPrebuiltSpreads) return;
      const timeout = setTimeout(() => {
        flipBookRef.current?.pageFlip?.()?.turnToPage(0);
      }, 150);
      return () => clearTimeout(timeout);
    }, [pdf, HTMLFlipBook, isPrebuiltSpreads]);

    // Prebuilt-spreads books don't need react-pageflip loaded at all
    // (see the branched return below), so they can render immediately
    // without waiting for that dynamic import to resolve.
    if (!pdf || leafBox.width <= 0 || leafBox.height <= 0) {
      return null;
    }
    if (!isPrebuiltSpreads && !HTMLFlipBook) {
      return null;
    }

    const totalPages = profile.totalPages;
    const hasCover = profile.hasCover;
    const readingDirection: ReadingDirection = profile.readingDirection;
    const allPageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

    function handleFlip() {
      const flip = flipBookRef.current?.pageFlip?.();
      if (!flip) return;

      const currentLeafIndex = flip.getCurrentPageIndex();
      const currentPageNumber = currentLeafIndex + 1;

      // Keep the aspect-tracking state in sync with whatever leaf is
      // actually showing now, on every single flip — this is what
      // lets the `aspect` useMemo above always reflect the real page.
      setCurrentPageNumber(currentPageNumber);

      // ── PREBUILT-SPREADS MODE ───────────────────────────────────────
      // Every leaf is shown alone, always. No pairing math at all.
      // Display label comes from pageMap (e.g. "02–03") if available,
      // otherwise just the raw PDF page number.
      if (isPrebuiltSpreads) {
        onPageChange({
          pageNumbers: [currentPageNumber],
          label: getDisplayLabel(profile, currentPageNumber),
        });
        return;
      }

      // ── SINGLE-PAGES MODE (original pairing behaviour) ─────────────
      if (currentPageNumber <= frontMatterPages) {
        onPageChange({
          pageNumbers: [currentPageNumber],
          label: getDisplayLabel(profile, currentPageNumber),
        });
        return;
      }

      const role = resolvePageRole(profile, currentPageNumber, frontMatterPages);
      if (role !== "content") {
        onPageChange({
          pageNumbers: [currentPageNumber],
          label: getDisplayLabel(profile, currentPageNumber),
        });
        return;
      }

      const currentDims = pageDims.get(currentPageNumber);
      if (currentDims?.orientation === "landscape") {
        onPageChange({
          pageNumbers: [currentPageNumber],
          label: getDisplayLabel(profile, currentPageNumber),
        });
        return;
      }

      const firstContentPage = frontMatterPages + 1;
      const offset = currentPageNumber - firstContentPage;
      const isLeftOfPair = offset % 2 === 0;
      const partner = isLeftOfPair
        ? currentPageNumber + 1
        : currentPageNumber - 1;
      const partnerClamped = Math.max(1, Math.min(partner, totalPages));

      const left = isLeftOfPair ? currentPageNumber : partnerClamped;
      const right = isLeftOfPair ? partnerClamped : currentPageNumber;

      const orderedPages =
        readingDirection === "rtl" ? [right, left] : [left, right];

      const leftLabel = getDisplayLabel(profile, orderedPages[0]);
      const rightLabel = getDisplayLabel(profile, orderedPages[1]);

      onPageChange({
        pageNumbers: orderedPages,
        label: `${leftLabel}–${rightLabel}`,
      });
    }

    // ── CUSTOM PREBUILT-SPREADS FLIP (no react-pageflip) ────────────
    // react-pageflip was not handling landscape prebuilt-spread pages
    // correctly (internal sizing/animation mismatch across several
    // attempted fixes) — for this mode only, render the current
    // spread directly via PdfPageCanvas and animate page turns with a
    // hand-rolled CSS rotateY transform instead. Goes through the
    // EXACT SAME FlipEngineHandle/onPageChange contract as the
    // react-pageflip path below, so nothing in BookSpread or
    // PremiumReaderV2 needs to change — current page state, Previous/
    // Next buttons, and labels all keep working unchanged.
    if (isPrebuiltSpreads) {
      const currentBox = getPageContainBox(currentPageNumber);
      const incomingBox = transitioningTo !== null ? getPageContainBox(transitioningTo) : null;

      return (
        <div
          ref={flipStageRef}
          className={`ndl-flip-stage ${bookOpened ? "ndl-flip-opened" : "ndl-flip-closed"}`}
          style={{
            width: leafBox.width,
            height: leafBox.height,
            position: "relative",
            margin: "0 auto",
          }}
        >
          <div className="ndl-flip-shadow-wrap">
            <div className="ndl-book-ambient-shadow" aria-hidden />

            <div
              style={{
                position: "relative",
                width: leafBox.width,
                height: leafBox.height,
                perspective: 1800,
                overflow: "hidden",
              }}
            >
              {/* Incoming spread — revealed underneath as the current
                  spread rotates away during a turn. */}
              {transitioningTo !== null && incomingBox && (
                <div
                  data-page-number={transitioningTo}
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1,
                  }}
                >
                  <div
                    style={{
                      width: incomingBox.width,
                      height: incomingBox.height,
                      position: "relative",
                    }}
                  >
                    <PdfPageCanvas
                      pdf={pdf}
                      pageNumber={transitioningTo}
                      width={incomingBox.width}
                      height={incomingBox.height}
                    />
                  </div>
                </div>
              )}

              {/* Current spread — the element react-pageflip's flip
                  would have animated; here it's a plain CSS rotateY
                  transform on THIS SAME box, around the spine edge
                  matching the turn direction, over 500ms. At rest
                  (transitioningTo === null) it sits flat with no
                  transition at all. */}
              <div
                data-page-number={currentPageNumber}
                className="ndl-flip-page"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 2,
                  background: "#fdfcf9",
                  transformStyle: "preserve-3d",
                  backfaceVisibility: "hidden",
                  transformOrigin:
                    transitionDirection === "next" ? "right center" : "left center",
                  transform:
                    transitionDirection === "next"
                      ? "rotateY(-100deg)"
                      : transitionDirection === "prev"
                      ? "rotateY(100deg)"
                      : "rotateY(0deg)",
                  transition: transitioningTo !== null ? "transform 500ms ease-in-out" : "none",
                }}
              >
                <div
                  style={{
                    width: currentBox.width,
                    height: currentBox.height,
                    position: "relative",
                  }}
                >
                  <PdfPageCanvas
                    pdf={pdf}
                    pageNumber={currentPageNumber}
                    width={currentBox.width}
                    height={currentBox.height}
                  />
                  {renderSelectionLayer?.(currentPageNumber, currentBox)}
                </div>
              </div>
            </div>
          </div>

          <style>{`
            .ndl-flip-stage {
              transition: opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1);
              will-change: opacity;
            }
            .ndl-flip-closed { opacity: 0; }
            .ndl-flip-opened { opacity: 1; }
            .ndl-flip-shadow-wrap {
              position: relative;
              filter: drop-shadow(0 20px 40px rgba(40,28,8,0.30))
                      drop-shadow(0 4px 10px rgba(40,28,8,0.18));
            }
            .ndl-book-ambient-shadow {
              position: absolute;
              left: 6%; right: 6%; bottom: -24px; height: 30px;
              border-radius: 50%;
              background: radial-gradient(ellipse at center, rgba(40,28,8,0.24) 0%, rgba(40,28,8,0.10) 45%, transparent 75%);
              filter: blur(7px);
              pointer-events: none;
              z-index: -1;
              transition: opacity 0.6s ease;
              will-change: opacity;
            }
            .ndl-flip-closed .ndl-book-ambient-shadow { opacity: 0; }
            .ndl-flip-opened .ndl-book-ambient-shadow { opacity: 1; }
          `}</style>
        </div>
      );
    }

    return (
      <div
        ref={flipStageRef}
        className={`ndl-flip-stage ${bookOpened ? "ndl-flip-opened" : "ndl-flip-closed"}`}
        style={{
          width: mode === "double" ? leafBox.width * 2 + GUTTER : leafBox.width,
          height: leafBox.height,
          position: "relative",
          margin: "0 auto",
        }}
      >
        <div className="ndl-flip-shadow-wrap">
          <div className="ndl-book-ambient-shadow" aria-hidden />

          <HTMLFlipBook
            ref={flipBookRef}
            width={leafBox.width}
            height={leafBox.height}
            size="fixed"
            minWidth={leafBox.width}
            maxWidth={leafBox.width}
            minHeight={leafBox.height}
            maxHeight={leafBox.height}
            showCover={isPrebuiltSpreads ? false : hasCover}
            usePortrait={isPrebuiltSpreads ? true : mode === "single"}
            startPage={0}
            drawShadow
            maxShadowOpacity={0.3}
            flippingTime={700}
            useMouseEvents
            clickEventForward={false}
            swipeDistance={30}
            showPageCorners
            disableFlipByClick={false}
            rtl={readingDirection === "rtl"}
            className="ndl-pageflip"
            style={{}}
            onFlip={handleFlip}
          >
            {allPageNumbers.map((pageNumber) => {
              const role = isPrebuiltSpreads
                ? (pageNumber === 1 ? "cover" : "content")
                : resolvePageRole(profile, pageNumber, frontMatterPages);
              const pageBox = getPageContainBox(pageNumber);
              return (
                <div
                  key={pageNumber}
                  data-page-number={pageNumber}
                  className="ndl-flip-page"
                  data-density={role === "cover" && !isPrebuiltSpreads ? "hard" : "soft"}
                  style={{
                    position: "relative",
                    width: leafBox.width,
                    height: leafBox.height,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {/*
                    This inner box is THIS page's own fit-contain size
                    — computed from its OWN real pageDims, never a
                    borrowed/global aspect. It is centered within the
                    outer leafBox-sized frame above, so a Title/
                    Credits page with a different aspect than the
                    landscape spread pages letterboxes correctly
                    (smaller, centered) instead of being cropped or
                    stretched to fill the frame.
                  */}
                  <div style={{ width: pageBox.width, height: pageBox.height, position: "relative" }}>
                    <PdfPageCanvas
                      pdf={pdf}
                      pageNumber={pageNumber}
                      width={pageBox.width}
                      height={pageBox.height}
                    />
                    {renderSelectionLayer?.(pageNumber, pageBox)}
                  </div>
                </div>
              );
            })}
          </HTMLFlipBook>
        </div>

        <style>{`
          .ndl-flip-stage {
            transition: opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1);
            will-change: opacity;
          }
          .ndl-flip-closed { opacity: 0; }
          .ndl-flip-opened { opacity: 1; }
          .ndl-flip-shadow-wrap {
            position: relative;
            filter: drop-shadow(0 20px 40px rgba(40,28,8,0.30))
                    drop-shadow(0 4px 10px rgba(40,28,8,0.18));
          }
          .ndl-flip-page {
            background: #fdfcf9;
            overflow: hidden;
            width: 100%;
            height: 100%;
          }
          .ndl-pageflip { margin: 0 auto; }
          .ndl-flip-shadow-wrap::after {
            content: "";
            position: absolute;
            inset: -3px;
            border-radius: 4px;
            background: linear-gradient(135deg, rgba(154,107,47,0.0) 0%, rgba(154,107,47,0.08) 50%, rgba(154,107,47,0.0) 100%);
            pointer-events: none;
            z-index: -1;
          }
          .stf__parent .stf__item:first-child {
            box-shadow: inset 0 0 0 1px rgba(60,40,10,0.07), 2px 0 0 rgba(250,247,240,0.9), 4px 0 0 rgba(235,228,210,0.7), 6px 0 0 rgba(220,210,185,0.5), 4px 0 16px rgba(60,40,10,0.16);
          }
          .stf__parent .stf__item:last-child {
            box-shadow: inset 0 0 0 1px rgba(60,40,10,0.07), -2px 0 0 rgba(250,247,240,0.9), -4px 0 0 rgba(235,228,210,0.7), -6px 0 0 rgba(220,210,185,0.5), -4px 0 16px rgba(60,40,10,0.16);
          }
          .ndl-book-ambient-shadow {
            position: absolute;
            left: 6%; right: 6%; bottom: -24px; height: 30px;
            border-radius: 50%;
            background: radial-gradient(ellipse at center, rgba(40,28,8,0.24) 0%, rgba(40,28,8,0.10) 45%, transparent 75%);
            filter: blur(7px);
            pointer-events: none;
            z-index: -1;
            transition: opacity 0.6s ease;
            will-change: opacity;
          }
          .ndl-flip-closed .ndl-book-ambient-shadow { opacity: 0; }
          .ndl-flip-opened .ndl-book-ambient-shadow { opacity: 1; }
          .stf__item .stf__corner { opacity: 0; transition: opacity 0.3s ease; }
          .stf__block:hover .stf__corner { opacity: 0.5; }

          /*
            CROP FIX, corrected approach — SCOPED TO SINGLE MODE ONLY.
            This override was added to fix Nalanda's single-leaf crop:
            forcing .stf__item to 100%/100% made the box react-pageflip
            animates match the box PdfPageCanvas paints into, when
            there is exactly ONE page per "item" filling the whole
            spread width.
            In DOUBLE mode (two real pages side by side, e.g. this
            quantum textbook), react-pageflip's OWN default sizing
            gives each .stf__item roughly HALF the spread's width, so
            it can independently rotate just the right page around the
            center spine during a flip. Forcing width:100% on EVERY
            .stf__item regardless of mode — the previous version of
            this rule — made each item claim the FULL spread width
            instead of half, which is exactly what made both pages
            move together as one rigid block instead of one page
            flipping from the spine. This rule must never apply in
            double mode.
          */
          ${
            mode === "single"
              ? `
          .stf__item {
            width: 100% !important;
            height: 100% !important;
            overflow: hidden;
          }
          `
              : ""
          }
        `}</style>
      </div>
    );
  }
);

export default FlipEngine;

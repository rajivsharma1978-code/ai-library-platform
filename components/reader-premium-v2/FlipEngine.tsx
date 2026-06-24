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
}

const FALLBACK_ASPECT = 0.72;

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
    { pdf, profile, pageDims, stageWidth, stageHeight, onPageChange, renderSelectionLayer },
    ref
  ) {
    const flipBookRef = useRef<any>(null);
    const [bookOpened, setBookOpened] = useState(false);
    const [HTMLFlipBook, setHTMLFlipBook] = useState<any>(null);

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

    const aspect = useMemo(() => {
      if (isPrebuiltSpreads) return resolveAspectPrebuiltSpreads(pageDims);
      return resolveAspectSinglePages(pageDims, frontMatterPages);
    }, [isPrebuiltSpreads, pageDims, frontMatterPages]);

    const leafBox = useMemo(() => {
      if (stageWidth <= 0 || stageHeight <= 0) {
        return { width: 0, height: 0 };
      }

      // mode is always "single" in prebuilt-spreads mode, so the leaf
      // always gets the FULL stage width — never halved for pairing.
      const usableWidth = mode === "double" ? (stageWidth - 6) / 2 : stageWidth;
      const usableHeight = stageHeight;

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

      return {
        width: Math.max(Math.floor(leafWidth), 1),
        height: Math.max(Math.floor(leafHeight), 1),
      };
    }, [aspect, mode, stageWidth, stageHeight]);

    useImperativeHandle(ref, () => ({
      flipNext: () => {
        flipBookRef.current?.pageFlip?.()?.flipNext();
      },
      flipPrev: () => {
        flipBookRef.current?.pageFlip?.()?.flipPrev();
      },
      flipToPage: (pageIndex: number) => {
        flipBookRef.current?.pageFlip?.()?.flip(pageIndex);
      },
    }));

    useEffect(() => {
      if (!pdf) return;
      const timeout = setTimeout(() => setBookOpened(true), 80);
      return () => clearTimeout(timeout);
    }, [pdf]);

    useEffect(() => {
      if (!pdf || !HTMLFlipBook) return;
      const timeout = setTimeout(() => {
        flipBookRef.current?.pageFlip?.()?.turnToPage(0);
      }, 150);
      return () => clearTimeout(timeout);
    }, [pdf, HTMLFlipBook]);

    if (!pdf || !HTMLFlipBook || leafBox.width <= 0 || leafBox.height <= 0) {
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

    return (
      <div
        className={`ndl-flip-stage ${bookOpened ? "ndl-flip-opened" : "ndl-flip-closed"}`}
        style={{
          width: mode === "double" ? leafBox.width * 2 + 6 : leafBox.width,
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
              return (
                <div
                  key={pageNumber}
                  className="ndl-flip-page"
                  data-density={role === "cover" && !isPrebuiltSpreads ? "hard" : "soft"}
                  style={{ position: "relative" }}
                >
                  <PdfPageCanvas
                    pdf={pdf}
                    pageNumber={pageNumber}
                    width={leafBox.width}
                    height={leafBox.height}
                  />
                  {renderSelectionLayer?.(pageNumber, leafBox)}
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
        `}</style>
      </div>
    );
  }
);

export default FlipEngine;

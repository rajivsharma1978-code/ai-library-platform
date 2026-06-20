"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import type { PDFDocumentProxy } from "pdfjs-dist";
import PdfPageCanvas from "./PdfPageCanvas";
import type { RealPageDims } from "@/lib/premium-reader/pdfLayoutAnalyzer";
import type { ReadingDirection } from "@/lib/premium-reader/bookProfile";

const HTMLFlipBook = dynamic(() => import("react-pageflip"), { ssr: false }) as any;

export interface FlipEngineHandle {
  flipNext: () => void;
  flipPrev: () => void;
  flipToPage: (pageIndex: number) => void;
}

export type FlipMode = "single" | "double";

interface FlipEngineProps {
  pdf: PDFDocumentProxy | null;
  totalPages: number;
  hasCover: boolean;
  pageDims: Map<number, RealPageDims>;
  mode: FlipMode;
  readingDirection: ReadingDirection;
  stageWidth: number;
  stageHeight: number;
  onPageChange: (pageNumbers: number[]) => void;
}

function computeLeafSize(
  pageDims: Map<number, RealPageDims>,
  mode: FlipMode,
  stageWidth: number,
  stageHeight: number
): { width: number; height: number } {
  const reference = pageDims.get(1) ?? Array.from(pageDims.values())[0];
  const aspect = reference ? reference.width / reference.height : 0.72;

  const usableWidth = mode === "double" ? (stageWidth - 8) / 2 : stageWidth;
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
}

const FlipEngine = forwardRef<FlipEngineHandle, FlipEngineProps>(
  function FlipEngine(
    {
      pdf,
      totalPages,
      hasCover,
      pageDims,
      mode,
      readingDirection,
      stageWidth,
      stageHeight,
      onPageChange,
    },
    ref
  ) {
    const flipBookRef = useRef<any>(null);
    const [bookOpened, setBookOpened] = useState(false);

    // Lock leaf size once we have a real cover/page-1 aspect ratio AND a
    // stable stage size — but only re-lock if the size changed by a
    // meaningful amount (>4px), to avoid remounting HTMLFlipBook every
    // time an async page-dim resolves.
    const leafSizeRef = useRef<{ width: number; height: number } | null>(null);
    const [lockedLeafSize, setLockedLeafSize] = useState<{
      width: number;
      height: number;
    } | null>(null);

    const computedLeafSize = useMemo(
      () => computeLeafSize(pageDims, mode, stageWidth, stageHeight),
      [pageDims, mode, stageWidth, stageHeight]
    );

    useEffect(() => {
      if (computedLeafSize.width <= 0 || computedLeafSize.height <= 0) return;

      const prev = leafSizeRef.current;
      const changed =
        !prev ||
        Math.abs(prev.width - computedLeafSize.width) > 4 ||
        Math.abs(prev.height - computedLeafSize.height) > 4;

      if (changed) {
        leafSizeRef.current = computedLeafSize;
        setLockedLeafSize(computedLeafSize);
      }
    }, [computedLeafSize]);

    useImperativeHandle(ref, () => ({
      flipNext: () => {
        flipBookRef.current?.getPageFlip()?.flipNext();
      },
      flipPrev: () => {
        flipBookRef.current?.getPageFlip()?.flipPrev();
      },
      flipToPage: (pageIndex: number) => {
        flipBookRef.current?.getPageFlip()?.flip(pageIndex);
      },
    }));

    useEffect(() => {
      if (!pdf) return;
      const timeout = setTimeout(() => setBookOpened(true), 80);
      return () => clearTimeout(timeout);
    }, [pdf]);

    if (!pdf || !lockedLeafSize || lockedLeafSize.width <= 0 || lockedLeafSize.height <= 0) {
      return null;
    }

    const leafSize = lockedLeafSize;
    const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

    return (
      <div
        className={`ndl-flip-stage ${bookOpened ? "ndl-flip-opened" : "ndl-flip-closed"}`}
        style={{
          width: mode === "double" ? leafSize.width * 2 + 8 : leafSize.width,
          height: leafSize.height,
          position: "relative",
          margin: "0 auto",
        }}
      >
        <div className="ndl-flip-shadow-wrap">
          <div className="ndl-book-ambient-shadow" aria-hidden />

          <HTMLFlipBook
            ref={flipBookRef}
            width={leafSize.width}
            height={leafSize.height}
            size="fixed"
            minWidth={leafSize.width}
            maxWidth={leafSize.width}
            minHeight={leafSize.height}
            maxHeight={leafSize.height}
            showCover={hasCover}
            usePortrait={mode === "single"}
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
            onFlip={(e: { data: number }) => {
              const leafIndex = e.data;

              if (mode === "single") {
                onPageChange([leafIndex + 1]);
                return;
              }

              if (hasCover && leafIndex === 0) {
                onPageChange([1]);
                return;
              }

              const firstContentPage = hasCover ? 2 : 1;
              const pairStart = firstContentPage + (leafIndex - (hasCover ? 1 : 0)) * 2;
              const right = Math.min(pairStart + 1, totalPages);

              onPageChange(
                readingDirection === "rtl" ? [right, pairStart] : [pairStart, right]
              );
            }}
          >
           {pageNumbers.map((pageNumber) => {
  const isCoverLeaf = hasCover && pageNumber === 1;
  return (
    <div
      key={pageNumber}
      className="ndl-flip-page"
      data-density={isCoverLeaf ? "hard" : "soft"}
    >
      <PdfPageCanvas
        pdf={pdf}
        pageNumber={pageNumber}
        width={leafSize.width}
        height={leafSize.height}
      />
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
          .ndl-flip-closed {
            opacity: 0;
          }
          .ndl-flip-opened {
            opacity: 1;
          }
          .ndl-flip-shadow-wrap {
            position: relative;
            filter: drop-shadow(0 20px 40px rgba(40,28,8,0.30))
                    drop-shadow(0 4px 10px rgba(40,28,8,0.18));
          }
          .ndl-flip-page {
            background: #fdfcf9;
            overflow: hidden;
          }
          .ndl-pageflip {
            margin: 0 auto;
          }

          .ndl-flip-shadow-wrap::after {
            content: "";
            position: absolute;
            inset: -3px;
            border-radius: 4px;
            background: linear-gradient(
              135deg,
              rgba(154,107,47,0.0) 0%,
              rgba(154,107,47,0.08) 50%,
              rgba(154,107,47,0.0) 100%
            );
            pointer-events: none;
            z-index: -1;
          }

          .stf__parent .stf__item:first-child {
            box-shadow:
              inset 0 0 0 1px rgba(60,40,10,0.07),
              2px 0 0 rgba(250,247,240,0.9),
              4px 0 0 rgba(235,228,210,0.7),
              6px 0 0 rgba(220,210,185,0.5),
              4px 0 16px rgba(60,40,10,0.16);
          }
          .stf__parent .stf__item:last-child {
            box-shadow:
              inset 0 0 0 1px rgba(60,40,10,0.07),
              -2px 0 0 rgba(250,247,240,0.9),
              -4px 0 0 rgba(235,228,210,0.7),
              -6px 0 0 rgba(220,210,185,0.5),
              -4px 0 16px rgba(60,40,10,0.16);
          }

          .ndl-book-ambient-shadow {
            position: absolute;
            left: 6%;
            right: 6%;
            bottom: -24px;
            height: 30px;
            border-radius: 50%;
            background: radial-gradient(
              ellipse at center,
              rgba(40,28,8,0.24) 0%,
              rgba(40,28,8,0.10) 45%,
              transparent 75%
            );
            filter: blur(7px);
            pointer-events: none;
            z-index: -1;
            transition: opacity 0.6s ease;
            will-change: opacity;
          }
          .ndl-flip-closed .ndl-book-ambient-shadow { opacity: 0; }
          .ndl-flip-opened .ndl-book-ambient-shadow { opacity: 1; }

          .stf__item .stf__corner {
            opacity: 0;
            transition: opacity 0.3s ease;
          }
          .stf__block:hover .stf__corner {
            opacity: 0.5;
          }
        `}</style>
      </div>
    );
  }
);

export default FlipEngine;
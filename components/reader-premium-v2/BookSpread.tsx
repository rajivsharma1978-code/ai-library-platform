"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import FlipEngine, { type FlipEngineHandle, type FlipMode } from "./FlipEngine";
import { observeSize } from "@/lib/premium-reader/viewport";
import type { RealPageDims } from "@/lib/premium-reader/pdfLayoutAnalyzer";
import type { ReadingDirection } from "@/lib/premium-reader/bookProfile";

interface BookSpreadProps {
  pdf: PDFDocumentProxy | null;
  totalPages: number;
  hasCover: boolean;
  pageDims: Map<number, RealPageDims>;
  mode: FlipMode;
  readingDirection: ReadingDirection;
  onPageChange: (pageNumbers: number[]) => void;
}

export type BookSpreadHandle = FlipEngineHandle;

const FRAME_PADDING = 32;

const BookSpread = forwardRef<BookSpreadHandle, BookSpreadProps>(
  function BookSpread(
    { pdf, totalPages, hasCover, pageDims, mode, readingDirection, onPageChange },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [availSize, setAvailSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      setAvailSize({ width: el.clientWidth, height: el.clientHeight });
      return observeSize(el, setAvailSize);
    }, []);

    const innerW = Math.max(availSize.width - FRAME_PADDING * 2, 0);
    const innerH = Math.max(availSize.height - FRAME_PADDING * 2, 0);

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
        }}
      >
        <FlipEngine
          ref={ref}
          pdf={pdf}
          totalPages={totalPages}
          hasCover={hasCover}
          pageDims={pageDims}
          mode={mode}
          readingDirection={readingDirection}
          stageWidth={innerW}
          stageHeight={innerH}
          onPageChange={onPageChange}
        />
      </div>
    );
  }
);

export default BookSpread;

"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import FlipEngine, { type FlipEngineHandle } from "./FlipEngine";
import { observeSize } from "@/lib/premium-reader/viewport";
import type { RealPageDims } from "@/lib/premium-reader/pdfLayoutAnalyzer";
import type { BookProfile } from "@/lib/premium-reader/bookProfile";

interface BookSpreadProps {
  pdf: PDFDocumentProxy | null;
  profile: BookProfile;
  pageDims: Map<number, RealPageDims>;
  onPageChange: (info: { pageNumbers: number[]; label: string }) => void;
}

export type BookSpreadHandle = FlipEngineHandle;

const FRAME_PADDING = 32;

const BookSpread = forwardRef<BookSpreadHandle, BookSpreadProps>(
  function BookSpread({ pdf, profile, pageDims, onPageChange }, ref) {
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
          profile={profile}
          pageDims={pageDims}
          stageWidth={innerW}
          stageHeight={innerH}
          onPageChange={onPageChange}
        />
      </div>
    );
  }
);

export default BookSpread;

"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import PdfPageCanvas from "./PdfPageCanvas";
import { observeSize } from "@/lib/premium-reader/viewport";
import type { RealPageDims } from "@/lib/premium-reader/pdfLayoutAnalyzer";
import type { BookProfile } from "@/lib/premium-reader/bookProfile";

interface FullscreenReaderViewProps {
  pdf: PDFDocumentProxy | null;
  profile: BookProfile;
  pageDims: Map<number, RealPageDims>;
  currentPageNumbers: number[];
  currentLabel: string;
  zoom: number;
  onPrev: () => void;
  onNext: () => void;
}

const FALLBACK_ASPECT = 0.72;
const GUTTER = 6;

function getPageAspect(
  pageDims: Map<number, RealPageDims>,
  pageNumber: number | undefined
): number {
  if (pageNumber === undefined) return FALLBACK_ASPECT;
  const dims = pageDims.get(pageNumber);
  if (!dims) return FALLBACK_ASPECT;
  return dims.width / dims.height;
}

/** Shrinks (never grows) width/height proportionally so neither exceeds the container — guarantees no cropping. */
function clampToContainer(
  width: number,
  height: number,
  containerW: number,
  containerH: number
): { width: number; height: number } {
  if (width <= containerW && height <= containerH) {
    return { width: Math.max(Math.floor(width), 1), height: Math.max(Math.floor(height), 1) };
  }
  const widthRatio = containerW > 0 && width > 0 ? containerW / width : 1;
  const heightRatio = containerH > 0 && height > 0 ? containerH / height : 1;
  const scale = Math.min(widthRatio, heightRatio);
  return {
    width: Math.max(Math.floor(width * scale), 1),
    height: Math.max(Math.floor(height * scale), 1),
  };
}

/**
 * Simplified, no-flip reader view used ONLY while in fullscreen.
 * Renders the currently visible page(s) directly via PdfPageCanvas,
 * fit-contain sized to the available container — no react-pageflip,
 * no page-turn animation, no transform:scale anywhere in this file.
 *
 * Page preservation: this component does not own or reset page state
 * itself. currentPageNumbers/currentLabel are passed in from
 * PremiumReaderV2 (the same state FlipEngine normally drives), and
 * onPrev/onNext are PremiumReaderV2's own fullscreen-specific
 * navigation handlers — this view just renders whatever it's told to.
 *
 * Zoom is applied as a fit-contain scale factor (growing the rendered
 * size up to zoom%), then re-clamped to the container so it can never
 * exceed available space — "never crop" always wins over the zoom
 * percentage if the two conflict.
 */
export default function FullscreenReaderView({
  pdf,
  profile,
  pageDims,
  currentPageNumbers,
  currentLabel,
  zoom,
  onPrev,
  onNext,
}: FullscreenReaderViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return observeSize(el, setContainerSize);
  }, []);

  // onPrev/onNext are accepted per the component contract (so a future
  // on-canvas click-to-navigate affordance can be added here without
  // changing the prop interface again) but aren't wired to any click
  // handler in this minimal version — PremiumReaderV2's existing
  // Previous/Next buttons already cover navigation in fullscreen.
  void onPrev;
  void onNext;

  if (!pdf) return null;

  const leftPageNumber = currentPageNumbers[0];
  const rightPageNumber =
    currentPageNumbers.length > 1 ? currentPageNumbers[1] : undefined;

  const containerW = containerSize.width;
  const containerH = containerSize.height;

  let leftBox = { width: 0, height: 0 };
  let rightBox: { width: number; height: number } | null = null;

  if (containerW > 0 && containerH > 0 && leftPageNumber !== undefined) {
    if (rightPageNumber !== undefined) {
      // ── Spread (two visible pages) — fitContainSpread ────────────
      const aspectLeft = getPageAspect(pageDims, leftPageNumber);
      const aspectRight = getPageAspect(pageDims, rightPageNumber);

      const maxHeightFromWidth = (containerW - GUTTER) / (aspectLeft + aspectRight);
      const baseHeight = Math.min(containerH, maxHeightFromWidth);

      const zoomedHeight = baseHeight * (zoom / 100);
      const zoomedLeftWidth = zoomedHeight * aspectLeft;
      const zoomedRightWidth = zoomedHeight * aspectRight;
      const zoomedTotalWidth = zoomedLeftWidth + zoomedRightWidth + GUTTER;

      const clamped = clampToContainer(zoomedTotalWidth, zoomedHeight, containerW, containerH);
      const finalHeight = clamped.height;

      leftBox = {
        width: Math.max(Math.floor(finalHeight * aspectLeft), 1),
        height: finalHeight,
      };
      rightBox = {
        width: Math.max(Math.floor(finalHeight * aspectRight), 1),
        height: finalHeight,
      };
    } else {
      // ── Single visible page — fitContain ─────────────────────────
      const aspect = getPageAspect(pageDims, leftPageNumber);
      const widthFromHeight = containerH * aspect;

      let baseWidth: number;
      let baseHeight: number;
      if (widthFromHeight <= containerW) {
        baseHeight = containerH;
        baseWidth = widthFromHeight;
      } else {
        baseWidth = containerW;
        baseHeight = containerW / aspect;
      }

      leftBox = clampToContainer(
        baseWidth * (zoom / 100),
        baseHeight * (zoom / 100),
        containerW,
        containerH
      );
    }
  }

  return (
    <div
      ref={containerRef}
      aria-label={`${profile.title} — page ${currentLabel}`}
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
      {leftPageNumber !== undefined && leftBox.width > 0 && leftBox.height > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: rightBox ? GUTTER : 0,
          }}
        >
          <div style={{ width: leftBox.width, height: leftBox.height, position: "relative" }}>
            <PdfPageCanvas
              pdf={pdf}
              pageNumber={leftPageNumber}
              width={leftBox.width}
              height={leftBox.height}
            />
          </div>
          {rightPageNumber !== undefined && rightBox && (
            <div style={{ width: rightBox.width, height: rightBox.height, position: "relative" }}>
              <PdfPageCanvas
                pdf={pdf}
                pageNumber={rightPageNumber}
                width={rightBox.width}
                height={rightBox.height}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

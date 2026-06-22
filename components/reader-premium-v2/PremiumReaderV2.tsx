"use client";

import ReaderToolbar from "./ReaderToolbar";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { BookProfile } from "@/lib/premium-reader/bookProfile";
import {
  getRealPageDims,
  type RealPageDims,
} from "@/lib/premium-reader/pdfLayoutAnalyzer";
import {
  resolvePageText,
  type PageTextSource,
} from "@/lib/premium-reader/pageTextExtractor";
import BookSpread, { type BookSpreadHandle } from "./BookSpread";

interface PremiumReaderV2Props {
  profile: BookProfile;
}

export default function PremiumReaderV2({ profile }: PremiumReaderV2Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageDims, setPageDims] = useState<Map<number, RealPageDims>>(new Map());
  const [currentPageNumbers, setCurrentPageNumbers] = useState<number[]>([1]);
  const [currentLabel, setCurrentLabel] = useState<string>("1");
  const [currentPageText, setCurrentPageText] = useState("");
  // Tracks where currentPageText came from ("selectable" | "ocr" | "none")
  // and whether OCR is actively running, so the UI can show a
  // "Reading scanned page…" indicator only while OCR is in progress.
  const [currentPageTextSource, setCurrentPageTextSource] = useState<PageTextSource>("none");
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [zoom, setZoom] = useState(100);
  



  const flipRef = useRef<BookSpreadHandle>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const doc = await pdfjsLib.getDocument(profile.pdfPath).promise;
        if (cancelled) return;

        setPdf(doc);
      } catch (err) {
        if (cancelled) return;
        console.error("[PremiumReaderV2] Failed to load PDF:", err);
        setLoadError(
          err instanceof Error ? err.message : "Failed to load this book."
        );
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [profile.pdfPath]);

  useEffect(() => {
    if (!pdf) return;
const safePdf = pdf;
let cancelled = false;

    async function analyzeInitial() {
      const newDims = new Map<number, RealPageDims>();
      const pagesToCheck = [1, 2, 3, 4, 5, 6].filter((p) => p <= profile.totalPages);

      for (const p of pagesToCheck) {
        try {
          const dims = await getRealPageDims(safePdf, p);
          if (cancelled) return;
          newDims.set(p, dims);
        } catch (err) {
          console.error(`[PremiumReaderV2] Could not analyze page ${p}:`, err);
        }
      }

      if (!cancelled) {
        setPageDims(newDims);
        setIsReady(true);
      }
    }

    analyzeInitial();
    return () => {
      cancelled = true;
    };
  }, [pdf, profile.totalPages]);

  const handlePageChange = useCallback(
    (info: { pageNumbers: number[]; label: string }) => {
      setCurrentPageNumbers(info.pageNumbers);
      setCurrentLabel(info.label);
    },
    []
  );

  // ── Page text resolution: selectable text first, OCR fallback ───────
  // Replaces the previous selectable-only extraction. Behaviour is
  // identical when the page has selectable text (same fast path); only
  // adds an OCR fallback + "Reading scanned page…" state when a page
  // has no selectable text at all (scanned/image pages).
  useEffect(() => {
    if (!pdf || currentPageNumbers.length === 0) {
      setCurrentPageText("");
      setCurrentPageTextSource("none");
      return;
    }

    let cancelled = false;
    setIsOcrRunning(false);

    async function resolveCurrentPageText() {
      try {
        const results = await Promise.all(
          currentPageNumbers.map((pageNumber) =>
            resolvePageText(pdf!, profile.pdfPath, pageNumber, () => {
              if (!cancelled) setIsOcrRunning(true);
            })
          )
        );

        if (cancelled) return;

        setIsOcrRunning(false);

        const combinedText = results
          .map((r) => r.text)
          .filter((t) => t.length > 0)
          .join("\n\n");

        const anySelectable = results.some((r) => r.source === "selectable");
        const anyOcr = results.some((r) => r.source === "ocr");

        setCurrentPageText(combinedText);
        setCurrentPageTextSource(
          combinedText.length === 0
            ? "none"
            : anySelectable
            ? "selectable"
            : anyOcr
            ? "ocr"
            : "none"
        );
      } catch (err) {
        console.error("[PremiumReaderV2] Could not resolve page text:", err);
        if (!cancelled) {
          setCurrentPageText("");
          setCurrentPageTextSource("none");
          setIsOcrRunning(false);
        }
      }
    }

    resolveCurrentPageText();

    return () => {
      cancelled = true;
    };
  }, [pdf, currentPageNumbers, profile.pdfPath]);

  useEffect(() => {
    if (!pdf) return;
const safePdf = pdf;
let cancelled = false;

async function fillMissing() {
      for (const p of currentPageNumbers) {
        if (pageDims.has(p)) continue;
        try {
          const dims = await getRealPageDims(safePdf, p);
          if (cancelled) return;
          setPageDims((prev) => {
            const next = new Map(prev);
            next.set(p, dims);
            return next;
          });
        } catch (err) {
          console.error(`[PremiumReaderV2] Could not analyze page ${p}:`, err);
        }
      }
    }

    fillMissing();
    return () => {
      cancelled = true;
    };
  }, [pdf, currentPageNumbers, pageDims]);

  const goNext = useCallback(() => {
    flipRef.current?.flipNext();
  }, []);

  const goPrevious = useCallback(() => {
    flipRef.current?.flipPrev();
  }, []);

  function zoomIn() {
    setZoom((current) => Math.min(current + 10, 160));
  }
  
  function zoomOut() {
    setZoom((current) => Math.max(current - 10, 60));
  }
  
  function fitToScreen() {
    setZoom(100);
  }
  
  function readAloud() {
    if (typeof window === "undefined") return;

    // Priority order, per spec:
    // 1. selectable text if available
    // 2. OCR text if selectable text is empty
    // 3. fallback message if both fail
    // currentPageText/currentPageTextSource already encode this
    // priority (resolved in the useEffect above), so we just speak
    // whatever resolved, or the fallback message if nothing did.
    const text =
      currentPageText.trim().length > 0
        ? currentPageText
        : `This page does not contain any readable text.`;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000));
    utterance.lang = "en-IN";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  }
  
  function toggleTheme() {
    alert("Dark mode will be connected next.");
  }
  
  function enterFullscreen() {
    if (typeof document === "undefined") return;
  
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  }

  const isAtStart = currentPageNumbers[0] <= 1;
  const isAtEnd =
    currentPageNumbers[currentPageNumbers.length - 1] >= profile.totalPages;

  const currentViewLabel =
    currentPageNumbers.length === 2 ? "Two-Page Spread" : "Single Page";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr 320px",
        height: "100vh",
        maxHeight: "100vh",
        overflow: "hidden",
        background: "#f4efe6",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid #e3dcc9",
          background: "#fbf9f4",
          padding: 24,
          overflowY: "auto",
        }}
      >
        <p style={{ fontSize: 11, letterSpacing: 1, color: "#9a8c6b", fontWeight: 700 }}>
          NDL · PREMIUM READER
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 8, color: "#2c2416" }}>
          {profile.title}
        </h2>

        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 12, color: "#9a8c6b", marginBottom: 4 }}>Total Pages</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#2c2416" }}>
            {profile.totalPages}
          </p>
        </div>

        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, color: "#9a8c6b", marginBottom: 4 }}>Reading Direction</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#2c2416" }}>
            {profile.readingDirection === "rtl" ? "Right to Left" : "Left to Right"}
          </p>
        </div>

        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, color: "#9a8c6b", marginBottom: 4 }}>Current View</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#2c2416" }}>
            {currentViewLabel}
          </p>
        </div>
      </aside>

      <main
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 24,
          position: "relative",
          minWidth: 0,
        }}
      >
        {loadError && (
          <div style={{ textAlign: "center", color: "#8a6b3f" }}>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>Could not load this book</p>
            <p style={{ fontSize: 13, color: "#a89878" }}>{loadError}</p>
          </div>
        )}

        {!loadError && (
          <>
          <ReaderToolbar
  zoom={zoom}
  onZoomIn={zoomIn}
  onZoomOut={zoomOut}
  onFit={fitToScreen}
  onReadAloud={readAloud}
  onToggleTheme={toggleTheme}
  onFullscreen={enterFullscreen}
/>
            <div style={{ flex: 1, width: "100%", minHeight: 0 }}>
            <BookSpread
  ref={flipRef}
  pdf={pdf}
  profile={profile}
  pageDims={pageDims}
  zoom={zoom}
  onPageChange={handlePageChange}
/>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginTop: 16,
                flexShrink: 0,
              }}
            >
              <button
                onClick={goPrevious}
                disabled={!isReady || isAtStart}
                style={{
                  padding: "10px 20px",
                  borderRadius: 999,
                  border: "none",
                  background: "#2c2416",
                  color: "#f4efe6",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  opacity: !isReady || isAtStart ? 0.4 : 1,
                }}
              >
                ← Previous
              </button>

              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#6b5d42",
                  minWidth: 90,
                  textAlign: "center",
                }}
              >
                Page {currentLabel} of {profile.totalPages}
              </span>

              <button
                onClick={goNext}
                disabled={!isReady || isAtEnd}
                style={{
                  padding: "10px 20px",
                  borderRadius: 999,
                  border: "none",
                  background: "#9a6b2f",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  opacity: !isReady || isAtEnd ? 0.4 : 1,
                }}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </main>

      <aside
        style={{
          borderLeft: "1px solid #e3dcc9",
          background: "#fbf9f4",
          padding: 24,
          overflowY: "auto",
        }}
      >
        <p style={{ fontSize: 11, letterSpacing: 1, color: "#9a8c6b", fontWeight: 700 }}>
          AI COMPANION
        </p>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 8, color: "#2c2416" }}>
          Ask about this page
        </h2>
        <p style={{ fontSize: 13, color: "#8a7c5c", marginTop: 8, lineHeight: 1.6 }}>
          Select text from the book or ask anything about page {currentLabel}.
        </p>

        {/* OCR status indicator — additive only, shown above the
            existing action buttons. Appears only while OCR is
            actively running for a scanned page with no selectable text. */}
        {isOcrRunning && (
          <p
            style={{
              fontSize: 12,
              color: "#9a6b2f",
              fontWeight: 600,
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                border: "2px solid #e5d8c0",
                borderTopColor: "#9a6b2f",
                animation: "ndl-ocr-spin 0.8s linear infinite",
                display: "inline-block",
              }}
            />
            Reading scanned page…
            <style>{`@keyframes ndl-ocr-spin { to { transform: rotate(360deg); } }`}</style>
          </p>
        )}

        {!isOcrRunning && currentPageTextSource === "ocr" && (
          <p style={{ fontSize: 11, color: "#9a8c6b", marginTop: 16 }}>
            Text extracted from scanned image (OCR)
          </p>
        )}

        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {["Explain", "Summarize", "Translate", "Quiz me"].map((action) => (
            <button
              key={action}
              style={{
                textAlign: "left",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e3dcc9",
                background: "#fff",
                fontSize: 13,
                fontWeight: 600,
                color: "#2c2416",
                cursor: "pointer",
              }}
            >
              {action}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 24 }}>
          <input
            type="text"
            placeholder="Ask AI about this book..."
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #e3dcc9",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>
      </aside>
    </div>
  );
}

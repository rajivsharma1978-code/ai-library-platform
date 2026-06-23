"use client";

import ReaderToolbar from "./ReaderToolbar";
import type { SpeechState } from "./ReaderToolbar";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { BookProfile } from "@/lib/premium-reader/bookProfile";
import {
  getRealPageDims,
  type RealPageDims,
} from "@/lib/premium-reader/pdfLayoutAnalyzer";
import {
  resolvePageText,
  sanitizeForSpeech,
  type PageTextSource,
} from "@/lib/premium-reader/pageTextExtractor";
import {
  runAiAction,
  getSpeechLanguage,
  RESPONSE_LANGUAGES,
  type AiActionKind,
  type ResponseLanguage,
} from "@/lib/premium-reader/aiActions";
import BookSpread, { type BookSpreadHandle } from "./BookSpread";

interface PremiumReaderV2Props {
  profile: BookProfile;
}

interface ResolvedPageEntry {
  pageNumber: number;
  text: string;
  source: PageTextSource;
}

interface ReadAloudPayload {
  text: string;
  language: string;
  source: "ai-output" | "page-text";
}

const ALWAYS_ALLOWED_LANGUAGES: ResponseLanguage[] = ["English", "Hindi"];

const MIN_CHUNK_LENGTH = 20;
const HINDI_MIN_CHUNK_CHARS = 8;
const HINDI_TARGET_MIN = 60;
const HINDI_TARGET_MAX = 180;

export function cleanAiOutputForSpeech(text: string): string {
  if (!text) return "";

  let cleaned = text;

  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  cleaned = cleaned.replace(/```([\s\S]*?)```/g, "$1");
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");
  cleaned = cleaned.replace(/__([^_]+)__/g, "$1");
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");
  cleaned = cleaned.replace(/_([^_]+)_/g, "$1");
  cleaned = cleaned.replace(/^#{1,6}\s*/gm, "");
  cleaned = cleaned.replace(/^[\s]*[-*•–—]\s+/gm, "");
  cleaned = cleaned.replace(/^[\s]*\(?\d+[.)]\s+/gm, "");
  cleaned = cleaned.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, "");
  cleaned = cleaned.replace(/[#*_`]/g, "");

  cleaned = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
    .join("\n")
    .trim();

  return cleaned;
}

export function createSpeechChunks(text: string): string[] {
  if (!text) return [];

  const rawLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rawLines.length === 0) return [];

  const sentenceLines = rawLines.map((line) => {
    const endsWithPunctuation = /[.!?…।]$/.test(line);
    return endsWithPunctuation ? line : `${line}.`;
  });

  const merged: string[] = [];
  for (const line of sentenceLines) {
    if (line.length < MIN_CHUNK_LENGTH && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`;
    } else {
      merged.push(line);
    }
  }

  if (merged.length > 1 && merged[0].length < MIN_CHUNK_LENGTH) {
    merged[1] = `${merged[0]} ${merged[1]}`;
    merged.shift();
  }

  return merged;
}

export function createHindiSpeechChunks(text: string): string[] {
  const cleaned = cleanAiOutputForSpeech(text);
  if (!cleaned) return [];

  const rawPieces = cleaned
    .split(/(?<=[।॥.!?\n])/)
    .map((piece) => piece.replace(/\n/g, " ").trim())
    .filter((piece) => piece.length > 0);

  if (rawPieces.length === 0) return [];

  const meaningfulPieces = rawPieces.filter((piece) => /[\p{L}\p{N}]/u.test(piece));
  if (meaningfulPieces.length === 0) return [];

  const grouped: string[] = [];
  let current = "";

  for (const piece of meaningfulPieces) {
    const candidate = current.length > 0 ? `${current} ${piece}` : piece;

    if (current.length === 0) {
      current = piece;
      continue;
    }

    if (candidate.length <= HINDI_TARGET_MAX) {
      current = candidate;
      if (current.length >= HINDI_TARGET_MIN) {
        grouped.push(current);
        current = "";
      }
    } else {
      grouped.push(current);
      current = piece;
    }
  }

  if (current.length > 0) {
    grouped.push(current);
  }

  const final: string[] = [];
  for (const chunk of grouped) {
    const meaningfulLength = (chunk.match(/[\p{L}\p{N}]/gu) || []).length;

    if (meaningfulLength < HINDI_MIN_CHUNK_CHARS && final.length > 0) {
      final[final.length - 1] = `${final[final.length - 1]} ${chunk}`;
    } else {
      final.push(chunk);
    }
  }

  return final.filter((c) => c.trim().length > 0);
}

export default function PremiumReaderV2({ profile }: PremiumReaderV2Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageDims, setPageDims] = useState<Map<number, RealPageDims>>(new Map());
  const [currentPageNumbers, setCurrentPageNumbers] = useState<number[]>([1]);
  const [currentLabel, setCurrentLabel] = useState<string>("1");

  const [resolvedPages, setResolvedPages] = useState<ResolvedPageEntry[]>([]);
  const [currentPageTextSource, setCurrentPageTextSource] = useState<PageTextSource>("none");
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [zoom, setZoom] = useState(100);

  const [speechState, setSpeechState] = useState<SpeechState>("idle");

  const speechQueueRef = useRef<string[]>([]);
  const currentSpeechIndexRef = useRef(0);
  const speechLocaleRef = useRef("en-IN");
  const speechStateRef = useRef<SpeechState>("idle");

  useEffect(() => {
    speechStateRef.current = speechState;
  }, [speechState]);

  // ── AI Companion: single persistent language selection ──────────────
  // selectedAiLanguage drives EVERY action — Explain, Summarize,
  // Translate, Quiz me, and the free-text Ask AI input all answer in
  // this language. It is independent of aiOutputLanguage (the
  // language the MOST RECENT output actually came back in) — they
  // are set together whenever a new action completes, but
  // selectedAiLanguage itself persists across actions/pages until the
  // user changes it.
  const [selectedAiLanguage, setSelectedAiLanguage] = useState<ResponseLanguage>("English");

  const [aiOutput, setAiOutput] = useState<string>("");
  const [aiOutputKind, setAiOutputKind] = useState<AiActionKind | null>(null);
  const [aiOutputLanguage, setAiOutputLanguage] = useState<ResponseLanguage | null>(null);

  const [voiceUnavailableNotice, setVoiceUnavailableNotice] = useState<string>("");

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [askInputValue, setAskInputValue] = useState("");

  const aiRequestIdRef = useRef(0);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const flipRef = useRef<BookSpreadHandle>(null);

  function clearAiResult() {
    setAiOutput("");
    setAiOutputKind(null);
    setAiOutputLanguage(null);
    setVoiceUnavailableNotice("");
  }

  function setAiResult(text: string, kind: AiActionKind, language: ResponseLanguage) {
    setAiOutput(text);
    setAiOutputKind(kind);
    setAiOutputLanguage(language);
    setVoiceUnavailableNotice("");
  }

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    function loadVoices() {
      voicesRef.current = window.speechSynthesis.getVoices();
    }

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.speechSynthesis.speaking || window.speechSynthesis.paused) {
      window.speechSynthesis.cancel();
    }
    speechQueueRef.current = [];
    currentSpeechIndexRef.current = 0;
    setSpeechState("idle");

    aiRequestIdRef.current += 1;
    setIsAiLoading(false);
    clearAiResult();
  }, [currentPageNumbers]);

  useEffect(() => {
    if (!pdf || currentPageNumbers.length === 0) {
      setResolvedPages([]);
      setCurrentPageTextSource("none");
      return;
    }

    let cancelled = false;
    setIsOcrRunning(false);

    async function resolveCurrentPageText() {
      try {
        const results = await Promise.all(
          currentPageNumbers.map(async (pageNumber) => {
            const result = await resolvePageText(pdf!, profile.pdfPath, pageNumber, () => {
              if (!cancelled) setIsOcrRunning(true);
            });
            return { pageNumber, text: result.text, source: result.source };
          })
        );

        if (cancelled) return;

        setIsOcrRunning(false);
        setResolvedPages(results);

        const anySelectable = results.some((r) => r.source === "selectable");
        const anyOcr = results.some((r) => r.source === "ocr");
        const anyText = results.some((r) => r.text.length > 0);

        setCurrentPageTextSource(
          !anyText ? "none" : anySelectable ? "selectable" : anyOcr ? "ocr" : "none"
        );
      } catch (err) {
        console.error("[PremiumReaderV2] Could not resolve page text:", err);
        if (!cancelled) {
          setResolvedPages([]);
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

  function pickVoiceForLocale(locale: string): SpeechSynthesisVoice | null {
    const voices = voicesRef.current;
    if (!voices || voices.length === 0) return null;

    const exact = voices.find((v) => v.lang === locale);
    if (exact) return exact;

    const languagePrefix = locale.split("-")[0];
    const prefixMatch = voices.find((v) => v.lang.startsWith(languagePrefix));
    return prefixMatch ?? null;
  }

  function hasSupportedVoice(languageCode: string): boolean {
    if (typeof window === "undefined" || !window.speechSynthesis) return false;
    const voices = voicesRef.current.length > 0
      ? voicesRef.current
      : window.speechSynthesis.getVoices();

    if (voices.length === 0) return false;

    const prefix = languageCode.split("-")[0];
    return voices.some((v) => v.lang === languageCode || v.lang.startsWith(prefix));
  }

  // ── Read Aloud source priority ───────────────────────────────────────
  // Per requirement #12: AI output (any kind, including translate) is
  // always the active source when present — never fall back to page
  // text while AI output is active. Only when there is NO AI output
  // does Read Aloud fall back to the original visible page text.
  function getReadAloudPayload(): ReadAloudPayload {
    if (aiOutputKind && aiOutput.trim().length > 0 && aiOutputLanguage) {
      return {
        text: aiOutput,
        language: getSpeechLanguage(aiOutputLanguage),
        source: "ai-output",
      };
    }

    const pageTexts = resolvedPages
      .map((p) => p.text)
      .filter((t) => t.trim().length > 0);

    return {
      text: pageTexts.join(" "),
      language: getSpeechLanguage("English"),
      source: "page-text",
    };
  }

  function speakCurrentChunk() {
    if (speechStateRef.current !== "playing") return;

    const queue = speechQueueRef.current;
    const index = currentSpeechIndexRef.current;

    if (index >= queue.length) {
      setSpeechState("idle");
      return;
    }

    const chunkText = queue[index];
    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.lang = speechLocaleRef.current;

    const voice = pickVoiceForLocale(speechLocaleRef.current);
    if (voice) utterance.voice = voice;

    const isHindi = speechLocaleRef.current.startsWith("hi");
    utterance.rate = isHindi ? 0.85 : 0.95;
    utterance.pitch = 1;

    utterance.onend = () => {
      if (speechStateRef.current !== "playing") return;
      if (currentSpeechIndexRef.current !== index) return;

      currentSpeechIndexRef.current += 1;
      speakCurrentChunk();
    };

    utterance.onerror = () => {
      if (speechStateRef.current !== "playing") return;
      if (currentSpeechIndexRef.current !== index) return;

      currentSpeechIndexRef.current += 1;
      speakCurrentChunk();
    };

    window.speechSynthesis.speak(utterance);
  }

  function startSpeechQueue(chunks: string[], locale: string) {
    speechQueueRef.current = chunks;
    currentSpeechIndexRef.current = 0;
    speechLocaleRef.current = locale;
    speechStateRef.current = "playing";
    setSpeechState("playing");
    speakCurrentChunk();
  }

  function handleReadAloudToggle() {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;

    if (speechState === "playing") {
      synth.pause();
      setSpeechState("paused");
      return;
    }

    if (speechState === "paused") {
      synth.resume();
      setSpeechState("playing");
      return;
    }

    synth.cancel();
    setVoiceUnavailableNotice("");

    const payload = getReadAloudPayload();

    // Voice-support gate: applies whenever the active source is AI
    // output (translate OR explain/summarize/quiz, in ANY selected
    // language) and that language is not always-allowed.
    if (payload.source === "ai-output" && aiOutputLanguage) {
      const isAlwaysAllowed = ALWAYS_ALLOWED_LANGUAGES.includes(aiOutputLanguage);

      if (!isAlwaysAllowed) {
        const voiceOk = hasSupportedVoice(payload.language);
        if (!voiceOk) {
          setVoiceUnavailableNotice(
            `Voice playback for ${aiOutputLanguage} is not available on this device/browser. Translation text is available to read.`
          );
          setSpeechState("idle");
          return;
        }
      }
    }

    if (payload.text.trim().length < 20) {
      setVoiceUnavailableNotice("No readable text is available.");
      setSpeechState("idle");
      return;
    }

    if (payload.source === "ai-output") {
      const isHindiTarget = aiOutputLanguage === "Hindi";

      const chunks = isHindiTarget
        ? createHindiSpeechChunks(payload.text)
        : (() => {
            const cleaned = cleanAiOutputForSpeech(payload.text);
            const sanitized = sanitizeForSpeech(cleaned);
            return createSpeechChunks(sanitized);
          })();

      if (chunks.length === 0) {
        setVoiceUnavailableNotice("No readable text is available.");
        setSpeechState("idle");
        return;
      }

      startSpeechQueue(chunks, payload.language);
      return;
    }

    // source === "page-text": original page-by-page reading, English.
    const pagesToSpeak =
      resolvedPages.length > 0
        ? resolvedPages
        : currentPageNumbers.map((pageNumber) => ({
            pageNumber,
            text: "",
            source: "none" as PageTextSource,
          }));

    const pageChunks: string[] = pagesToSpeak.map((page, index) => {
      const rawBody =
        page.text.trim().length > 0
          ? page.text
          : "This page does not contain any readable text.";

      const sanitizedBody = sanitizeForSpeech(rawBody);
      const prefix = index === 0 ? `Page ${currentLabel}. ` : "";
      return `${prefix}${sanitizedBody}`.slice(0, 4000);
    });

    startSpeechQueue(pageChunks, payload.language);
  }

  function handleStopReadAloud() {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    speechQueueRef.current = [];
    currentSpeechIndexRef.current = 0;
    speechStateRef.current = "idle";
    setSpeechState("idle");
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

  // ── AI Companion action handler ──────────────────────────────────────
  // Every kind — explain/summarize/translate/quiz/ask — now passes
  // selectedAiLanguage through to runAiAction(). Translate is no
  // longer a special case with its own language picker; it always
  // targets whatever language is currently selected, per requirement #4.
  async function handleAiAction(kind: AiActionKind, customQuestion?: string) {
    if (!isReady) return;

    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
      speechQueueRef.current = [];
      currentSpeechIndexRef.current = 0;
      speechStateRef.current = "idle";
      setSpeechState("idle");
    }

    const requestId = ++aiRequestIdRef.current;
    setIsAiLoading(true);
    clearAiResult();

    const pagesForPrompt =
      resolvedPages.length > 0
        ? resolvedPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }))
        : currentPageNumbers.map((pageNumber) => ({ pageNumber, text: "" }));

    try {
      const result = await runAiAction({
        kind,
        bookTitle: profile.title,
        pageLabel: currentLabel,
        pages: pagesForPrompt,
        language: selectedAiLanguage,
        customQuestion,
      });

      if (aiRequestIdRef.current !== requestId) return;

      setAiResult(result.answer, kind, selectedAiLanguage);
    } catch (err) {
      console.error(`[PremiumReaderV2] AI action "${kind}" failed:`, err);
      if (aiRequestIdRef.current === requestId) {
        setAiResult(
          "Something went wrong while contacting the AI. Please try again.",
          kind,
          selectedAiLanguage
        );
      }
    } finally {
      if (aiRequestIdRef.current === requestId) {
        setIsAiLoading(false);
      }
    }
  }

  function handleAskSubmit() {
    const trimmed = askInputValue.trim();
    if (!trimmed) return;
    handleAiAction("ask", trimmed);
    setAskInputValue("");
  }

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const isAtStart = currentPageNumbers[0] <= 1;
  const isAtEnd =
    currentPageNumbers[currentPageNumbers.length - 1] >= profile.totalPages;

  const currentViewLabel =
    currentPageNumbers.length === 2 ? "Two-Page Spread" : "Single Page";

  const AI_ACTIONS: { kind: AiActionKind; label: string }[] = [
    { kind: "explain", label: "Explain" },
    { kind: "summarize", label: "Summarize" },
    { kind: "translate", label: "Translate" },
    { kind: "quiz", label: "Quiz me" },
  ];

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
              onReadAloud={handleReadAloudToggle}
              onStopReadAloud={handleStopReadAloud}
              onToggleTheme={toggleTheme}
              onFullscreen={enterFullscreen}
              speechState={isOcrRunning ? "loading" : speechState}
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

        {/* ── Persistent Response Language selector ───────────────────── */}
        <div style={{ marginTop: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 700,
              color: "#9a8c6b",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Response Language
          </label>
          <select
            value={selectedAiLanguage}
            onChange={(e) => setSelectedAiLanguage(e.target.value as ResponseLanguage)}
            disabled={isAiLoading}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e3dcc9",
              background: "#fff",
              fontSize: 13,
              color: "#2c2416",
              cursor: isAiLoading ? "default" : "pointer",
            }}
          >
            {RESPONSE_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

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
            marginTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {AI_ACTIONS.map(({ kind, label }) => {
            const isActive = aiOutputKind === kind && isAiLoading;
            return (
              <button
                key={kind}
                onClick={() => handleAiAction(kind)}
                disabled={isAiLoading || !isReady}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: isActive ? "1px solid #9a6b2f" : "1px solid #e3dcc9",
                  background: isActive ? "#fff8ec" : "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#2c2416",
                  cursor: isAiLoading || !isReady ? "default" : "pointer",
                  opacity: isAiLoading && !isActive ? 0.5 : 1,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {isAiLoading && (
          <p
            style={{
              fontSize: 12,
              color: "#9a6b2f",
              fontWeight: 600,
              marginTop: 14,
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
                animation: "ndl-ai-spin 0.8s linear infinite",
                display: "inline-block",
              }}
            />
            AI is analysing this page…
            <style>{`@keyframes ndl-ai-spin { to { transform: rotate(360deg); } }`}</style>
          </p>
        )}

        {!isAiLoading && voiceUnavailableNotice.length > 0 && (
          <p
            style={{
              fontSize: 12,
              color: "#9a6b2f",
              fontWeight: 600,
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e3dcc9",
              background: "#fff8ec",
            }}
          >
            {voiceUnavailableNotice}
          </p>
        )}

        {!isAiLoading && aiOutput.length > 0 && (
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #e3dcc9",
              background: "#fffaf0",
              fontSize: 13,
              color: "#2c2416",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {aiOutputLanguage && (
              <p
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "#9a6b2f",
                  marginBottom: 6,
                  fontWeight: 700,
                }}
              >
                {aiOutputKind === "translate" ? "Translated to" : "Response in"}{" "}
                {aiOutputLanguage}
              </p>
            )}
            {aiOutput}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <input
            type="text"
            value={askInputValue}
            onChange={(e) => setAskInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAskSubmit();
            }}
            placeholder={`Ask AI about this book in ${selectedAiLanguage}...`}
            disabled={isAiLoading}
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

"use client";

import ReaderToolbar from "./ReaderToolbar";
import type { SpeechState } from "./ReaderToolbar";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { BookProfile } from "@/lib/premium-reader/bookProfile";
import { getDisplayLabel } from "@/lib/premium-reader/bookProfile";
import FullscreenReaderView from "./FullscreenReaderView";
import {
  getRealPageDims,
  type RealPageDims,
} from "@/lib/premium-reader/pdfLayoutAnalyzer";
import {
  resolvePageText,
  sanitizeForSpeech,
  cleanOcrTextForAi,
  type PageTextSource,
} from "@/lib/premium-reader/pageTextExtractor";
import {
  runAiAction,
  runSelectionAiAction,
  parseFlashcardResult,
  getSpeechLanguage,
  RESPONSE_LANGUAGES,
  type AiActionKind,
  type SelectionActionKind,
  type ResponseLanguage,
} from "@/lib/premium-reader/aiActions";
import { saveNote } from "@/lib/premium-reader/notesStore";
import BookSpread, { type BookSpreadHandle, type SelectionMode } from "./BookSpread";
import type { SelectionLayerResult } from "./SelectionLayer";

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

  // ── In-app "immersive mode" / fullscreen layout ──────────────────
  // isImmersiveMode drives all the layout styles below (grid columns,
  // panel visibility, main/book sizing). isFullscreen tracks the
  // BROWSER'S actual native fullscreen state and is kept in lockstep
  // with isImmersiveMode by both enterFullscreen() and the
  // fullscreenchange listener below — so the two never drift apart,
  // and ESC (which only the browser can intercept) reliably restores
  // the layout via the listener, not via a manual keydown handler.
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Bumped every time isFullscreen changes (enter AND exit). This is
  // passed to BookSpread as a plain prop — NOT a key — so it never
  // remounts BookSpread/FlipEngine (which would reset the current
  // page). Instead BookSpread uses it purely as an effect dependency
  // to force a fresh container re-measurement after the grid layout
  // has actually changed size, since the layout change here happens
  // a tick after isFullscreen flips and a passive ResizeObserver can
  // occasionally miss/lag behind that specific transition.
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    setLayoutVersion((v) => v + 1);
  }, [isFullscreen]);

  // Ref to the outer reader workspace container — the element actually
  // passed to requestFullscreen(). Fullscreening THIS element (not
  // document.documentElement) means only the reader workspace goes
  // fullscreen, not the whole browser tab/page.
  const readerContainerRef = useRef<HTMLDivElement | null>(null);

  const [speechState, setSpeechState] = useState<SpeechState>("idle");

  const speechQueueRef = useRef<string[]>([]);
  const currentSpeechIndexRef = useRef(0);
  const speechLocaleRef = useRef("en-IN");
  const speechStateRef = useRef<SpeechState>("idle");

  useEffect(() => {
    speechStateRef.current = speechState;
  }, [speechState]);

  const [selectedAiLanguage, setSelectedAiLanguage] = useState<ResponseLanguage>("English");

  const [aiOutput, setAiOutput] = useState<string>("");
  const [aiOutputKind, setAiOutputKind] = useState<AiActionKind | null>(null);
  const [aiOutputLanguage, setAiOutputLanguage] = useState<ResponseLanguage | null>(null);

  const [voiceUnavailableNotice, setVoiceUnavailableNotice] = useState<string>("");

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [askInputValue, setAskInputValue] = useState("");

  const [selectionMenu, setSelectionMenu] = useState<{
    text: string;
    rect: DOMRect;
    pageNumber: number;
  } | null>(null);
  const [selectedFlashcard, setSelectedFlashcard] = useState<{ front: string; back: string } | null>(null);

  const [selectionSourcePage, setSelectionSourcePage] = useState<number | null>(null);

  const [selectionMode, setSelectionMode] = useState<SelectionMode>("page-turn");
  const selectionMenuRef = useRef<HTMLDivElement | null>(null);

  const aiRequestIdRef = useRef(0);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const flipRef = useRef<BookSpreadHandle>(null);
  const bookWrapperRef = useRef<HTMLDivElement | null>(null);

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

  // Authoritative sync point: whenever the browser's actual fullscreen
  // state changes — via the ⛶ button, ESC, or any other means — this
  // fires and updates both isFullscreen and isImmersiveMode together.
  // This is what makes ESC correctly restore the normal layout.
  useEffect(() => {
    function handleFullscreenChange() {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      setIsImmersiveMode(active);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
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
    setSelectionMenu(null);
    setSelectionSourcePage(null);
    setSelectedFlashcard(null);
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

  // Fullscreen-specific navigation: FullscreenReaderView has no
  // FlipEngine handle to call flipNext()/flipPrev() on, so these
  // directly advance currentPageNumbers/currentLabel by the same
  // number of pages currently visible (1 or 2), clamped to
  // [1, totalPages]. This is a deliberately SIMPLIFIED approximation
  // of FlipEngine's own pairing logic (front-matter/landscape-page
  // detection in handleFlip) — appropriate for this minimal fullscreen
  // view, not a full reimplementation of that logic.
  const fullscreenGoNext = useCallback(() => {
    setCurrentPageNumbers((prev) => {
      const step = prev.length || 1;
      const lastVisible = prev[prev.length - 1] ?? 1;
      const nextStart = Math.min(lastVisible + 1, profile.totalPages);
      const nextNumbers =
        step === 2 && nextStart < profile.totalPages
          ? [nextStart, nextStart + 1]
          : [nextStart];

      const label =
        nextNumbers.length === 2
          ? `${getDisplayLabel(profile, nextNumbers[0])}–${getDisplayLabel(profile, nextNumbers[1])}`
          : getDisplayLabel(profile, nextNumbers[0]);
      setCurrentLabel(label);

      return nextNumbers;
    });
  }, [profile]);

  const fullscreenGoPrev = useCallback(() => {
    setCurrentPageNumbers((prev) => {
      const step = prev.length || 1;
      const firstVisible = prev[0] ?? 1;
      const prevStart = Math.max(firstVisible - step, 1);
      const prevNumbers =
        step === 2 && prevStart + 1 < firstVisible
          ? [prevStart, Math.min(prevStart + 1, profile.totalPages)]
          : [prevStart];

      const label =
        prevNumbers.length === 2
          ? `${getDisplayLabel(profile, prevNumbers[0])}–${getDisplayLabel(profile, prevNumbers[1])}`
          : getDisplayLabel(profile, prevNumbers[0]);
      setCurrentLabel(label);

      return prevNumbers;
    });
  }, [profile]);

  function zoomIn() {
    setZoom((current) => Math.min(current + 10, 160));
  }

  function zoomOut() {
    setZoom((current) => Math.max(current - 10, 60));
  }

  function fitToScreen() {
    setZoom(100);
    // Fit also exits immersive mode/fullscreen, restoring the
    // standard layout exactly as it was originally — the "clean
    // reset" button. If real browser fullscreen is engaged, exit it
    // for real too, so this can't leave isFullscreen/isImmersiveMode
    // out of sync with the actual browser state.
    setIsImmersiveMode(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) => {
        console.error("[PremiumReaderV2] exitFullscreen() failed (from Fit):", err);
      });
    } else {
      setIsFullscreen(false);
    }
  }

  useEffect(() => {
    setSelectionMenu(null);
    setSelectionSourcePage(null);
    if (typeof window !== "undefined") {
      window.getSelection()?.removeAllRanges();
    }
  }, [zoom]);

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

  function getReadAloudPayload(): ReadAloudPayload {
    if (aiOutputKind && aiOutput.trim().length > 0 && aiOutputLanguage) {
      return {
        text: aiOutput,
        language: getSpeechLanguage(aiOutputLanguage),
        source: "ai-output",
      };
    }

    if (selectionMenu && selectionMenu.text.trim().length > 0) {
      // Only run the stronger OCR-noise cleanup if the page this
      // selection came from was actually OCR'd — selectable PDF text
      // is left exactly as the user highlighted it.
      const selectionPageNumber = selectionSourcePage ?? selectionMenu.pageNumber;
      const selectionPage = resolvedPages.find((p) => p.pageNumber === selectionPageNumber);
      const rawSelectionText = selectionMenu.text;
      const selectionText =
        selectionPage?.source === "ocr"
          ? cleanOcrTextForAi(rawSelectionText)
          : rawSelectionText;

      return {
        text: selectionText,
        language: getSpeechLanguage("English"),
        source: "page-text",
      };
    }

    const targetPageNumber = currentPageNumbers[0];
    const targetPage = resolvedPages.find((p) => p.pageNumber === targetPageNumber);
    const rawText = targetPage?.text?.trim() ?? "";
    // Same OCR-only gating for whole-page Read Aloud.
    const text = targetPage?.source === "ocr" ? cleanOcrTextForAi(rawText) : rawText;

    return {
      text,
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

  function waitForVoice(locale: string): Promise<void> {
    return new Promise((resolve) => {
      const prefix = locale.split("-")[0];
      const hasMatch = () =>
        voicesRef.current.some((v) => v.lang === locale || v.lang.startsWith(prefix));

      if (hasMatch() || typeof window === "undefined" || !window.speechSynthesis) {
        resolve();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        clearTimeout(timeoutId);
        resolve();
      };

      function onVoicesChanged() {
        voicesRef.current = window.speechSynthesis.getVoices();
        if (hasMatch()) finish();
      }

      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
      const timeoutId = setTimeout(finish, 1500);
    });
  }

  function startSpeechQueue(chunks: string[], locale: string) {
    speechQueueRef.current = chunks;
    currentSpeechIndexRef.current = 0;
    speechLocaleRef.current = locale;
    speechStateRef.current = "playing";
    setSpeechState("playing");

    waitForVoice(locale).then(() => {
      if (speechStateRef.current !== "playing") return;
      speakCurrentChunk();
    });
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

    const targetPageNumber =
      selectionMenu && selectionMenu.text.trim().length > 0
        ? (selectionSourcePage ?? currentPageNumbers[0])
        : currentPageNumbers[0];

    const rawBody =
      payload.text.trim().length > 0
        ? payload.text
        : "This page does not contain any readable text.";

    const sanitizedBody = sanitizeForSpeech(rawBody);
    const chunks = createSpeechChunks(sanitizedBody);

    const pageChunks: string[] =
      chunks.length > 0
        ? chunks.map((chunk, index) =>
            (index === 0 ? `Page ${targetPageNumber}. ${chunk}` : chunk).slice(0, 4000)
          )
        : [`Page ${targetPageNumber}. ${sanitizedBody}`.slice(0, 4000)];

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

  // Requests/exits REAL browser fullscreen on the reader workspace
  // container (readerContainerRef) — not document.documentElement, so
  // only this component's own workspace goes fullscreen, not the
  // whole tab. Sets isFullscreen/isImmersiveMode optimistically on
  // success; the fullscreenchange listener above remains the
  // authoritative sync point for whatever the browser's real state
  // ends up being (including ESC).
  async function enterFullscreen() {
    const el = readerContainerRef.current;
    if (!el) return;

    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
        setIsImmersiveMode(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
        setIsImmersiveMode(false);
      }
    } catch (err) {
      console.error("Fullscreen failed", err);
    }
  }

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

  const handleSelectionChange = useCallback(
    (info: SelectionLayerResult | null) => {
      setSelectionMenu(info);
      if (info) {
        setSelectionSourcePage(info.pageNumber);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectionMenu) return;

    function handleDocumentClick(e: MouseEvent) {
      if (selectionMenuRef.current && !selectionMenuRef.current.contains(e.target as Node)) {
        setSelectionMenu(null);
        setSelectionSourcePage(null);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [selectionMenu]);

  useEffect(() => {
    if (selectionMode === "page-turn") {
      setSelectionMenu(null);
      setSelectionSourcePage(null);
    }
  }, [selectionMode]);

  async function handleSelectionAction(kind: SelectionActionKind) {
    if (!selectionMenu) return;
    const text = selectionMenu.text;
    const pageNumber = selectionSourcePage ?? selectionMenu.pageNumber;
    setSelectionMenu(null);

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
    setSelectedFlashcard(null);

    try {
      const result = await runSelectionAiAction({
        kind,
        bookTitle: profile.title,
        pageLabel: String(pageNumber),
        selectedText: text,
        language: selectedAiLanguage,
      });

      if (aiRequestIdRef.current !== requestId) return;

      if (kind === "flashcards") {
        const card = parseFlashcardResult(result.answer);
        setSelectedFlashcard(card);
        setAiResult(`Front: ${card.front}\n\nBack: ${card.back}`, "quiz", selectedAiLanguage);
      } else {
        const mappedKind: AiActionKind =
          kind === "explain" ? "explain" : kind === "summarize" ? "summarize" : "translate";
        setAiResult(result.answer, mappedKind, selectedAiLanguage);
      }
    } catch (err) {
      console.error(`[PremiumReaderV2] Selection AI action "${kind}" failed:`, err);
      if (aiRequestIdRef.current === requestId) {
        setAiResult("Something went wrong while contacting the AI. Please try again.", "explain", selectedAiLanguage);
      }
    } finally {
      if (aiRequestIdRef.current === requestId) {
        setIsAiLoading(false);
      }
    }
  }

  function handleSelectionAskPrompt() {
    if (!selectionMenu) return;
    const text = selectionMenu.text;
    setSelectionMenu(null);
    setAskInputValue(`Regarding "${text.slice(0, 120)}": `);
  }

  function handleSaveSelectionAsNote() {
    if (!selectionMenu) return;
    const text = selectionMenu.text;
    const pageNumber = selectionSourcePage ?? selectionMenu.pageNumber;
    setSelectionMenu(null);

    saveNote({
      bookTitle: profile.title,
      pageLabel: String(pageNumber),
      text,
    });

    setAiOutput(`Saved to notes:\n\n"${text}"`);
    setAiOutputKind(null);
    setAiOutputLanguage(null);
    setVoiceUnavailableNotice("");
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

  // Left panel collapses when zoomed in, in Text Selection Mode, OR in
  // Immersive Mode/Fullscreen.
  const isLeftPanelCollapsed = zoom > 100 || selectionMode === "text-selection" || isImmersiveMode;

  // Right (AI Companion) panel NEVER collapses, including in
  // Fullscreen — it must stay visible per spec. Fullscreen instead
  // drops the left column out of the grid template entirely (2
  // columns: "1fr 320px") rather than collapsing it to 0px within a
  // 3-column template, which is what was causing the book area to not
  // actually claim that freed space cleanly.

  return (
    <div
      ref={readerContainerRef}
      style={{
        display: "grid",
        gridTemplateColumns: isImmersiveMode
          ? "minmax(0, 1fr) 320px"
          : `${isLeftPanelCollapsed ? "0px" : "280px"} 1fr 320px`,
        height: "100vh",
        width: isFullscreen ? "100vw" : undefined,
        maxHeight: "100vh",
        overflow: "hidden",
        background: isFullscreen ? "#f5efe5" : "#f4efe6",
        transition: "grid-template-columns 200ms ease",
      }}
    >
      {!isImmersiveMode && (
        <aside
          style={{
            borderRight: isLeftPanelCollapsed ? "none" : "1px solid #e3dcc9",
            background: "#fbf9f4",
            padding: isLeftPanelCollapsed ? 0 : 24,
            overflowY: "auto",
            overflowX: "hidden",
            width: isLeftPanelCollapsed ? 0 : "auto",
            opacity: isLeftPanelCollapsed ? 0 : 1,
            transition: "opacity 150ms ease",
            pointerEvents: isLeftPanelCollapsed ? "none" : "auto",
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
      )}

      <main
        style={
          isImmersiveMode
            ? {
                height: "100vh",
                width: "100%",
                overflow: "hidden",
                display: "grid",
                gridTemplateRows: "auto auto minmax(0, 1fr) auto",
                alignItems: "center",
                justifyItems: "center",
                padding: "16px 24px",
                position: "relative",
                minWidth: 0,
              }
            : {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                position: "relative",
                minWidth: 0,
                overflow: zoom > 100 ? "auto" : "visible",
              }
        }
      >
        {loadError && (
          <div style={{ textAlign: "center", color: "#8a6b3f" }}>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>Could not load this book</p>
            <p style={{ fontSize: 13, color: "#a89878" }}>{loadError}</p>
          </div>
        )}

        {!loadError && (
          <>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
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
              {isImmersiveMode && (
                <p
                  style={{
                    fontSize: 11,
                    color: "#9a6b2f",
                    fontWeight: 700,
                    marginTop: -6,
                    marginBottom: 10,
                  }}
                >
                  Immersive mode on — press ⛶ again or Esc to restore the side panel.
                </p>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 12,
                background: "#fff",
                border: "1px solid #e3dcc9",
                borderRadius: 999,
                padding: 4,
                width: "fit-content",
              }}
            >
              {(
                [
                  { mode: "page-turn" as SelectionMode, label: "Page Turn Mode" },
                  { mode: "text-selection" as SelectionMode, label: "Text Selection Mode" },
                ]
              ).map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => setSelectionMode(mode)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: "none",
                    background: selectionMode === mode ? "#9a6b2f" : "transparent",
                    color: selectionMode === mode ? "#fff" : "#6b5d42",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div
              ref={bookWrapperRef}
              style={
                isImmersiveMode
                  ? {
                      width: "100%",
                      height: "min(720px, calc(100vh - 170px))",
                      maxWidth: "100%",
                      minHeight: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      position: "relative",
                    }
                  : {
                      flex: 1,
                      width: "100%",
                      minHeight: 0,
                      overflow: "hidden",
                      position: "relative",
                    }
              }
            >
              {/* FullscreenReaderView — visible ONLY in fullscreen.
                  Renders the current page(s) directly via
                  PdfPageCanvas, fit-contain, no FlipEngine, no
                  page-turn animation, no transform:scale. */}
              {isFullscreen && (
                <div style={{ width: "100%", height: "100%" }}>
                  <FullscreenReaderView
                    pdf={pdf}
                    profile={profile}
                    pageDims={pageDims}
                    currentPageNumbers={currentPageNumbers}
                    currentLabel={currentLabel}
                    zoom={zoom}
                    onPrev={fullscreenGoPrev}
                    onNext={fullscreenGoNext}
                  />
                </div>
              )}

              {/* BookSpread/FlipEngine stay PERMANENTLY MOUNTED, even
                  in fullscreen — hidden via visibility:hidden +
                  position:absolute, never display:none. Unmounting
                  FlipEngine (e.g. via display:none collapsing this box
                  to 0×0, which trips FlipEngine's own
                  leafBox.width<=0 -> return null early-exit) would
                  destroy react-pageflip's internal widget; remounting
                  it on exit resets to page 1 via FlipEngine's own
                  hardcoded turnToPage(0)-on-mount effect and
                  react-pageflip's own startPage={0} default — both of
                  which this batch is explicitly not allowed to touch.
                  Keeping it mounted-but-invisible-and-non-interactive
                  is what actually preserves the page across fullscreen
                  toggles without touching FlipEngine.tsx at all. */}
              <div
                style={
                  isFullscreen
                    ? {
                        position: "absolute",
                        inset: 0,
                        visibility: "hidden",
                        pointerEvents: "none",
                      }
                    : { width: "100%", height: "100%" }
                }
              >
                <BookSpread
                  ref={flipRef}
                  layoutVersion={layoutVersion}
                  pdf={pdf}
                  profile={profile}
                  pageDims={pageDims}
                  zoom={zoom}
                  onPageChange={handlePageChange}
                  currentPageNumbers={currentPageNumbers}
                  resolvedPages={resolvedPages}
                  onSelectionChange={handleSelectionChange}
                  selectionMode={selectionMode}
                />
              </div>
            </div>
            {selectionMenu && (
              <div
                ref={selectionMenuRef}
                style={{
                  position: "fixed",
                  top:
                    selectionMenu.rect.bottom + 220 < window.innerHeight
                      ? selectionMenu.rect.bottom + 24
                      : Math.max(72, selectionMenu.rect.top - 24 - 200),
                  left: Math.min(
                    Math.max(8, selectionMenu.rect.left),
                    window.innerWidth - 216
                  ),
                  background: "#2c2416",
                  borderRadius: 10,
                  boxShadow: "0 10px 24px rgba(44,36,22,0.35)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  zIndex: 50,
                  minWidth: 200,
                  maxWidth: 220,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    padding: "8px 14px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#c9b896",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  Selected from Page {selectionSourcePage ?? selectionMenu.pageNumber}
                </p>
                {[
                  { label: "Explain Selection", action: () => handleSelectionAction("explain") },
                  { label: "Summarize Selection", action: () => handleSelectionAction("summarize") },
                  { label: "Translate Selection", action: () => handleSelectionAction("translate") },
                  { label: "Ask AI", action: () => handleSelectionAskPrompt() },
                  { label: "Create Flashcards", action: () => handleSelectionAction("flashcards") },
                  { label: "Save as Note", action: () => handleSaveSelectionAsNote() },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    style={{
                      padding: "8px 14px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      color: "#f4efe6",
                      fontSize: 12,
                      fontWeight: 600,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}

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
                onClick={isFullscreen ? fullscreenGoPrev : goPrevious}
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
                onClick={isFullscreen ? fullscreenGoNext : goNext}
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
          width: 320,
          height: "100vh",
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

      {/* Custom selection highlight — keeps highlighted text clearly
          visible (gold/amber) regardless of the default browser
          highlight color, which can be subtle against the cream
          background used throughout this reader. */}
      <style>{`
        .ndl-book-stage ::selection {
          background: rgba(154, 107, 47, 0.45);
          color: inherit;
        }
      `}</style>
    </div>
  );
}

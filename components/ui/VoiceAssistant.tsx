"use client";

// ── Voice Assistant ──────────────────────────────────────────────────
// A single, reusable, self-contained voice-command widget rendered by
// AccessibilityToolbar (so it appears everywhere the toolbar does — see
// components/ui/AccessibilityToolbar.tsx). It never imports anything
// from a reader page's internals:
//   - Navigation commands call next/navigation's router directly (a
//     genuinely global capability, not reader-specific).
//   - Reader/AI commands are broadcast as a "ndl-voice-command"
//     CustomEvent on window — app/read/page.tsx and
//     PremiumReaderPreviewContent.tsx each listen for it and decide how
//     to fulfill it using their OWN existing functions (goNext, zoomIn,
//     handleReadAloud, runAI, etc). This file has zero knowledge of
//     either reader's internals.
//   - Accessibility commands call the same setToggle/stepFontScale
//     functions AccessibilityToolbar's own buttons use (passed down as
//     props), so voice and the toolbar panel always agree on state and
//     persist through the same ndl_a11y_settings storage.
//
// Existing Read Aloud features (this toolbar's own generic Read Aloud,
// the Revision page's AI Read Aloud, and the Premium Reader's Read
// Aloud) are never called directly from here — "read this page" /
// "pause reading" / etc. only reach the READER's own handleReadAloud
// via the custom event above, so nothing here duplicates or replaces
// that logic.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/useLanguage";
import { UI_TEXT, type Language } from "@/lib/i18n";
import { parseVoiceCommand, type VoiceCommand, type AccessibilityVoiceAction } from "@/lib/voiceCommands";
import { FONT_STEP, type A11ySettings, type BooleanA11yKey } from "@/lib/accessibilitySettings";
import { useAdaptivePanelPlacement } from "@/lib/panelPlacement";

interface VoiceAssistantProps {
  settings: A11ySettings;
  stepFontScale: (delta: number) => void;
  setToggle: (key: BooleanA11yKey, value: boolean) => void;
}

// Plain-English labels for the friendly "Done: …" feedback line. Voice
// command NAMES aren't run through UI_TEXT (only the widget's own chrome
// is) — see the file header in lib/voiceCommands.ts for why: English is
// the only supported recognition language today, so localizing the
// *spoken* command vocabulary ahead of that would be premature.
const READER_LABELS: Record<string, string> = {
  nextPage: "Next page", prevPage: "Previous page", goToPage: "Go to page",
  zoomIn: "Zoom in", zoomOut: "Zoom out", fitPage: "Fit page",
  fullscreen: "Fullscreen", exitFullscreen: "Exit fullscreen",
  read: "Read this page", pause: "Pause reading", resume: "Resume reading", stop: "Stop reading",
};
const AI_LABELS: Record<string, string> = {
  explain: "Explain this page", summarize: "Summarize this page", translate: "Translate",
  quiz: "Create quiz", flashcards: "Create flashcards", studyTab: "Open Study tab",
};
const A11Y_LABELS: Record<AccessibilityVoiceAction, string> = {
  fontIncrease: "Font size increased", fontDecrease: "Font size decreased",
  highContrastOn: "High contrast on", highContrastOff: "High contrast off",
  darkModeOn: "Dark mode on", darkModeOff: "Dark mode off",
  focusModeOn: "Focus mode on", focusModeOff: "Focus mode off",
  readingModeOn: "Reading mode on", readingModeOff: "Reading mode off",
};

export default function VoiceAssistant({ settings, stepFontScale, setToggle }: VoiceAssistantProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const t = UI_TEXT[(mounted ? language : "en") as Language];

  const [supported, setSupported] = useState(true);
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState("");
  const recognitionRef = useRef<any>(null);
  // Same adaptive-placement fix as AccessibilityToolbar's panel — see
  // lib/panelPlacement.ts.
  const { triggerRef, panelRef, placement } = useAdaptivePanelPlacement(open, 288);

  useEffect(() => {
    setMounted(true);
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(Boolean(Ctor));
  }, []);

  // Stop any in-flight recognition when this instance unmounts (page
  // navigation), same lifecycle discipline AccessibilityToolbar already
  // applies to speechSynthesis.
  useEffect(() => {
    return () => { try { recognitionRef.current?.stop?.(); } catch {} };
  }, []);

  function describeCommand(cmd: VoiceCommand): string {
    if (cmd.kind === "navigate") return `${t.voiceDone}: ${cmd.label}`;
    if (cmd.kind === "back") return `${t.voiceDone}: Back`;
    if (cmd.kind === "reader") return `${t.voiceDone}: ${READER_LABELS[cmd.action] || cmd.action}${cmd.page ? ` ${cmd.page}` : ""}`;
    if (cmd.kind === "ai") return `${t.voiceDone}: ${AI_LABELS[cmd.action] || cmd.action}${cmd.language ? ` → ${cmd.language}` : ""}`;
    return `${t.voiceDone}: ${A11Y_LABELS[cmd.action]}`;
  }

  function applyAccessibilityCommand(action: AccessibilityVoiceAction) {
    switch (action) {
      case "fontIncrease": stepFontScale(FONT_STEP); break;
      case "fontDecrease": stepFontScale(-FONT_STEP); break;
      case "highContrastOn": setToggle("highContrast", true); break;
      case "highContrastOff": setToggle("highContrast", false); break;
      case "darkModeOn": setToggle("darkMode", true); break;
      case "darkModeOff": setToggle("darkMode", false); break;
      case "focusModeOn": setToggle("focusMode", true); break;
      case "focusModeOff": setToggle("focusMode", false); break;
      case "readingModeOn": setToggle("readingMode", true); break;
      case "readingModeOff": setToggle("readingMode", false); break;
    }
  }

  function executeCommand(cmd: VoiceCommand) {
    if (cmd.kind === "navigate") router.push(cmd.path);
    else if (cmd.kind === "back") router.back();
    else if (cmd.kind === "reader" || cmd.kind === "ai")
      window.dispatchEvent(new CustomEvent("ndl-voice-command", { detail: cmd }));
    else if (cmd.kind === "accessibility") applyAccessibilityCommand(cmd.action);
    setFeedback(describeCommand(cmd));
  }

  function handleResult(rawTranscript: string) {
    setTranscript(rawTranscript);
    const cmd = parseVoiceCommand(rawTranscript, "en");
    if (cmd) executeCommand(cmd);
    else setFeedback(t.voiceNotRecognized);
  }

  function startListening() {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) { setSupported(false); setOpen(true); return; }
    try {
      const recognition = new Ctor();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (e: any) => {
        const text = e?.results?.[0]?.[0]?.transcript || "";
        handleResult(text);
      };
      recognition.onerror = (e: any) => {
        setListening(false);
        if (e?.error && e.error !== "aborted" && e.error !== "no-speech") setFeedback(t.voiceError);
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      setTranscript("");
      setFeedback("");
      setOpen(true);
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
      setFeedback(t.voiceError);
    }
  }

  function stopListening() {
    try { recognitionRef.current?.stop?.(); } catch {}
    setListening(false);
  }

  function closePanel() {
    stopListening();
    setTranscript("");
    setFeedback("");
    setOpen(false);
  }

  const darkPanel = settings.darkMode;

  // No independent fixed positioning here anymore — this renders as a
  // normal flex item inside the shared FloatingControlsDock (see
  // components/ui/AccessibilityToolbar.tsx), so the mic button and the
  // ♿ button move together as one draggable stack instead of being two
  // separately-positioned floating elements.
  return (
    <div className="flex flex-col items-end gap-3">
      {open && (
        <div
          ref={panelRef}
          data-a11y-no-invert
          style={{
            position: "fixed",
            top: placement?.top,
            left: placement?.left,
            maxHeight: placement?.maxHeight,
            visibility: placement ? "visible" : "hidden",
          }}
          className={`w-72 max-w-[85vw] overflow-y-auto rounded-[1.5rem] p-4 shadow-[0_20px_60px_rgba(75,45,12,0.20)] ring-1 ring-black/5 ${darkPanel ? "bg-slate-900 text-white" : "bg-white text-slate-900"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black">{t.voiceAssistant}</h3>
            <button
              onClick={closePanel}
              aria-label={t.commonClose}
              className={`rounded-full p-1 text-base leading-none ${darkPanel ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
            >
              ✕
            </button>
          </div>

          {!supported ? (
            <p className="text-xs text-slate-500">{t.voiceUnsupported}</p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs font-bold">
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${listening ? "animate-pulse bg-red-500" : "bg-slate-300"}`}
                />
                <span>{listening ? t.voiceListening : t.voiceTryCommands}</span>
              </div>
              {transcript && (
                <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${darkPanel ? "bg-white/10" : "bg-slate-100"}`}>
                  <span className="font-bold">{t.voiceHeard}: </span>“{transcript}”
                </p>
              )}
              {feedback && <p className="mt-2 text-xs font-bold text-orange-600">{feedback}</p>}
            </>
          )}
        </div>
      )}

      <button
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        data-dock-handle
        onClick={() => (listening ? stopListening() : startListening())}
        aria-label={supported ? (listening ? t.voiceStopListening : t.voiceStartListening) : t.voiceUnsupported}
        title={supported ? (listening ? t.voiceStopListening : t.voiceStartListening) : t.voiceUnsupported}
        className={`flex h-12 w-12 items-center justify-center rounded-full text-xl text-white shadow-lg transition-transform hover:-translate-y-0.5 ${
          listening ? "animate-pulse bg-red-600 shadow-red-500/30" : "bg-slate-800 shadow-slate-500/30 hover:bg-slate-700"
        }`}
      >
        🎙️
      </button>
    </div>
  );
}

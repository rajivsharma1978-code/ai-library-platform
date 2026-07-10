// ── Shared Voice Command Registry ───────────────────────────────────────
// Pure, framework-free command parsing — no React, no DOM, no imports of
// any page/reader internals. VoiceAssistant.tsx feeds it a raw speech
// transcript; it hands back a small structured VoiceCommand describing
// WHAT should happen. Executing that command (routing, dispatching a
// custom event, calling the accessibility hook) is entirely the caller's
// job — this file only ever decides "what did the user ask for".
//
// English-first, but structured so another language can be added without
// touching the VoiceCommand shape: add a new entry to COMMAND_SETS keyed
// by language code, and parseVoiceCommand(transcript, lang) picks the
// right set. Only "en" is populated today.

export type ReaderAction =
  | "nextPage" | "prevPage" | "goToPage"
  | "zoomIn" | "zoomOut" | "fitPage"
  | "fullscreen" | "exitFullscreen"
  | "read" | "pause" | "resume" | "stop";

export type AIVoiceAction =
  | "explain" | "summarize" | "translate" | "quiz" | "flashcards" | "studyTab";

export type AccessibilityVoiceAction =
  | "fontIncrease" | "fontDecrease"
  | "highContrastOn" | "highContrastOff"
  | "darkModeOn" | "darkModeOff"
  | "focusModeOn" | "focusModeOff"
  | "readingModeOn" | "readingModeOff";

export type VoiceCommand =
  | { kind: "navigate"; path: string; label: string }
  | { kind: "back" }
  | { kind: "reader"; action: ReaderAction; page?: number }
  | { kind: "ai"; action: AIVoiceAction; language?: string }
  | { kind: "accessibility"; action: AccessibilityVoiceAction };

// ── Navigation targets ───────────────────────────────────────────────
export const NAV_ROUTES: { keywords: string[]; path: string; label: string }[] = [
  { keywords: ["home"], path: "/", label: "Home" },
  { keywords: ["ai tutor", "tutor"], path: "/ai-tutor", label: "AI Tutor" },
  { keywords: ["my space"], path: "/my-space", label: "My Space" },
  { keywords: ["my library"], path: "/my-library", label: "My Library" },
  { keywords: ["my books"], path: "/my-books", label: "My Books" },
  { keywords: ["library"], path: "/library", label: "Library" },
  { keywords: ["explore"], path: "/explore", label: "Explore" },
  { keywords: ["notes"], path: "/notes", label: "Notes" },
  { keywords: ["flashcards", "flash cards"], path: "/flashcards", label: "Flashcards" },
  { keywords: ["quiz"], path: "/quiz", label: "Quiz" },
  { keywords: ["revision"], path: "/revision", label: "Revision" },
  { keywords: ["analytics"], path: "/analytics", label: "Analytics" },
  { keywords: ["settings"], path: "/settings", label: "Settings" },
];

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[.,!?]+$/g, "");
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

function parsePageNumber(text: string): number | null {
  const digitMatch = text.match(/\b(?:go to page|page)\s+(\d+)\b/);
  if (digitMatch) return parseInt(digitMatch[1], 10);
  const wordMatch = text.match(/\b(?:go to page|page)\s+([a-z]+)\b/);
  if (wordMatch && WORD_NUMBERS[wordMatch[1]]) return WORD_NUMBERS[wordMatch[1]];
  return null;
}

function matchNavigation(text: string): VoiceCommand | null {
  const navVerb = text.match(/^(?:open|go to|navigate to|show me|show)\s+(.+)$/);
  const candidate = navVerb ? navVerb[1].trim() : text;
  // Longest keyword first so "my library" wins over the bare "library"
  // route before a looser substring check ever runs.
  const sorted = [...NAV_ROUTES].sort(
    (a, b) => Math.max(...b.keywords.map(k => k.length)) - Math.max(...a.keywords.map(k => k.length))
  );
  for (const route of sorted) {
    for (const kw of route.keywords) {
      if (candidate === kw) return { kind: "navigate", path: route.path, label: route.label };
    }
  }
  // Substring matching only applies once an explicit nav verb was heard —
  // never for a bare utterance — so phrases like "create quiz" (an AI
  // command containing the word "quiz") can never accidentally resolve
  // to navigation before the AI-command checks even run.
  if (navVerb) {
    for (const route of sorted) {
      for (const kw of route.keywords) {
        if (candidate.includes(kw)) return { kind: "navigate", path: route.path, label: route.label };
      }
    }
  }
  return null;
}

// ── English command set ─────────────────────────────────────────────
function parseEnglish(rawTranscript: string): VoiceCommand | null {
  const text = normalize(rawTranscript);
  if (!text) return null;

  // Reader commands
  if (/\bnext page\b/.test(text)) return { kind: "reader", action: "nextPage" };
  if (/\b(previous|prev) page\b/.test(text)) return { kind: "reader", action: "prevPage" };
  const page = parsePageNumber(text);
  if (page !== null) return { kind: "reader", action: "goToPage", page };
  if (/\bzoom in\b/.test(text)) return { kind: "reader", action: "zoomIn" };
  if (/\bzoom out\b/.test(text)) return { kind: "reader", action: "zoomOut" };
  if (/\bfit page\b/.test(text)) return { kind: "reader", action: "fitPage" };
  if (/\bexit fullscreen\b/.test(text)) return { kind: "reader", action: "exitFullscreen" };
  if (/\bfullscreen\b/.test(text)) return { kind: "reader", action: "fullscreen" };
  if (/\bread this page\b/.test(text)) return { kind: "reader", action: "read" };
  if (/\bpause reading\b/.test(text)) return { kind: "reader", action: "pause" };
  if (/\bresume reading\b/.test(text)) return { kind: "reader", action: "resume" };
  if (/\bstop reading\b/.test(text)) return { kind: "reader", action: "stop" };

  // AI commands (Premium Reader)
  if (/\bexplain this page\b/.test(text)) return { kind: "ai", action: "explain" };
  if (/\bsummarize this page\b/.test(text)) return { kind: "ai", action: "summarize" };
  const translateMatch = text.match(/\btranslate(?: this page)? to (\w+)\b/);
  if (translateMatch) return { kind: "ai", action: "translate", language: capitalize(translateMatch[1]) };
  if (/\bcreate quiz\b/.test(text)) return { kind: "ai", action: "quiz" };
  if (/\bcreate flashcards\b/.test(text)) return { kind: "ai", action: "flashcards" };
  if (/\bopen study tab\b/.test(text)) return { kind: "ai", action: "studyTab" };

  // Accessibility commands
  if (/\bincrease font size\b/.test(text)) return { kind: "accessibility", action: "fontIncrease" };
  if (/\bdecrease font size\b/.test(text)) return { kind: "accessibility", action: "fontDecrease" };
  if (/\bhigh contrast on\b/.test(text)) return { kind: "accessibility", action: "highContrastOn" };
  if (/\bhigh contrast off\b/.test(text)) return { kind: "accessibility", action: "highContrastOff" };
  if (/\bdark mode on\b/.test(text)) return { kind: "accessibility", action: "darkModeOn" };
  if (/\bdark mode off\b/.test(text)) return { kind: "accessibility", action: "darkModeOff" };
  if (/\bfocus mode on\b/.test(text)) return { kind: "accessibility", action: "focusModeOn" };
  if (/\bfocus mode off\b/.test(text)) return { kind: "accessibility", action: "focusModeOff" };
  if (/\breading mode on\b/.test(text)) return { kind: "accessibility", action: "readingModeOn" };
  if (/\breading mode off\b/.test(text)) return { kind: "accessibility", action: "readingModeOff" };

  // Navigation (checked after the more specific command families above so
  // a phrase like "create quiz" is never shadowed by the /quiz route).
  if (/\bgo back\b/.test(text)) return { kind: "back" };
  const nav = matchNavigation(text);
  if (nav) return nav;

  return null;
}

const COMMAND_SETS: Record<string, (transcript: string) => VoiceCommand | null> = {
  en: parseEnglish,
  // hi/ta/bn/te/mr: add a parser here when multilingual recognition
  // (SpeechRecognition.lang) is wired up; parseVoiceCommand already
  // falls back to English so nothing else needs to change.
};

export function parseVoiceCommand(rawTranscript: string, lang: string = "en"): VoiceCommand | null {
  const parser = COMMAND_SETS[lang] || COMMAND_SETS.en;
  return parser(rawTranscript);
}

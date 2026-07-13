// ── Speech synthesis helpers (Phase C2 fixes) ──────────────────────────
// Shared by the two independent read-aloud players in
// PremiumReaderPreviewContent.tsx ("read the visible page" and "read the
// AI response"). Kept framework-free so it's trivial to reason about.

/**
 * Resolves speechSynthesis.getVoices() reliably. Some engines return an
 * empty list synchronously and only populate it after firing
 * "voiceschanged" (notably Chrome on first load); others return the
 * full list immediately. Falls back to whatever's available after a
 * short timeout so a browser that never fires the event doesn't hang
 * the caller forever.
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !window.speechSynthesis) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);
  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", finish, { once: true });
    setTimeout(finish, 1200);
  });
}

export type VoiceMatchTier = "exact" | "prefix" | "multilingual" | "none";

// Name fragments that genuinely claim multilingual/Indic capability —
// deliberately narrow. Bare vendor names ("Microsoft", "Google") are
// NOT included: most installed voices are vendor-named regardless of
// language (e.g. "Microsoft David - English (United States)"), and
// matching on the vendor alone would falsely claim an English-only
// voice as Hindi-capable — exactly what "do not claim a voice is
// available unless the browser actually provides it" rules out.
const MULTILINGUAL_NAME_HINTS = ["multilingual", "natural", "hindi", "devanagari", "indic", "bhashini"];

/**
 * Picks the best installed voice for a BCP-47 language code (e.g.
 * "hi-IN"), in priority order: exact code match, same-language prefix
 * match (any "hi-*"), a multilingual-sounding voice as a last resort,
 * or none — callers fall back to the browser's default voice/engine
 * when this returns null, and should tell the user when they do.
 */
export function pickVoiceForLanguage(
  voices: SpeechSynthesisVoice[],
  langCode: string
): { voice: SpeechSynthesisVoice | null; tier: VoiceMatchTier } {
  if (voices.length === 0) return { voice: null, tier: "none" };
  const code = langCode.toLowerCase();
  const prefix = code.split("-")[0];

  const exact = voices.find((v) => v.lang?.toLowerCase() === code);
  if (exact) return { voice: exact, tier: "exact" };

  const prefixMatch = voices.find((v) => v.lang?.toLowerCase().startsWith(`${prefix}-`) || v.lang?.toLowerCase() === prefix);
  if (prefixMatch) return { voice: prefixMatch, tier: "prefix" };

  if (prefix !== "en") {
    const multilingual = voices.find((v) => MULTILINGUAL_NAME_HINTS.some((hint) => v.name.toLowerCase().includes(hint)));
    if (multilingual) return { voice: multilingual, tier: "multilingual" };
  }

  return { voice: null, tier: "none" };
}

/**
 * Strips Markdown formatting produced by MarkdownBlock's source text
 * (AICompanion.tsx) down to plain, speakable prose — headings, bullets,
 * bold/italic markers, code fences/inline code, links, and horizontal
 * rules never sound right read aloud verbatim ("asterisk asterisk...").
 */
export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^[-*•]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^-{3,}$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Chrome/Edge (especially on Windows) are known to silently cut off a
// single long SpeechSynthesisUtterance after only a few words — most
// visible with non-English voices. Speaking a sequence of short,
// sentence-bounded utterances instead sidesteps that entirely.
const DEFAULT_MAX_CHUNK_CHARS = 180;

/**
 * Splits text into utterance-safe chunks, preferring sentence
 * boundaries (., !, ?, and the Hindi/Indic danda ।) and falling back to
 * word-wrapping only when a single sentence still exceeds maxChars.
 */
export function splitIntoSpeechChunks(text: string, maxChars: number = DEFAULT_MAX_CHUNK_CHARS): string[] {
  const clean = text.trim();
  if (!clean) return [];

  const sentences = clean.split(/(?<=[.!?।])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    pushCurrent();
    if (sentence.length <= maxChars) {
      current = sentence;
      continue;
    }
    // A single sentence longer than one chunk — hard-wrap on words.
    const words = sentence.split(" ");
    let piece = "";
    for (const word of words) {
      const next = piece ? `${piece} ${word}` : word;
      if (next.length > maxChars && piece) {
        chunks.push(piece);
        piece = word;
      } else {
        piece = next;
      }
    }
    current = piece;
  }
  pushCurrent();

  return chunks;
}

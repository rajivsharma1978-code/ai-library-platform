export type AiActionKind = "explain" | "summarize" | "translate" | "quiz" | "ask";

export interface AiActionResult {
  answer: string;
}

const RESPONSE_LANGUAGES = [
  "English",
  "Hindi",
  "Tamil",
  "Bengali",
  "Marathi",
  "Telugu",
] as const;

export type ResponseLanguage = (typeof RESPONSE_LANGUAGES)[number];

// Kept as an alias so any existing import of TranslateLanguage still
// type-checks correctly — language is no longer a translate-only
// concept, it now applies to every AI action uniformly.
export type TranslateLanguage = ResponseLanguage;

export { RESPONSE_LANGUAGES, RESPONSE_LANGUAGES as TRANSLATE_LANGUAGES };

const LANGUAGE_CODES: Record<ResponseLanguage, string> = {
  English: "en",
  Hindi: "hi",
  Tamil: "ta",
  Bengali: "bn",
  Marathi: "mr",
  Telugu: "te",
};

const SPEECH_LANGUAGE_MAP: Record<ResponseLanguage, string> = {
  English: "en-IN",
  Hindi: "hi-IN",
  Tamil: "ta-IN",
  Bengali: "bn-IN",
  Marathi: "mr-IN",
  Telugu: "te-IN",
};

export function getSpeechLanguage(languageName: ResponseLanguage | string): string {
  return SPEECH_LANGUAGE_MAP[languageName as ResponseLanguage] ?? "en-IN";
}

function buildContentBlock(
  pages: { pageNumber: number; text: string }[]
): string {
  return pages
    .map((p) => `--- Page ${p.pageNumber} ---\n${p.text || "(no readable text)"}`)
    .join("\n\n");
}

/**
 * Builds the explain/summarize/quiz/ask prompt. Every one of these
 * now ends with an explicit "Respond only in {language}." directive,
 * per requirement #10 — this is what makes Explain/Summarize/Quiz/Ask
 * actually respect the selected language instead of silently always
 * answering in English regardless of selection.
 */
function buildTutoringQuestion(
  kind: "explain" | "summarize" | "quiz" | "ask",
  language: ResponseLanguage,
  customQuestion?: string
): string {
  const studyModePrefix = "[Study Mode: Student] ";
  const languageDirective = `Respond only in ${language}.`;

  switch (kind) {
    case "explain":
      return (
        studyModePrefix +
        `Explain this page in simple terms suitable for a student. Keep it short, clear, and easy to follow. ${languageDirective}`
      );
    case "summarize":
      return (
        studyModePrefix +
        `Summarize this page/spread in at most 8 concise bullet points. Do not exceed 8 bullets. ${languageDirective}`
      );
    case "quiz":
      return (
        studyModePrefix +
        `Create a quiz based ONLY on this page/spread: exactly 5 multiple-choice questions (each with 4 options, ` +
        `marking the correct one clearly) followed by exactly 2 short-answer questions. Number everything clearly. ${languageDirective}`
      );
    case "ask":
      return (
        studyModePrefix +
        `${customQuestion ?? ""} ${languageDirective}`
      );
  }
}

/**
 * Builds the translation prompt. Per requirement #9, the instruction
 * is exactly "Translate the current page content into {language}.",
 * followed by the same neutral, refusal-resistant directives proven
 * to work across all six languages (no study-mode prefix — that
 * prefix is what caused non-Hindi languages to refuse previously).
 */
function buildTranslateQuestion(
  language: ResponseLanguage,
  content: string
): string {
  const languageCode = LANGUAGE_CODES[language];

  return (
    `Translate the current page content into ${language}.\n` +
    `Target language: ${language} (${languageCode})\n` +
    `Return ONLY the translated text.\n` +
    `Do not explain.\n` +
    `Do not summarize.\n` +
    `Do not answer questions.\n` +
    `Do not add disclaimers.\n` +
    `Do not refuse.\n` +
    `Preserve headings and formatting.\n` +
    `Keep proper nouns as-is.\n\n` +
    `TEXT TO TRANSLATE:\n${content}`
  );
}

/**
 * Calls the existing /api/ask-ai route. `language` now applies to
 * EVERY action kind — explain/summarize/quiz/ask all get a "Respond
 * only in {language}." directive baked into their question string,
 * and translate uses the dedicated neutral prompt above. No new API
 * route is needed; same {question, book, chapter, content} → {answer}
 * contract as before.
 */
export async function runAiAction(params: {
  kind: AiActionKind;
  bookTitle: string;
  pageLabel: string;
  pages: { pageNumber: number; text: string }[];
  language: ResponseLanguage;
  customQuestion?: string;
}): Promise<AiActionResult> {
  const { kind, bookTitle, pageLabel, pages, language, customQuestion } = params;

  const content = buildContentBlock(pages);

  let question: string;
  let chapter: string;

  if (kind === "translate") {
    question = buildTranslateQuestion(language, content);
    chapter = `Page ${pageLabel} — Translate to ${language} (${LANGUAGE_CODES[language]})`;
  } else {
    question = buildTutoringQuestion(kind, language, customQuestion);
    chapter = `Page ${pageLabel} — Respond in ${language}`;
  }

  const response = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      book: bookTitle,
      chapter,
      content,
    }),
  });

  const data = await response.json();
  return { answer: data?.answer ?? "AI response was empty." };
}

// ── Selection-scoped AI actions ───────────────────────────────────────
// Separate from runAiAction() above: these operate on a SMALL piece
// of HIGHLIGHTED text (a sentence/paragraph the user selected), not
// the whole visible page/spread. Kept as distinct functions so the
// existing per-page action flow is never touched by this addition.

export type SelectionActionKind = "explain" | "summarize" | "translate" | "flashcards" | "ask";

export interface FlashcardResult {
  front: string;
  back: string;
}

function buildSelectionQuestion(
  kind: SelectionActionKind,
  language: ResponseLanguage,
  customQuestion?: string
): string {
  const languageDirective = `Respond only in ${language}.`;

  switch (kind) {
    case "explain":
      return `Explain the following selected text in simple terms suitable for a student. ${languageDirective}`;
    case "summarize":
      return `Summarize the following selected text in at most 5 concise bullet points. ${languageDirective}`;
    case "translate":
      return (
        `Translate the following selected text into ${language}.\n` +
        `Target language: ${language} (${LANGUAGE_CODES[language]})\n` +
        `Return ONLY the translated text.\n` +
        `Do not explain.\n` +
        `Do not summarize.\n` +
        `Do not answer questions.\n` +
        `Do not add disclaimers.\n` +
        `Do not refuse.\n` +
        `Preserve formatting.\n` +
        `Keep proper nouns as-is.`
      );
    case "flashcards":
      return (
        `Create exactly ONE flashcard from the following selected text. ` +
        `Respond in EXACTLY this format, nothing else:\n` +
        `FRONT: <a short concept or question derived from the text>\n` +
        `BACK: <the explanation or answer, based only on the selected text>\n` +
        `${languageDirective}`
      );
    case "ask":
      return `${customQuestion ?? ""} Base your answer only on the following selected text. ${languageDirective}`;
  }
}

/**
 * Runs an AI action scoped to a small selected piece of text rather
 * than the whole visible page. Reuses the same /api/ask-ai route —
 * `content` is just the selection itself, `chapter` notes that this
 * is a selection-scoped request for context.
 */
export async function runSelectionAiAction(params: {
  kind: SelectionActionKind;
  bookTitle: string;
  pageLabel: string;
  selectedText: string;
  language: ResponseLanguage;
  customQuestion?: string;
}): Promise<AiActionResult> {
  const { kind, bookTitle, pageLabel, selectedText, language, customQuestion } = params;

  const question = buildSelectionQuestion(kind, language, customQuestion);

  const response = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      book: bookTitle,
      chapter: `Page ${pageLabel} — Selected text`,
      content: selectedText,
    }),
  });

  const data = await response.json();
  return { answer: data?.answer ?? "AI response was empty." };
}

/**
 * Parses the FRONT:/BACK: formatted response from a flashcards
 * action into a structured FlashcardResult. Falls back to putting the
 * whole answer on the back with a generic front if the model didn't
 * follow the exact format (keeps this robust rather than throwing).
 */
export function parseFlashcardResult(answer: string): FlashcardResult {
  const frontMatch = answer.match(/FRONT:\s*(.+)/i);
  const backMatch = answer.match(/BACK:\s*([\s\S]+)/i);

  if (frontMatch && backMatch) {
    return {
      front: frontMatch[1].trim(),
      back: backMatch[1].trim(),
    };
  }

  return {
    front: "Flashcard",
    back: answer.trim(),
  };
}
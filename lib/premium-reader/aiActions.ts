import { cleanOcrTextForAi } from "./pageTextExtractor";

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

const OCR_NOISE_INSTRUCTION =
  "Ignore OCR artifacts, broken random uppercase fragments, repeated letters, page labels, and unreadable text. Do not translate or explain OCR noise.";

const TRANSLATE_OCR_NOISE_INSTRUCTION =
  "Translate only meaningful readable content. Omit OCR garbage, random letters, broken fragments, and non-sentence artifacts.";

function buildContentBlock(
  pages: { pageNumber: number; text: string }[]
): string {
  return pages
    .map((p) => {
      const cleanedText = cleanOcrTextForAi(p.text);
      return `--- Page ${p.pageNumber} ---\n${cleanedText || "(no readable text)"}`;
    })
    .join("\n\n");
}

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
        `Explain this page in simple terms suitable for a student. Keep it short, clear, and easy to follow. ${languageDirective} ${OCR_NOISE_INSTRUCTION}`
      );
    case "summarize":
      return (
        studyModePrefix +
        `Summarize this page/spread in at most 8 concise bullet points. Do not exceed 8 bullets. ${languageDirective} ${OCR_NOISE_INSTRUCTION}`
      );
    case "quiz":
      return (
        studyModePrefix +
        `Create a quiz based ONLY on this page/spread: exactly 5 multiple-choice questions (each with 4 options, ` +
        `marking the correct one clearly) followed by exactly 2 short-answer questions. Number everything clearly. ${languageDirective} ${OCR_NOISE_INSTRUCTION}`
      );
    case "ask":
      return (
        studyModePrefix +
        `${customQuestion ?? ""} ${languageDirective} ${OCR_NOISE_INSTRUCTION}`
      );
  }
}

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
    `Keep proper nouns as-is.\n` +
    `${TRANSLATE_OCR_NOISE_INSTRUCTION}\n\n` +
    `TEXT TO TRANSLATE:\n${content}`
  );
}

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

// ── Selection-scoped AI actions (text) ─────────────────────────────────
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
      return `Explain the following selected text in simple terms suitable for a student. ${languageDirective} ${OCR_NOISE_INSTRUCTION}`;
    case "summarize":
      return `Summarize the following selected text in at most 5 concise bullet points. ${languageDirective} ${OCR_NOISE_INSTRUCTION}`;
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
        `Keep proper nouns as-is.\n` +
        `${TRANSLATE_OCR_NOISE_INSTRUCTION}`
      );
    case "flashcards":
      return (
        `Create exactly ONE flashcard from the following selected text. ` +
        `Respond in EXACTLY this format, nothing else:\n` +
        `FRONT: <a short concept or question derived from the text>\n` +
        `BACK: <the explanation or answer, based only on the selected text>\n` +
        `${languageDirective} ${OCR_NOISE_INSTRUCTION}`
      );
    case "ask":
      return `${customQuestion ?? ""} Base your answer only on the following selected text. ${languageDirective} ${OCR_NOISE_INSTRUCTION}`;
  }
}

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
  const cleanedSelectedText = cleanOcrTextForAi(selectedText);

  const response = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      book: bookTitle,
      chapter: `Page ${pageLabel} — Selected text`,
      content: cleanedSelectedText,
    }),
  });

  const data = await response.json();
  return { answer: data?.answer ?? "AI response was empty." };
}

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

// ── Image-selection AI actions ────────────────────────────────────────
// New, additive: operates on a CAPTURED IMAGE REGION (a diagram/
// figure/table the user rectangle-selected from the page canvas via
// ImageSelectionLayer), not text. Posts to the SAME /api/ask-ai route,
// now extended with an optional `imageDataUrl` field — every text-only
// request above is completely unaffected by this addition, since
// imageDataUrl is simply omitted in those calls.

export type ImageSelectionActionKind =
  | "explain-image"
  | "summarize-diagram"
  | "translate-visible-text"
  | "ask";

function buildImageSelectionQuestion(
  kind: ImageSelectionActionKind,
  language: ResponseLanguage,
  customQuestion?: string
): string {
  const languageDirective = `Respond only in ${language}.`;

  switch (kind) {
    case "explain-image":
      return `Explain what is shown in the attached image (diagram, figure, illustration, or photo) in simple terms suitable for a student. ${languageDirective}`;
    case "summarize-diagram":
      return `Summarize the diagram, chart, or table shown in the attached image in at most 5 concise bullet points, describing its key parts and what it represents. ${languageDirective}`;
    case "translate-visible-text":
      return (
        `Translate ONLY the text that is visibly written inside the attached image into ${language}.\n` +
        `Target language: ${language} (${LANGUAGE_CODES[language]})\n` +
        `Return ONLY the translated text, preserving its original layout/order as closely as possible.\n` +
        `Do not explain.\n` +
        `Do not describe the image itself.\n` +
        `Do not add disclaimers.\n` +
        `Do not refuse.\n` +
        `If there is no visible text in the image, say so briefly instead.`
      );
    case "ask":
      return `${customQuestion ?? ""} Base your answer primarily on the attached image. ${languageDirective}`;
  }
}

/**
 * Runs an AI action scoped to a captured image region. `imageDataUrl`
 * is a PNG data URL cropped directly from the live PDF canvas by
 * ImageSelectionLayer. `pageText` (if available) is sent purely as
 * supporting context — the prompts above explicitly tell the model
 * to prioritize the image itself, not the surrounding text.
 */
export async function runImageSelectionAiAction(params: {
  kind: ImageSelectionActionKind;
  bookTitle: string;
  pageLabel: string;
  imageDataUrl: string;
  pageText?: string;
  language: ResponseLanguage;
  customQuestion?: string;
}): Promise<AiActionResult> {
  const { kind, bookTitle, pageLabel, imageDataUrl, pageText, language, customQuestion } = params;

  const question = buildImageSelectionQuestion(kind, language, customQuestion);
  const content = pageText ? cleanOcrTextForAi(pageText) : "(no surrounding page text provided)";

  const response = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      book: bookTitle,
      chapter: `Page ${pageLabel} — Selected image region`,
      content,
      imageDataUrl,
    }),
  });

  const data = await response.json();
  return { answer: data?.answer ?? "AI response was empty." };
}
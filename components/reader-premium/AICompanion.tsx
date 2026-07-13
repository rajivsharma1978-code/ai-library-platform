"use client";

import { useState } from "react";
import StudyWorkspace, { RevisionAction } from "./study/StudyWorkspace";
import type { StoredHighlight, StoredNote, StoredBookmark } from "./study/studyData";
import type { PrintedPageMap } from "@/lib/printedPageMap";
import LanguagePopover from "./LanguagePopover";
import { useEffect } from "react";

const LANGUAGES = ["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu"] as const;
type Lang = typeof LANGUAGES[number];

type AICompanionProps = {
  aiResponse: string;
  isLoading?: boolean;
  aiQuestion: string;
  setAiQuestion: (v: string) => void;
  onAsk: () => void;
  /** Parent owns the AI call — onQuickAction receives the full prompt
   *  string so the parent can call runAI(prompt, pageContent) with the
   *  right context. The parent decides actual scope (page/chapter/book)
   *  from the `scope` prop below — this callback carries no scope. */
  onQuickAction: (label: string, prompt: string) => void;
  bookTitle?: string;
  language: Lang;
  /** Shared with the reader toolbar's own globe icon — selecting a
   *  language here (via the "Change" link) or there updates the same
   *  underlying value, so this is one control with two trigger points,
   *  not a duplicate selector. */
  onLanguageChange: (lang: Lang) => void;
  availableLanguages: Lang[];

  // ── Scope + depth (dropdowns, single row) ───────────────────────────
  /** What Quick Actions / Ask AI apply to. An active text selection on
   *  the page always wins for Ask AI regardless of this value (see
   *  hasActiveSelection below) — the "Selection" pill is a read-only
   *  indicator of that, not a 4th manually-selectable scope; the
   *  underlying value stays the same 3-option union it always was. */
  scope: "page" | "chapter" | "book";
  onScopeChange: (scope: "page" | "chapter" | "book") => void;
  /** Response depth — reuses the existing Student/Exam Prep/Researcher
   *  study modes already implemented server-side (app/api/ask-ai). */
  depth: "Beginner" | "Exam-focused" | "Research-level";
  onDepthChange: (depth: "Beginner" | "Exam-focused" | "Research-level") => void;
  /** True while the user has text selected on the page — shown as a small
   *  status chip so it's clear Ask AI will answer from that selection. */
  hasActiveSelection?: boolean;

  // ── Friendly retry after a failed AI call ──────────────────────────
  /** True only right after the most recent AI call failed. */
  aiFailed?: boolean;
  /** Re-runs the exact same call that just failed. */
  onRetry?: () => void;

  // ── "Read AI Response" — reads ONLY the AI output above, never the
  //    book page (that's the reader toolbar's own "Read Page" button,
  //    entirely separate state). ──────────────────────────────────────
  aiSpeechState?: "idle" | "loading" | "speaking" | "paused";
  onReadAiResponse?: () => void;
  onStopAiResponse?: () => void;
  /** Set when the AI response's language has no closely-matching
   *  installed voice, e.g. "A Hindi system voice is not installed on
   *  this device." — shown next to the Read AI Response button. */
  aiVoiceNotice?: string | null;

  // ── Phase C3: expanded vs. compact panel state — owned by the parent
  //    since it also drives the panel's column width in the layout. ───
  compact: boolean;
  onToggleCompact: () => void;

  // ── Study Workspace tab (unchanged data/behavior — visual theme only) ─
  studyHighlights: StoredHighlight[];
  studyNotes: StoredNote[];
  studyBookmarks: StoredBookmark[];
  /** Static per-book printed-page map (lib/printedPageMap.ts), passed
   *  through to StudyWorkspace so highlight/note/bookmark cards show the
   *  printed page alongside the stable pdfPage they're keyed by. */
  printedPageMap?: PrintedPageMap;
  onStudyJumpToPage: (page: number, flashId?: string) => void;
  onStudyDeleteHighlight: (id: string) => void;
  onStudyDeleteNote: (id: string) => void;
  onStudyDeleteBookmark: (id: string) => void;
  onStudyGenerateFromHighlight: (highlight: StoredHighlight, action: RevisionAction) => void;
  studyGeneratingId: string | null;

  // ── Voice Assistant: "Open Study tab" ──────────────────────────────
  // A monotonically increasing counter, not a controlled tab value — the
  // parent bumps it on each voice command; this component just reacts by
  // switching to Study, same as clicking the tab itself.
  openStudyTabSignal?: number;
};

// Deliberately scope-agnostic — no "this page/spread" wording baked in.
// The parent decides the actual scope (page/chapter/entire book, from
// the `scope` pills below) and wraps each of these with the right
// framing + content block before sending it to the AI. This is what lets
// the SAME six buttons work for all three scopes.
const QUICK_ACTIONS: { label: string; short: string; prompt: (lang: string) => string }[] = [
  { label: "🧠 Explain",    short: "Explain",    prompt: (lang) => `Explain this clearly for a student in simple language. Respond ONLY in: ${lang}.` },
  { label: "📝 Summarize",  short: "Summarize",  prompt: (lang) => `Summarize this in at most 8 concise bullet points. Respond ONLY in: ${lang}.` },
  { label: "🌍 Translate",  short: "Translate",  prompt: (lang) => `Rewrite and explain the content in ${lang}. Write entirely in ${lang}. Respond ONLY in: ${lang}.` },
  { label: "❓ Quiz",       short: "Quiz",       prompt: (lang) => `Create multiple-choice quiz questions — 5 for a page or chapter, 8 for the entire book. Respond ONLY in: ${lang}.` },
  { label: "🎴 Flashcards", short: "Flashcards", prompt: (lang) => `Create flashcards (FRONT: / BACK: format) — 5 for a page or chapter, 10 for the entire book. Respond ONLY in: ${lang}.` },
  { label: "📌 Notes",      short: "Notes",      prompt: (lang) => `Create clean, structured revision notes. Respond ONLY in: ${lang}.` },
];

const SCOPE_OPTIONS: { value: "page" | "chapter" | "book"; label: string; icon: string }[] = [
  { value: "page", label: "Page", icon: "📄" },
  { value: "chapter", label: "Chapter", icon: "📑" },
  { value: "book", label: "Entire Book", icon: "📚" },
];

const DEPTH_OPTIONS: { value: "Beginner" | "Exam-focused" | "Research-level"; label: string; icon: string }[] = [
  { value: "Beginner", label: "Beginner", icon: "🌱" },
  { value: "Exam-focused", label: "Exam Focused", icon: "🎯" },
  { value: "Research-level", label: "Research Level", icon: "🔬" },
];

// ── Lightweight markdown renderer ────────────────────────────────────
function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (!listItems.length) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="my-1.5 list-disc pl-5">
        {listItems.map((li, i) => <li key={i} className="mb-1">{inlineFormat(li)}</li>)}
      </ul>
    );
    listItems = [];
  }

  function inlineFormat(s: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let rem = s, key = 0;
    while (rem.length > 0) {
      const boldMatch = rem.match(/\*\*(.+?)\*\*/);
      const italicMatch = rem.match(/(?<!\*)\*([^*]+?)\*(?!\*)|_([^_]+?)_/);
      const codeMatch = rem.match(/`([^`]+?)`/);
      const candidates: Array<{ idx: number; len: number; node: React.ReactNode }> = [];
      if (boldMatch?.index !== undefined)
        candidates.push({ idx: boldMatch.index, len: boldMatch[0].length, node: <strong key={key++}>{boldMatch[1]}</strong> });
      if (italicMatch?.index !== undefined)
        candidates.push({ idx: italicMatch.index, len: italicMatch[0].length, node: <em key={key++}>{italicMatch[1] ?? italicMatch[2]}</em> });
      if (codeMatch?.index !== undefined)
        candidates.push({ idx: codeMatch.index, len: codeMatch[0].length, node: <code key={key++} className="rounded bg-amber-100 px-1 text-[0.9em] text-amber-900">{codeMatch[1]}</code> });
      if (!candidates.length) { parts.push(rem); break; }
      candidates.sort((a, b) => a.idx - b.idx);
      const first = candidates[0];
      if (first.idx > 0) parts.push(rem.slice(0, first.idx));
      parts.push(first.node);
      rem = rem.slice(first.idx + first.len);
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], trimmed = line.trim();
    if (trimmed === "") { flushList(); elements.push(<div key={`br-${i}`} className="h-2" />); continue; }
    if (/^---+$/.test(trimmed)) { flushList(); elements.push(<hr key={`hr-${i}`} className="my-2.5 border-amber-100" />); continue; }
    const hm = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (hm) {
      flushList();
      const sizes = ["text-[1.1em]", "text-[1.05em]", "text-[1em]", "text-[0.95em]"];
      elements.push(
        <div key={`h-${i}`} className={`${sizes[hm[1].length - 1]} font-black text-slate-900 ${hm[1].length <= 2 ? "mt-3.5 mb-1.5" : "mt-2.5 mb-1"}`}>
          {inlineFormat(hm[2])}
        </div>
      );
      continue;
    }
    const bm = trimmed.match(/^[-*•]\s+(.+)/);
    if (bm) { listItems.push(bm[1]); continue; }
    const nm = trimmed.match(/^\d+\.\s+(.+)/);
    if (nm) { listItems.push(nm[1]); continue; }
    flushList();
    elements.push(<p key={`p-${i}`} className="my-1 leading-7">{inlineFormat(trimmed)}</p>);
  }
  flushList();
  return <>{elements}</>;
}

function stripMarkdownForCopy(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/^[-*•]\s+/gm, "- ")
    .trim();
}

export default function AICompanion({
  aiResponse, isLoading = false, aiQuestion, setAiQuestion, onAsk, onQuickAction,
  bookTitle, language, onLanguageChange, availableLanguages,
  scope, onScopeChange, depth, onDepthChange, hasActiveSelection = false,
  aiFailed = false, onRetry,
  aiSpeechState = "idle", onReadAiResponse, onStopAiResponse, aiVoiceNotice = null,
  compact, onToggleCompact,
  studyHighlights, studyNotes, studyBookmarks, printedPageMap,
  onStudyJumpToPage, onStudyDeleteHighlight, onStudyDeleteNote, onStudyDeleteBookmark,
  onStudyGenerateFromHighlight, studyGeneratingId, openStudyTabSignal,
}: AICompanionProps) {
  const [outerTab, setOuterTab] = useState<"companion" | "study">("companion");
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);

  useEffect(() => {
    if (openStudyTabSignal !== undefined) setOuterTab("study");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStudyTabSignal]);

  // Local-only feedback indicator — resets whenever a new response comes in.
  useEffect(() => { setFeedback(null); }, [aiResponse]);

  function copyResponse() {
    if (!aiResponse.trim()) return;
    navigator.clipboard?.writeText(stripMarkdownForCopy(aiResponse)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }

  // ── Compact state: icon-only rail (~76px). Only the AI icon and an
  //    expand button — nothing else — so the reader immediately gets the
  //    freed width back instead of a mostly-empty panel. ────────────────
  if (compact) {
    return (
      <div className="ndl-fade-in-scale flex h-full flex-col items-center gap-3 py-4">
        <span className="text-xl" aria-hidden>🤖</span>
        <button
          onClick={onToggleCompact}
          title="Open AI Companion"
          aria-label="Open AI Companion"
          className="ndl-press flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-orange-700 hover:bg-orange-100"
        >
          »
        </button>
      </div>
    );
  }

  return (
    <div className="ndl-fade-in-scale flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-amber-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-black text-slate-900">🤖 AI Learning Companion</h2>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="flex gap-1 rounded-full bg-amber-50 p-1">
            <button
              onClick={() => setOuterTab("companion")}
              className={`ndl-press rounded-full px-3 py-1.5 text-xs font-bold ${
                outerTab === "companion" ? "bg-orange-600 text-white" : "text-slate-500 hover:text-slate-800"}`}
            >
              Ask AI
            </button>
            <button
              onClick={() => setOuterTab("study")}
              className={`ndl-press rounded-full px-3 py-1.5 text-xs font-bold ${
                outerTab === "study" ? "bg-orange-600 text-white" : "text-slate-500 hover:text-slate-800"}`}
            >
              Study
            </button>
          </div>
          <button
            onClick={onToggleCompact}
            title="Collapse AI Companion"
            className="ndl-press flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-slate-600 hover:bg-amber-100"
          >
            ✕
          </button>
        </div>
      </div>

      {outerTab === "study" ? (
        <div className="min-h-0 flex-1 p-4">
          <StudyWorkspace
            bookTitle={bookTitle}
            highlights={studyHighlights}
            notes={studyNotes}
            bookmarks={studyBookmarks}
            printedPageMap={printedPageMap}
            onJumpToPage={onStudyJumpToPage}
            onDeleteHighlight={onStudyDeleteHighlight}
            onDeleteNote={onStudyDeleteNote}
            onDeleteBookmark={onStudyDeleteBookmark}
            onGenerateFromHighlight={onStudyGenerateFromHighlight}
            generatingId={studyGeneratingId}
          />
        </div>
      ) : (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 space-y-3 overflow-y-auto px-5 pt-4">
          {/* 1–2. Scope + Response depth — compact control row, single line. */}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Scope</p>
              <select
                value={hasActiveSelection ? "selection" : scope}
                disabled={hasActiveSelection}
                onChange={(e) => onScopeChange(e.target.value as "page" | "chapter" | "book")}
                title={hasActiveSelection ? "Selecting text on the page always answers from that selection" : undefined}
                className="ndl-press w-full rounded-xl border border-amber-100 bg-amber-50 px-2.5 py-2 text-xs font-bold text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-70"
              >
                {hasActiveSelection && <option value="selection">📎 Selection</option>}
                {SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Depth</p>
              <select
                value={depth}
                onChange={(e) => onDepthChange(e.target.value as "Beginner" | "Exam-focused" | "Research-level")}
                className="ndl-press w-full rounded-xl border border-amber-100 bg-amber-50 px-2.5 py-2 text-xs font-bold text-slate-700 outline-none"
              >
                {DEPTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Language — shown as text with a "Change" link that opens the
              SAME popover/state as the reader toolbar's globe icon (not a
              second independent selector). */}
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <span>🌐</span>
            <span>Responding in <span className="font-bold text-slate-700">{language}</span></span>
            <LanguagePopover variant="link" language={language} onLanguageChange={onLanguageChange} availableLanguages={availableLanguages} />
          </div>

          {hasActiveSelection && (
            <p className="text-[11px] font-bold text-orange-700">📎 Text selected — Ask AI will answer from that selection.</p>
          )}

          {/* 4. Current request */}
          {aiQuestion.trim() && (
            <div className="rounded-2xl bg-amber-50 px-3 py-2 text-[12px] font-semibold text-slate-700">
              {aiQuestion}
            </div>
          )}
        </div>

        {/* 5. Large AI response area — gets the most vertical space. */}
        <div className="mt-3 min-h-0 flex-1 overflow-auto px-5">
          <div className="rounded-3xl bg-amber-50/50 p-5 text-[14px] text-slate-800 shadow-inner">
            {!isLoading && aiResponse.trim() && (
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">AI Response</p>
            )}
            {aiVoiceNotice && (
              <p className="mb-3 text-[11px] font-semibold text-orange-700">⚠️ {aiVoiceNotice}</p>
            )}
            {isLoading ? (
              <div className="flex flex-col gap-2.5" aria-label="AI is thinking">
                <div className="ndl-skeleton h-3.5 w-[85%] rounded-full" />
                <div className="ndl-skeleton h-3.5 w-full rounded-full" />
                <div className="ndl-skeleton h-3.5 w-[70%] rounded-full" />
                <div className="ndl-skeleton h-3.5 w-[92%] rounded-full" />
                <p className="mt-1 text-xs font-semibold text-slate-400">AI is thinking…</p>
              </div>
            ) : (
              <div key={aiResponse.slice(0, 40)} className="ndl-fade-in-scale">
                <MarkdownBlock text={aiResponse} />
                {aiFailed && onRetry && (
                  <button
                    onClick={onRetry}
                    className="ndl-press mt-3 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-100"
                  >
                    🔁 Retry
                  </button>
                )}
              </div>
            )}
            {!isLoading && aiResponse.trim() && onReadAiResponse && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-100 pt-3">
                <button
                  onClick={onReadAiResponse}
                  title="Read this AI response aloud"
                  className="ndl-press inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1.5 text-[11px] font-bold text-orange-700 hover:bg-orange-200"
                >
                  {aiSpeechState === "loading" ? "⏳ Preparing…"
                    : aiSpeechState === "speaking" ? "⏸ Pause"
                    : aiSpeechState === "paused" ? "▶ Resume"
                    : "🔊 Read AI Response"}
                </button>
                {(aiSpeechState === "speaking" || aiSpeechState === "paused") && onStopAiResponse && (
                  <button
                    onClick={onStopAiResponse}
                    className="ndl-press inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-100"
                  >
                    ⏹ Stop
                  </button>
                )}
                <button
                  onClick={copyResponse}
                  title="Copy response"
                  className="ndl-press inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-200"
                >
                  {copied ? "✅ Copied" : "📋 Copy"}
                </button>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => setFeedback((f) => (f === "like" ? null : "like"))}
                    title="Good response"
                    aria-pressed={feedback === "like"}
                    className={`ndl-press flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                      feedback === "like" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    👍
                  </button>
                  <button
                    onClick={() => setFeedback((f) => (f === "dislike" ? null : "dislike"))}
                    title="Poor response"
                    aria-pressed={feedback === "dislike"}
                    className={`ndl-press flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                      feedback === "dislike" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    👎
                  </button>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 7. Compact quick actions + 8. Ask AI input, fixed near bottom */}
        <div className="flex-shrink-0 border-t border-amber-100 px-5 pb-4 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                disabled={isLoading}
                onClick={() => onQuickAction(a.label, a.prompt(language))}
                title={a.short}
                className="ndl-press rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-bold leading-tight text-slate-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {a.label}
              </button>
            ))}
          </div>

          <div data-dock-avoid className="mt-3 flex gap-2">
            <input
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
              placeholder={`Ask AI in ${language}…`}
              className="min-w-0 flex-1 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-shadow focus:ring-2 focus:ring-orange-400"
            />
            <button
              onClick={onAsk}
              disabled={isLoading}
              className="ndl-press rounded-2xl bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow hover:bg-orange-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import StudyWorkspace, { RevisionAction } from "./study/StudyWorkspace";
import type { StoredHighlight, StoredNote, StoredBookmark } from "./study/studyData";
import { useEnabledLanguages, LANGUAGE_NAME_TO_CODE } from "@/lib/languageSettings";

const LANGUAGES = ["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu"] as const;
type Lang = typeof LANGUAGES[number];

type AICompanionProps = {
  aiResponse: string;
  isLoading?: boolean;
  aiQuestion: string;
  setAiQuestion: (v: string) => void;
  onAsk: () => void;
  /** Parent now owns the AI call — onQuickAction receives the full prompt string
   *  so parent can call runAI(prompt, pageContent) with the right context.
   *  Removing AICompanion's internal callAskAI/localResponse eliminates the
   *  competing pipeline that was hiding floating-toolbar results. */
  onQuickAction: (label: string, prompt: string, scope: QuickActionScope) => void;
  bookTitle?: string;
  pageNumber?: number;
  pageText?: string;
  language: Lang;
  onLanguageChange: (lang: Lang) => void;

  // ── Phase 2: Study Workspace tab (additive — existing tab/behavior
  //    above is completely untouched) ──────────────────────────────────
  studyHighlights: StoredHighlight[];
  studyNotes: StoredNote[];
  studyBookmarks: StoredBookmark[];
  onStudyJumpToPage: (page: number, flashId?: string) => void;
  onStudyDeleteHighlight: (id: string) => void;
  onStudyDeleteNote: (id: string) => void;
  onStudyDeleteBookmark: (id: string) => void;
  onStudyGenerateFromHighlight: (highlight: StoredHighlight, action: RevisionAction) => void;
  studyGeneratingId: string | null;
};

type QuickActionScope = "page" | "book";

const QUICK_ACTIONS: { label: string; scope: QuickActionScope; prompt: (lang: string) => string }[] = [
  { label: "🧠 Explain",    scope: "page", prompt: (lang: string) => `Explain this page/spread clearly for a student in simple language. Respond ONLY in: ${lang}.` },
  { label: "📝 Summarize",  scope: "page", prompt: (lang: string) => `Summarize this page/spread in at most 8 concise bullet points. Respond ONLY in: ${lang}.` },
  { label: "🌍 Translate",  scope: "page", prompt: (lang: string) => `Rewrite and explain the content of this page/spread in ${lang}. Write entirely in ${lang}. Respond ONLY in: ${lang}.` },
  { label: "❓ Quiz",       scope: "page", prompt: (lang: string) => `Create exactly 5 multiple-choice quiz questions from this page/spread. Respond ONLY in: ${lang}.` },
  { label: "🎴 Flashcards", scope: "page", prompt: (lang: string) => `Create 5 flashcards (FRONT: / BACK: format) from this page/spread. Respond ONLY in: ${lang}.` },
  { label: "📌 Notes",      scope: "page", prompt: (lang: string) => `Create clean, structured study notes from this page/spread. Respond ONLY in: ${lang}.` },
  // NEW — fourth scope alongside current page / visible pages / selected
  // text (the floating toolbar already covers selected text). The parent
  // builds this prompt itself (with full-book extraction + a weak-text
  // fallback), so the prompt function here is unused for this entry —
  // kept only so every QUICK_ACTIONS item has the same shape.
  { label: "📚 Quiz (Entire Book)", scope: "book", prompt: (lang: string) => `Create a quiz covering the entire book. Respond ONLY in: ${lang}.` },
];

// ── Lightweight markdown renderer ────────────────────────────────────
function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (!listItems.length) return;
    elements.push(
      <ul key={`ul-${elements.length}`} style={{ margin: "6px 0", paddingLeft: 18 }}>
        {listItems.map((li, i) => <li key={i} style={{ marginBottom: 3 }}>{inlineFormat(li)}</li>)}
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
        candidates.push({ idx: codeMatch.index, len: codeMatch[0].length, node: <code key={key++} style={{ background:"rgba(255,255,255,0.1)", borderRadius:3, padding:"0 4px", fontSize:"0.9em" }}>{codeMatch[1]}</code> });
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
    if (trimmed === "") { flushList(); elements.push(<div key={`br-${i}`} style={{ height: 8 }} />); continue; }
    if (/^---+$/.test(trimmed)) { flushList(); elements.push(<hr key={`hr-${i}`} style={{ border:"none", borderTop:"1px solid rgba(255,255,255,0.15)", margin:"10px 0" }} />); continue; }
    const hm = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (hm) {
      flushList();
      const sizes = ["1.15em","1.1em","1em","0.95em"];
      elements.push(<div key={`h-${i}`} style={{ fontWeight:700, fontSize:sizes[hm[1].length-1], margin:hm[1].length<=2?"14px 0 6px":"10px 0 4px", color:"#e2d9f3" }}>{inlineFormat(hm[2])}</div>);
      continue;
    }
    const bm = trimmed.match(/^[-*•]\s+(.+)/);
    if (bm) { listItems.push(bm[1]); continue; }
    const nm = trimmed.match(/^\d+\.\s+(.+)/);
    if (nm) { listItems.push(nm[1]); continue; }
    flushList();
    elements.push(<p key={`p-${i}`} style={{ margin:"4px 0", lineHeight:1.7 }}>{inlineFormat(trimmed)}</p>);
  }
  flushList();
  return <>{elements}</>;
}

export default function AICompanion({
  aiResponse, isLoading = false, aiQuestion, setAiQuestion, onAsk, onQuickAction,
  bookTitle = "this book", pageNumber = 1, pageText = "",
  language, onLanguageChange,
  studyHighlights, studyNotes, studyBookmarks,
  onStudyJumpToPage, onStudyDeleteHighlight, onStudyDeleteNote, onStudyDeleteBookmark,
  onStudyGenerateFromHighlight, studyGeneratingId,
}: AICompanionProps) {
  // Outer tab — "companion" is the ENTIRE original component, unchanged.
  // "study" is the new Phase 2 workspace. Nothing inside the "companion"
  // branch below was modified from the original implementation.
  const [outerTab, setOuterTab] = useState<"companion" | "study">("companion");
  const enabledLanguageCodes = useEnabledLanguages();
  const availableLanguages = LANGUAGES.filter(l => enabledLanguageCodes.includes(LANGUAGE_NAME_TO_CODE[l]));

  // ── Layout refinement state ────────────────────────────────────────
  // Shortcuts: collapsed by default — a compact escape hatch to the rest
  // of the app, not something that should compete for space every time.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Quick Actions: expanded by default (per the brief), but the section
  // itself is collapsible and rendered much tighter than before, so the
  // AI response area below it — the thing that should actually get
  // priority — has far more room by default.
  const [quickActionsOpen, setQuickActionsOpen] = useState(true);

  const SHORTCUTS: { href: string; icon: string; label: string }[] = [
    { href: "/", icon: "🏠", label: "Home" },
    { href: "/library", icon: "🏛️", label: "Library" },
    { href: "/my-space", icon: "🧠", label: "My Space" },
    { href: "/my-library", icon: "📚", label: "My Library" },
    { href: "/notes", icon: "📝", label: "Notes" },
    { href: "/revision", icon: "🔄", label: "Revision" },
    { href: "/ai-tutor", icon: "🤖", label: "AI Tutor" },
  ];

  return (
    <div className="flex h-full flex-col p-5">
      {/* Header */}
      <div className="border-b border-white/10 pb-3">
        <h2 className="text-xl font-black">🤖 AI Learning Companion</h2>
        <p className="mt-1 text-[11px] font-semibold text-green-400">Active beside the book</p>
      </div>

      {/* Outer tab bar — Phase 2 addition. Switching tabs never touches
          aiResponse/aiQuestion/language state; the AI Companion tab keeps
          whatever it had exactly as it was. */}
      <div className="mt-3 flex gap-1 rounded-2xl bg-slate-900 p-1">
        <button
          onClick={() => setOuterTab("companion")}
          className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors ${
            outerTab === "companion" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
        >
          🤖 AI Companion
        </button>
        <button
          onClick={() => setOuterTab("study")}
          className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors ${
            outerTab === "study" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
        >
          📚 Study
        </button>
      </div>

      {outerTab === "study" ? (
        <div className="mt-3 flex-1 min-h-0">
          <StudyWorkspace
            bookTitle={bookTitle}
            highlights={studyHighlights}
            notes={studyNotes}
            bookmarks={studyBookmarks}
            onJumpToPage={onStudyJumpToPage}
            onDeleteHighlight={onStudyDeleteHighlight}
            onDeleteNote={onStudyDeleteNote}
            onDeleteBookmark={onStudyDeleteBookmark}
            onGenerateFromHighlight={onStudyGenerateFromHighlight}
            generatingId={studyGeneratingId}
          />
        </div>
      ) : (
      <div className="flex flex-1 min-h-0 flex-col">
      {/* Shortcuts — collapsed by default, tiny footprint when closed.
          Compact escape hatch to the rest of the app from inside the
          Reader, without competing for space with the AI response area. */}
      <div className="mt-2 flex-shrink-0 border-b border-white/10 pb-2">
        <button
          onClick={() => setShortcutsOpen(o => !o)}
          className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-300"
        >
          <span>🔗 Shortcuts</span>
          <span>{shortcutsOpen ? "▾" : "▸"}</span>
        </button>
        {shortcutsOpen && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SHORTCUTS.map(s => (
              <Link
                key={s.href}
                href={s.href}
                className="flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-slate-200 hover:bg-slate-800"
              >
                <span>{s.icon}</span><span>{s.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Language selector — compact single-line row instead of a
          stacked label + full-width select. */}
      <div className="mt-2 flex flex-shrink-0 items-center gap-2 border-b border-white/10 pb-2">
        <label className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Language
        </label>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as Lang)}
          className="flex-1 rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-semibold text-white outline-none"
        >
          {availableLanguages.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Response — gets priority: flex-1 + min-h-0 so it claims all
          space the (now much smaller) sections above/below don't need. */}
      <div className="mt-3 flex-1 min-h-0 overflow-auto">
        <div className="h-full rounded-3xl bg-slate-900 p-4 text-sm text-slate-200">
          {isLoading ? (
            <span className="animate-pulse text-slate-400">AI is thinking…</span>
          ) : (
            <MarkdownBlock text={aiResponse} />
          )}
        </div>
      </div>

      {/* Quick actions — collapsible, tighter 3-column grid, smaller
          buttons. Expanded by default per the brief, but takes
          meaningfully less vertical space than before even when open. */}
      <div className="mt-3 flex-shrink-0 border-t border-white/10 pt-3">
        <button
          onClick={() => setQuickActionsOpen(o => !o)}
          className="mb-2 flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-300"
        >
          <span>Quick Actions</span>
          <span>{quickActionsOpen ? "▾ Collapse" : "▸ Expand"}</span>
        </button>

        {quickActionsOpen && (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_ACTIONS.filter(a => a.scope === "page").map(a => (
                <button key={a.label} disabled={isLoading}
                  onClick={() => onQuickAction(a.label, a.prompt(language), a.scope)}
                  className="rounded-lg bg-slate-900 px-1.5 py-1.5 text-[10px] font-bold leading-tight hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
                  {a.label}
                </button>
              ))}
            </div>

            {/* Entire-book scope — visually distinct since it covers the
                whole book rather than just what's currently on screen. */}
            {QUICK_ACTIONS.filter(a => a.scope === "book").map(a => (
              <button key={a.label} disabled={isLoading}
                onClick={() => onQuickAction(a.label, a.prompt(language), a.scope)}
                className="mt-1.5 w-full rounded-lg bg-purple-700 px-2 py-1.5 text-[10px] font-bold hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed">
                {a.label}
              </button>
            ))}
          </>
        )}

        {/* Ask AI input — stays visible regardless of Quick Actions
            collapse state. */}
        <div className="mt-3 flex gap-2">
          <input
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
            placeholder={`Ask AI in ${language}…`}
            className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-sm text-black outline-none"
          />
          <button onClick={onAsk} disabled={isLoading}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
            Send
          </button>
        </div>
      </div>
      </div>
      )}
    </div>
  );
}

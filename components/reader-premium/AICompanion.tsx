"use client";

import { useState } from "react";
import StudyWorkspace, { RevisionAction } from "./study/StudyWorkspace";
import type { StoredHighlight, StoredNote, StoredBookmark } from "./study/studyData";

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
  onQuickAction: (label: string, prompt: string) => void;
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

const QUICK_ACTIONS = [
  { label: "🧠 Explain",    prompt: (lang: string) => `Explain this page/spread clearly for a student in simple language. Respond ONLY in: ${lang}.` },
  { label: "📝 Summarize",  prompt: (lang: string) => `Summarize this page/spread in at most 8 concise bullet points. Respond ONLY in: ${lang}.` },
  { label: "🌍 Translate",  prompt: (lang: string) => `Rewrite and explain the content of this page/spread in ${lang}. Write entirely in ${lang}. Respond ONLY in: ${lang}.` },
  { label: "❓ Quiz",       prompt: (lang: string) => `Create exactly 5 multiple-choice quiz questions from this page/spread. Respond ONLY in: ${lang}.` },
  { label: "🎴 Flashcards", prompt: (lang: string) => `Create 5 flashcards (FRONT: / BACK: format) from this page/spread. Respond ONLY in: ${lang}.` },
  { label: "📌 Notes",      prompt: (lang: string) => `Create clean, structured study notes from this page/spread. Respond ONLY in: ${lang}.` },
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

  return (
    <div className="flex h-full flex-col p-5">
      {/* Header */}
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-2xl font-black">🤖 AI Learning Companion</h2>
        <p className="mt-1 text-xs font-semibold text-green-400">Active beside the book</p>
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
      <>
      {/* Language selector */}
      <div className="mt-3 border-b border-white/10 pb-3">
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Response Language
        </label>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as Lang)}
          className="w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white outline-none"
        >
          {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Response — single display, no localResponse cache */}
      <div className="mt-4 flex-1 overflow-auto">
        <div className="rounded-3xl bg-slate-900 p-4 text-sm text-slate-200">
          {isLoading ? (
            <span className="animate-pulse text-slate-400">AI is thinking…</span>
          ) : (
            <MarkdownBlock text={aiResponse} />
          )}
        </div>
      </div>

      {/* Quick actions — call parent's runAI via onQuickAction(label, prompt) */}
      <div className="border-t border-white/10 pt-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
          Quick Actions (visible page)
        </p>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map(a => (
            <button key={a.label} disabled={isLoading}
              onClick={() => onQuickAction(a.label, a.prompt(language))}
              className="rounded-2xl bg-slate-900 px-3 py-3 text-xs font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
              {a.label}
            </button>
          ))}
        </div>

        {/* Ask AI input */}
        <div className="mt-4 flex gap-2">
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
      </>
      )}
    </div>
  );
}

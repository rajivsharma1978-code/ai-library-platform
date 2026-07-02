"use client";

import { useState } from "react";

const LANGUAGES = ["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu"] as const;
type Lang = typeof LANGUAGES[number];

type AICompanionProps = {
  aiResponse: string;
  aiQuestion: string;
  setAiQuestion: (v: string) => void;
  onAsk: () => void;
  onQuickAction: (label: string) => void;
  bookTitle?: string;
  pageNumber?: number;
  pageText?: string;
  language: Lang;
  onLanguageChange: (lang: Lang) => void;
};

// ── Lightweight markdown renderer ───────────────────────────────────
// Handles the subset of markdown that AI responses typically produce:
// headings (#/##/###/####), bold (**), italic (*/_), bullets (-/*),
// numbered lists, code blocks, and horizontal rules.
// No external dependency — avoids react-markdown peer-dep issues.
function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: string[] = [];

  function flushList() {
    if (!inList) return;
    elements.push(
      <ul key={`ul-${elements.length}`} style={{ margin: "6px 0", paddingLeft: 18 }}>
        {listItems.map((li, i) => (
          <li key={i} style={{ marginBottom: 3 }}>{inlineFormat(li)}</li>
        ))}
      </ul>
    );
    listItems = [];
    inList = false;
  }

  function inlineFormat(s: string): React.ReactNode {
    // Process **bold**, *italic*, `code` inline
    const parts: React.ReactNode[] = [];
    let remaining = s;
    let key = 0;
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)|_([^_]+?)_/);
      const codeMatch = remaining.match(/`([^`]+?)`/);
      const candidates: Array<{ idx: number; len: number; node: React.ReactNode }> = [];
      if (boldMatch?.index !== undefined)
        candidates.push({ idx: boldMatch.index, len: boldMatch[0].length, node: <strong key={key++}>{boldMatch[1]}</strong> });
      if (italicMatch?.index !== undefined)
        candidates.push({ idx: italicMatch.index, len: italicMatch[0].length, node: <em key={key++}>{italicMatch[1] ?? italicMatch[2]}</em> });
      if (codeMatch?.index !== undefined)
        candidates.push({ idx: codeMatch.index, len: codeMatch[0].length, node: <code key={key++} style={{ background:"rgba(255,255,255,0.1)", borderRadius:3, padding:"0 4px", fontSize:"0.9em" }}>{codeMatch[1]}</code> });
      if (candidates.length === 0) { parts.push(remaining); break; }
      candidates.sort((a, b) => a.idx - b.idx);
      const first = candidates[0];
      if (first.idx > 0) parts.push(remaining.slice(0, first.idx));
      parts.push(first.node);
      remaining = remaining.slice(first.idx + first.len);
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line — flush list, add spacing
    if (trimmed === "") {
      flushList();
      elements.push(<div key={`br-${i}`} style={{ height: 8 }} />);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={`hr-${i}`} style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.15)", margin: "10px 0" }} />);
      continue;
    }

    // Headings (####, ###, ##, #)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const hText = headingMatch[2];
      const sizes = ["1.15em", "1.1em", "1em", "0.95em"];
      elements.push(
        <div key={`h-${i}`} style={{ fontWeight: 700, fontSize: sizes[level - 1], margin: level <= 2 ? "14px 0 6px" : "10px 0 4px", color: "#e2d9f3" }}>
          {inlineFormat(hText)}
        </div>
      );
      continue;
    }

    // Bullet list
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      inList = true;
      listItems.push(bulletMatch[1]);
      continue;
    }

    // Numbered list
    const numMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      if (!inList) { inList = true; }
      listItems.push(numMatch[1]);
      continue;
    }

    // Normal paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} style={{ margin: "4px 0", lineHeight: 1.7 }}>
        {inlineFormat(trimmed)}
      </p>
    );
  }
  flushList();
  return <>{elements}</>;
}

const QUICK_ACTIONS = [
  { label: "🧠 Explain",    prompt: (lang: string) => `Explain this page/spread clearly for a student in simple language. Respond ONLY in: ${lang}.` },
  { label: "📝 Summarize",  prompt: (lang: string) => `Summarize this page/spread in at most 8 concise bullet points. Respond ONLY in: ${lang}.` },
  { label: "🌍 Translate",  prompt: (lang: string) => `Rewrite and explain the content of this page/spread in ${lang}. Write everything in ${lang} script. Respond ONLY in: ${lang}.` },
  { label: "❓ Quiz",       prompt: (lang: string) => `Create exactly 5 multiple-choice quiz questions from this page/spread, each with 4 options and the correct answer marked. Respond ONLY in: ${lang}.` },
  { label: "🎴 Flashcards", prompt: (lang: string) => `Create 5 flashcards from this page/spread. Format each as:\nFRONT: <concept>\nBACK: <explanation>\nRespond ONLY in: ${lang}.` },
  { label: "📌 Notes",      prompt: (lang: string) => `Create clean, structured study notes from this page/spread with headings and bullet points. Respond ONLY in: ${lang}.` },
];

async function callAskAI(question: string, bookTitle: string, pageNumber: number, content: string): Promise<string> {
  const res = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: `[Study Mode: Student] ${question}`,
      book: bookTitle,
      chapter: `Page ${pageNumber}`,
      content,
    }),
  });
  const data = await res.json();
  return data?.answer ?? "No response. Please try again.";
}

export default function AICompanion({
  aiResponse, aiQuestion, setAiQuestion, onAsk, onQuickAction,
  bookTitle = "this book", pageNumber = 1, pageText = "",
  language, onLanguageChange,
}: AICompanionProps) {
  const [loading, setLoading] = useState(false);
  const [localResponse, setLocalResponse] = useState<string | null>(null);

  // localResponse from quick actions takes priority; falls back to
  // parent aiResponse for custom Ask queries. Cleared when Ask is used.
  const displayResponse = localResponse ?? aiResponse;

  const pageContent = pageText?.trim().length > 20
    ? pageText
    : `User is reading page ${pageNumber} of "${bookTitle}". No extracted text — answer based on book context.`;

  async function handleQuickAction(action: typeof QUICK_ACTIONS[number]) {
    onQuickAction(action.label);
    setLocalResponse(null);
    setLoading(true);
    try {
      const result = await callAskAI(action.prompt(language), bookTitle, pageNumber, pageContent);
      setLocalResponse(result);
    } catch {
      setLocalResponse("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleAsk() {
    setLocalResponse(null); // let parent aiResponse show
    onAsk();
  }

  return (
    <div className="flex h-full flex-col p-5">
      {/* Header */}
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-2xl font-black">🤖 AI Learning Companion</h2>
        <p className="mt-1 text-xs font-semibold text-green-400">Active beside the book</p>
      </div>

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
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex-1 overflow-auto">
        <div className="rounded-3xl bg-slate-900 p-4 text-sm text-slate-200">
          {loading ? (
            <span className="animate-pulse text-slate-400">AI is thinking…</span>
          ) : (
            <MarkdownBlock text={displayResponse} />
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="border-t border-white/10 pt-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Quick Actions</p>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((a) => (
            <button key={a.label} onClick={() => handleQuickAction(a)} disabled={loading}
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
            onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
            placeholder={`Ask AI in ${language}…`}
            className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-sm text-black outline-none"
          />
          <button onClick={handleAsk}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

type AICompanionProps = {
  aiResponse: string;
  aiQuestion: string;
  setAiQuestion: (value: string) => void;
  onAsk: () => void;
  onQuickAction: (action: string) => void;
  /** Pass these so quick-action buttons can call the real API */
  bookTitle?: string;
  pageNumber?: number;
  pageText?: string;
};

const QUICK_ACTIONS = [
  { label: "🧠 Explain",     prompt: "Explain this page/spread clearly for a student. Use simple language, short paragraphs, and end with key takeaways." },
  { label: "📝 Summarize",   prompt: "Summarize this page/spread in concise bullet points. No more than 8 bullets." },
  { label: "🌍 Translate",   prompt: "Translate this page/spread content into Hindi. Return only the translated text." },
  { label: "❓ Quiz",        prompt: "Create exactly 5 multiple-choice quiz questions from this page/spread. For each question provide 4 options and mark the correct answer clearly." },
  { label: "🎴 Flashcards",  prompt: "Create 5 flashcards from this page/spread. Format each as:\nFRONT: <concept or question>\nBACK: <explanation or answer>" },
  { label: "📌 Notes",       prompt: "Create clean, structured study notes from this page/spread with headings, bullet points, and important terms highlighted." },
];

async function callAskAI(
  question: string,
  bookTitle: string,
  pageNumber: number,
  pageText: string
): Promise<string> {
  const content = pageText.trim().length > 20
    ? pageText
    : `The user is reading page ${pageNumber} of "${bookTitle}". No extracted text is available — answer based on the book context and the question asked.`;

  const response = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      book: bookTitle,
      chapter: `Page ${pageNumber}`,
      content,
    }),
  });

  const data = await response.json();
  return data?.answer ?? "No response from AI. Please try again.";
}

export default function AICompanion({
  aiResponse,
  aiQuestion,
  setAiQuestion,
  onAsk,
  onQuickAction,
  bookTitle = "this book",
  pageNumber = 1,
  pageText = "",
}: AICompanionProps) {
  const [loading, setLoading] = useState(false);
  const [localResponse, setLocalResponse] = useState<string | null>(null);

  // localResponse takes priority when set (real API result);
  // falls back to parent-controlled aiResponse for custom asks.
  const displayResponse = localResponse ?? aiResponse;

  async function handleQuickAction(action: typeof QUICK_ACTIONS[number]) {
    // Keep old onQuickAction for any parent-level side effects
    onQuickAction(action.label);
    setLocalResponse(null);
    setLoading(true);
    try {
      const result = await callAskAI(
        `[Study Mode: Student] ${action.prompt}`,
        bookTitle,
        pageNumber,
        pageText
      );
      setLocalResponse(result);
    } catch (err) {
      setLocalResponse("Something went wrong. Please try again.");
      console.error("AI quick action error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-5">
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-2xl font-black">🤖 AI Learning Companion</h2>
        <p className="mt-1 text-xs font-semibold text-green-400">
          Active beside the book
        </p>
      </div>

      <div className="mt-5 flex-1 overflow-auto">
        <div className="rounded-3xl bg-slate-900 p-4 text-sm leading-7 text-slate-200 whitespace-pre-wrap">
          {loading ? (
            <span className="animate-pulse text-slate-400">
              AI is thinking...
            </span>
          ) : (
            displayResponse
          )}
        </div>
      </div>

      <div className="border-t border-white/10 pt-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
          Quick Actions
        </p>

        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action)}
              disabled={loading}
              className="rounded-2xl bg-slate-900 px-3 py-3 text-xs font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {action.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setLocalResponse(null);
                onAsk();
              }
            }}
            placeholder="Ask AI about this book..."
            className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-sm text-black outline-none"
          />

          <button
            onClick={() => {
              setLocalResponse(null);
              onAsk();
            }}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

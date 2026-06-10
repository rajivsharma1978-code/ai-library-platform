"use client";

type AICompanionProps = {
  aiResponse: string;
  aiQuestion: string;
  setAiQuestion: (value: string) => void;
  onAsk: () => void;
  onQuickAction: (action: string) => void;
};

export default function AICompanion({
  aiResponse,
  aiQuestion,
  setAiQuestion,
  onAsk,
  onQuickAction,
}: AICompanionProps) {
  const actions = [
    "🧠 Explain",
    "📝 Summarize",
    "🌍 Translate",
    "❓ Quiz",
    "🎴 Flashcards",
    "📌 Notes",
  ];

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
          {aiResponse}
        </div>
      </div>

      <div className="border-t border-white/10 pt-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
          Quick Actions
        </p>

        <div className="grid grid-cols-2 gap-2">
          {actions.map((item) => (
            <button
              key={item}
              onClick={() => onQuickAction(item)}
              className="rounded-2xl bg-slate-900 px-3 py-3 text-xs font-bold hover:bg-blue-600"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAsk();
            }}
            placeholder="Ask AI about this book..."
            className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-sm text-black outline-none"
          />

          <button
            onClick={onAsk}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
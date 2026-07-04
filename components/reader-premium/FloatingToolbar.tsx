"use client";

type FloatingToolbarProps = {
  selectedText: string;
  onExplain: () => void;
  onSummarize: () => void;
  onTranslate: () => void;
  onQuiz: () => void;
  onSaveNote: () => void;
  onClose: () => void;
};

export default function FloatingToolbar({
  selectedText,
  onExplain,
  onSummarize,
  onTranslate,
  onQuiz,
  onSaveNote,
  onClose,
}: FloatingToolbarProps) {
  if (!selectedText.trim()) return null;

  return (
    <div
      // preventDefault on mousedown prevents the browser from collapsing the
      // text selection when user clicks a button in this toolbar.
      // stopPropagation on mouseup prevents the center div's handleMouseUp from
      // running and incorrectly clearing selectedText before actions fire.
      onMouseDown={(e) => e.preventDefault()}
      onMouseUp={(e) => e.stopPropagation()}
      className="fixed left-1/2 top-24 z-[100] -translate-x-1/2 rounded-3xl border border-amber-200 bg-white/95 p-3 shadow-[0_25px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl"
    >
      <div className="mb-2 flex items-center justify-between gap-4 px-2">
        <p className="max-w-[420px] truncate text-xs font-bold text-slate-500">
          Selected: &ldquo;{selectedText}&rdquo;
        </p>
        <button
          onClick={onClose}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 hover:bg-slate-200"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onExplain}
          className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white shadow hover:-translate-y-0.5"
        >
          🧠 Explain
        </button>

        <button
          onClick={onSummarize}
          className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-800 shadow ring-1 ring-slate-200 hover:-translate-y-0.5"
        >
          📝 Summarize
        </button>

        <button
          onClick={onTranslate}
          className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-800 shadow ring-1 ring-slate-200 hover:-translate-y-0.5"
        >
          🌍 Translate
        </button>

        <button
          onClick={onQuiz}
          className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-800 shadow ring-1 ring-slate-200 hover:-translate-y-0.5"
        >
          ❓ Quiz
        </button>

        <button
          onClick={onSaveNote}
          className="rounded-2xl bg-amber-500 px-4 py-3 text-xs font-black text-white shadow hover:-translate-y-0.5"
        >
          📌 Notes
        </button>
      </div>
    </div>
  );
}

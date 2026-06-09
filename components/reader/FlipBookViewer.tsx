"use client";

type FlipBookViewerProps = {
  book: string;
  readerPage: number;
  pdfPages?: string;
  pageImage?: string;
  rightPageImage?: string;
  activeContent: string;
  onPrevious: () => void;
  onNext: () => void;
  onAskAI: (prompt: string) => void;
  onSaveNote: () => void;
};

export default function FlipBookViewer({
  book,
  readerPage,
  pdfPages,
  pageImage,
  rightPageImage,
  activeContent,
  onPrevious,
  onNext,
  onAskAI,
  onSaveNote,
}: FlipBookViewerProps) {
  return (
    <section className="mt-8 rounded-[3rem] bg-gradient-to-br from-[#efe0bd] via-[#fff8e8] to-[#d9b978] p-8 shadow-[0_35px_90px_rgba(92,52,12,0.28)]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-800">
            NDL AI Flipbook Reader
          </p>
          <h2 className="mt-2 text-3xl font-black text-slate-950">{book}</h2>
        </div>

        <div className="rounded-full bg-white/80 px-5 py-2 text-sm font-bold text-slate-700 shadow">
          Pages {readerPage}–{readerPage + 1} {pdfPages ? `of ${pdfPages}` : ""}
        </div>
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="absolute inset-y-10 left-1/2 z-20 w-10 -translate-x-1/2 rounded-full bg-gradient-to-r from-black/10 via-black/25 to-black/10 blur-xl" />

        <div className="grid min-h-[720px] overflow-hidden rounded-[2rem] bg-[#f9efd9] shadow-[0_25px_70px_rgba(65,38,10,0.35)] ring-1 ring-amber-300 lg:grid-cols-2">
          <div className="relative border-r border-amber-200 bg-[#fffaf0] p-8 shadow-inner">
            <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/10 to-transparent" />

            {pageImage ? (
              <img
                src={pageImage}
                alt={`Page ${readerPage}`}
                className="mx-auto h-full max-h-[900px] w-full object-contain rounded-xl"
              />
            ) : (
              <div className="prose prose-lg max-w-none text-slate-800">
                <h3>Page {readerPage}</h3>
                <p>{activeContent.slice(0, 1200)}</p>
              </div>
            )}

            <span className="absolute bottom-5 left-8 text-xs font-bold text-slate-400">
              {readerPage}
            </span>
          </div>

          <div className="relative bg-[#fffaf0] p-8 shadow-inner">
            <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/10 to-transparent" />

            {rightPageImage ? (
              <img
                src={rightPageImage}
                alt={`Page ${readerPage + 1}`}
                className="mx-auto h-full max-h-[900px] w-full object-contain rounded-xl"
              />
            ) : (
              <div className="prose prose-lg max-w-none text-slate-800">
                <h3>AI Reading Companion</h3>
                <p>
                  Select text, ask questions, summarize this spread, translate it,
                  create notes, generate quizzes, or ask AI to explain diagrams and
                  illustrations.
                </p>
                <p>{activeContent.slice(1200, 2200)}</p>
              </div>
            )}

            <span className="absolute bottom-5 right-8 text-xs font-bold text-slate-400">
              {readerPage + 1}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between gap-5">
        <button
          onClick={onPrevious}
          className="rounded-full bg-slate-950 px-7 py-3 text-sm font-black text-white shadow-xl"
        >
          ← Previous Spread
        </button>

        <div className="flex-1">
          <div className="h-3 rounded-full bg-white/80 shadow-inner">
            <div
              className="h-3 rounded-full bg-amber-500"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    (Number(readerPage) / Number(pdfPages || readerPage || 1)) *
                      100
                  )
                )}%`,
              }}
            />
          </div>
        </div>

        <button
          onClick={onNext}
          className="rounded-full bg-blue-600 px-7 py-3 text-sm font-black text-white shadow-xl"
        >
          Next Spread →
        </button>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button onClick={() => onAskAI(`Summarize pages ${readerPage} and ${readerPage + 1}.`)} className="rounded-full bg-white px-5 py-3 text-sm font-bold shadow">
          📝 Spread Summary
        </button>
        <button onClick={() => onAskAI(`Explain this spread in simple language.`)} className="rounded-full bg-white px-5 py-3 text-sm font-bold shadow">
          🧠 Explain
        </button>
        <button onClick={() => onAskAI(`Ask AI to analyze images and diagrams on this spread.`)} className="rounded-full bg-white px-5 py-3 text-sm font-bold shadow">
          🖼️ Analyze Image
        </button>
        <button onClick={() => onAskAI(`Create quiz questions from this spread.`)} className="rounded-full bg-white px-5 py-3 text-sm font-bold shadow">
          ❓ Quiz
        </button>
        <button onClick={onSaveNote} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow">
          📌 Save Note
        </button>
      </div>
    </section>
  );
}
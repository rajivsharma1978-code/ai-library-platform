"use client";

import { useState } from "react";

type FlipBookStageProps = {
  book: string;
  readerPage: number;
  pdfPages?: string;
  leftImage?: string;
  rightImage?: string;
  activeContent: string;
  onPrevious: () => void;
  onNext: () => void;
  onAskAI: (prompt: string) => void;
  onSaveNote: () => void;
};

export default function FlipBookStage({
  book,
  readerPage,
  pdfPages,
  leftImage,
  rightImage,
  activeContent,
  onPrevious,
  onNext,
  onAskAI,
  onSaveNote,
}: FlipBookStageProps) {
  const safePage = Number(readerPage) || 1;
  const [bookOpened, setBookOpened] = useState(false);
  if (!bookOpened) {
    return (
      <div className="mx-auto flex min-h-full max-w-[1500px] flex-col items-center justify-center">
        <div className="relative flex w-full max-w-5xl items-center justify-center rounded-[3rem] bg-[radial-gradient(circle_at_center,#fff8e6_0%,#e7c98b_55%,#b87b32_100%)] p-16 shadow-[0_45px_120px_rgba(84,50,12,0.35)]">
          <div className="absolute bottom-10 h-20 w-[55%] rounded-full bg-black/30 blur-3xl" />
  
          <div className="relative z-10 flex min-h-[620px] w-[430px] flex-col justify-between rounded-r-[2.5rem] rounded-l-xl border border-amber-300 bg-gradient-to-br from-[#12213f] via-[#1d3764] to-[#07111f] p-10 text-white shadow-[25px_35px_70px_rgba(0,0,0,0.45)]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">
                National Digital Library AI
              </p>
  
              <h1 className="mt-10 text-4xl font-black leading-tight">
                {book}
              </h1>
  
              <p className="mt-6 text-sm leading-7 text-blue-100">
                AI-powered reading, understanding, translation, notes, quizzes,
                flashcards, and visual learning support.
              </p>
            </div>
  
            <div>
              <div className="mb-8 h-px bg-white/20" />
  
              <p className="text-sm font-semibold text-amber-200">
                Premium Flipbook Experience
              </p>
  
              <button
                onClick={() => setBookOpened(true)}
                className="mt-6 w-full rounded-2xl bg-amber-400 px-6 py-4 text-sm font-black text-slate-950 shadow-xl transition hover:-translate-y-1 hover:bg-amber-300"
              >
                Open Book →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-[1600px] flex-col">
      {/* Elegant title bar */}
      <header className="mb-4 flex items-center justify-between px-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-amber-700">
            National Digital Library AI
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            {book}
          </h1>
        </div>

        <div className="rounded-full bg-white/80 px-5 py-2 text-sm font-bold text-slate-700 shadow">
          Pages {safePage}–{safePage + 1} {pdfPages ? `of ${pdfPages}` : ""}
        </div>
      </header>

      {/* Book stage */}
      <section className="relative flex-1 rounded-[3rem] bg-[radial-gradient(circle_at_center,#fff8e6_0%,#ead1a0_55%,#c79b55_100%)] px-8 py-7 shadow-[0_45px_120px_rgba(84,50,12,0.32)]">
        {/* Table shadow */}
        <div className="pointer-events-none absolute bottom-7 left-1/2 h-16 w-[78%] -translate-x-1/2 rounded-full bg-black/25 blur-3xl" />

        {/* Open book */}
        <div className="relative mx-auto flex min-h-[640px] max-w-[1380px] overflow-visible">
          {/* left outer cover depth */}
          <div className="absolute -left-5 top-8 h-[92%] w-10 rounded-l-[2rem] bg-gradient-to-r from-[#b78336] to-[#e4c17d] shadow-xl" />

          {/* right outer cover depth */}
          <div className="absolute -right-5 top-8 h-[92%] w-10 rounded-r-[2rem] bg-gradient-to-l from-[#b78336] to-[#e4c17d] shadow-xl" />

          {/* left page */}
          <div className="relative z-10 w-1/2 origin-right rounded-l-[2.2rem] border border-amber-200 bg-[#fffaf0] p-9 shadow-[inset_-18px_0_35px_rgba(80,45,10,0.10),0_25px_45px_rgba(60,35,10,0.20)]">
            <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-black/12 via-black/5 to-transparent" />
            <div className="absolute inset-y-0 left-0 w-10 rounded-l-[2.2rem] bg-gradient-to-r from-white/70 to-transparent" />

            <div className="relative h-full rounded-2xl bg-white/70 p-7 shadow-inner">
              {leftImage ? (
                <img
                  src={leftImage}
                  alt={`Page ${safePage}`}
                  className="mx-auto h-full max-h-[560px] w-full object-contain"
                />
              ) : (
                <div className="h-full">
                  <p className="mb-8 text-xs font-bold uppercase tracking-[0.25em] text-amber-700">
                    Page {safePage}
                  </p>
                  <p className="text-[18px] leading-9 text-slate-800">
                    {activeContent.slice(0, 1200)}
                  </p>
                </div>
              )}

              <span className="absolute bottom-4 left-5 text-xs font-bold text-slate-400">
                {safePage}
              </span>
            </div>
          </div>

          {/* real spine fold */}
          <div className="relative z-20 -mx-5 w-10">
            <div className="absolute inset-y-4 left-1/2 w-8 -translate-x-1/2 rounded-full bg-gradient-to-r from-black/15 via-black/35 to-black/15 blur-xl" />
            <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-black/20" />
          </div>

          {/* right page */}
          <div className="relative z-10 w-1/2 origin-left rounded-r-[2.2rem] border border-amber-200 bg-[#fffaf0] p-9 shadow-[inset_18px_0_35px_rgba(80,45,10,0.10),0_25px_45px_rgba(60,35,10,0.20)]">
            <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-black/12 via-black/5 to-transparent" />
            <div className="absolute inset-y-0 right-0 w-10 rounded-r-[2.2rem] bg-gradient-to-l from-white/70 to-transparent" />

            <div className="relative h-full rounded-2xl bg-white/70 p-7 shadow-inner">
              {rightImage ? (
                <img
                  src={rightImage}
                  alt={`Page ${safePage + 1}`}
                  className="mx-auto h-full max-h-[560px] w-full object-contain"
                />
              ) : (
                <div className="h-full">
                  <p className="mb-8 text-xs font-bold uppercase tracking-[0.25em] text-amber-700">
                    Page {safePage + 1}
                  </p>
                  <p className="text-[18px] leading-9 text-slate-800">
                    {activeContent.slice(1200, 2400) ||
                      "The second page of this spread will appear here when available."}
                  </p>
                </div>
              )}

              <span className="absolute bottom-4 right-5 text-xs font-bold text-slate-400">
                {safePage + 1}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="relative z-30 mt-7 flex items-center justify-between gap-5">
          <button
            onClick={onPrevious}
            className="rounded-full bg-slate-950 px-8 py-3 text-sm font-black text-white shadow-xl transition hover:-translate-y-1"
          >
            ← Previous
          </button>

          <div className="flex-1">
            <div className="h-3 rounded-full bg-white/70 shadow-inner">
              <div
                className="h-3 rounded-full bg-amber-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (safePage / Number(pdfPages || safePage || 1)) * 100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>

          <button
            onClick={onNext}
            className="rounded-full bg-blue-600 px-8 py-3 text-sm font-black text-white shadow-xl transition hover:-translate-y-1"
          >
            Next →
          </button>
        </div>

        {/* Floating AI tools */}
        <div className="relative z-30 mt-5 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => onAskAI(`Summarize pages ${safePage} and ${safePage + 1}.`)}
            className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow"
          >
            📝 Summary
          </button>

          <button
            onClick={() => onAskAI(`Explain this spread in simple language.`)}
            className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow"
          >
            🧠 Explain
          </button>

          <button
            onClick={() => onAskAI(`Translate this spread into Hindi.`)}
            className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow"
          >
            🌍 Translate
          </button>

          <button
            onClick={() => onAskAI(`Analyze images, charts, diagrams and illustrations on this spread.`)}
            className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow"
          >
            🖼️ Analyze Image
          </button>

          <button
            onClick={() => onAskAI(`Create quiz questions from this spread.`)}
            className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow"
          >
            ❓ Quiz
          </button>

          <button
            onClick={onSaveNote}
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow"
          >
            📌 Save Note
          </button>
        </div>
      </section>
    </div>
  );
}
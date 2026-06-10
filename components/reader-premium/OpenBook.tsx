"use client";

type OpenBookProps = {
  title: string;
  leftPageTitle?: string;
  rightPageTitle?: string;
  leftText: string;
  rightText: string;
  pageNumber: number;
  totalPages?: string;
  onPrevious: () => void;
  onNext: () => void;
};

export default function OpenBook({
  title,
  leftPageTitle = "Page",
  rightPageTitle = "Page",
  leftText,
  rightText,
  pageNumber,
  totalPages = "120",
  onPrevious,
  onNext,
}: OpenBookProps) {
  const safePage = Number(pageNumber) || 1;

  return (
    <section className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_center,#fff8e8_0%,#ead2a6_50%,#c18a3f_100%)] px-8 py-6">
      <header className="mx-auto mb-5 flex w-full max-w-[1500px] items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-800">
            National Digital Library AI
          </p>
          <h1 className="mt-1 text-3xl font-black text-slate-950">{title}</h1>
        </div>

        <div className="rounded-full bg-white/80 px-5 py-2 text-sm font-bold text-slate-700 shadow">
          Pages {safePage}–{safePage + 1} of {totalPages}
        </div>
      </header>

      <div className="relative mx-auto flex w-full max-w-[1450px] flex-1 items-center justify-center">
        <div className="absolute bottom-8 h-20 w-[72%] rounded-full bg-black/30 blur-3xl" />

        <div className="relative z-10 flex min-h-[650px] w-full max-w-[1320px]">
          <div className="absolute -left-6 top-10 h-[88%] w-12 rounded-l-[2.5rem] bg-gradient-to-r from-[#9b642b] to-[#e5bd75] shadow-2xl" />
          <div className="absolute -right-6 top-10 h-[88%] w-12 rounded-r-[2.5rem] bg-gradient-to-l from-[#9b642b] to-[#e5bd75] shadow-2xl" />

          <article className="relative w-1/2 rounded-l-[2.5rem] border border-amber-200 bg-[#fffaf0] p-10 shadow-[inset_-24px_0_40px_rgba(73,43,10,0.14),0_30px_70px_rgba(75,45,12,0.28)]">
            <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-black/14 via-black/5 to-transparent" />
            <div className="relative h-full rounded-2xl bg-white/65 p-9 shadow-inner">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-700">
                {leftPageTitle} {safePage}
              </p>

              <p className="mt-10 text-lg leading-9 text-slate-800">
                {leftText}
              </p>

              <span className="absolute bottom-5 left-6 text-xs font-bold text-slate-400">
                {safePage}
              </span>
            </div>
          </article>

          <div className="relative z-20 -mx-4 w-8">
            <div className="absolute inset-y-4 left-1/2 w-10 -translate-x-1/2 rounded-full bg-gradient-to-r from-black/10 via-black/35 to-black/10 blur-xl" />
            <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-black/20" />
          </div>

          <article className="relative w-1/2 rounded-r-[2.5rem] border border-amber-200 bg-[#fffaf0] p-10 shadow-[inset_24px_0_40px_rgba(73,43,10,0.14),0_30px_70px_rgba(75,45,12,0.28)]">
            <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-black/14 via-black/5 to-transparent" />
            <div className="relative h-full rounded-2xl bg-white/65 p-9 shadow-inner">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-700">
                {rightPageTitle} {safePage + 1}
              </p>

              <p className="mt-10 text-lg leading-9 text-slate-800">
                {rightText}
              </p>

              <span className="absolute bottom-5 right-6 text-xs font-bold text-slate-400">
                {safePage + 1}
              </span>
            </div>
          </article>
        </div>
      </div>

      <footer className="mx-auto mt-5 flex w-full max-w-[1300px] items-center justify-between gap-5">
        <button
          onClick={onPrevious}
          className="rounded-full bg-slate-950 px-8 py-3 text-sm font-black text-white shadow-xl"
        >
          ← Previous
        </button>

        <div className="flex-1">
          <div className="h-3 rounded-full bg-white/75 shadow-inner">
            <div
              className="h-3 rounded-full bg-amber-500"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((safePage / Number(totalPages || safePage)) * 100)
                )}%`,
              }}
            />
          </div>
        </div>

        <button
          onClick={onNext}
          className="rounded-full bg-blue-600 px-8 py-3 text-sm font-black text-white shadow-xl"
        >
          Next →
        </button>
      </footer>
    </section>
  );
}
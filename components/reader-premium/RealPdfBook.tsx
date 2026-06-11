"use client";

type RealPdfBookProps = {
  title: string;
  pdfPath: string;
  pageNumber: number;
  totalPages: string;
  onPrevious: () => void;
  onNext: () => void;
};

export default function RealPdfBook({
  title,
  pdfPath,
  pageNumber,
  totalPages,
  onPrevious,
  onNext,
}: RealPdfBookProps) {
  const safePage = Number(pageNumber) || 1;

  return (
    <section className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_center,#fff8e8_0%,#ead2a6_50%,#c18a3f_100%)] px-8 py-6">
      <header className="mx-auto mb-5 flex w-full max-w-[1500px] items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-800">
            National Digital Library AI
          </p>
          <h1 className="mt-1 text-3xl font-black text-slate-950">
            {title}
          </h1>
        </div>

        <div className="rounded-full bg-white/80 px-5 py-2 text-sm font-bold text-slate-700 shadow">
          Pages {safePage} of {totalPages}
        </div>
      </header>

      <div className="relative mx-auto flex w-full max-w-[1300px] flex-1 items-center justify-center rounded-[3rem] bg-gradient-to-br from-[#ead6aa] via-[#fff7e6] to-[#cda96b] p-6 shadow-[0_40px_100px_rgba(80,45,10,0.30)]">
        <iframe
          src={`${pdfPath}#page=${safePage}&toolbar=0&navpanes=0`}
          className="h-[78vh] w-full rounded-[2rem] border border-amber-200 bg-white shadow-2xl"
          title={title}
        />
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
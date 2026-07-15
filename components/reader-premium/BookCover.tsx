"use client";

import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type BookCoverProps = {
  title: string;
  subtitle?: string;
  author?: string;
  description?: string;
  onOpen: () => void;
};

export default function BookCover({
  title,
  // "National Digital Library AI" is product branding — deliberately not
  // routed through UI_TEXT, same as the "NDL AI" mark in ReaderNav.
  subtitle = "National Digital Library AI",
  onOpen,
  author,
  description,
}: BookCoverProps) {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const resolvedAuthor = author ?? t.premiumReaderCoverAuthorDefault;
  const resolvedDescription = description ?? t.premiumReaderCoverDescriptionDefault;
  return (
    <section className="flex h-full min-h-[720px] items-center justify-center bg-[radial-gradient(circle_at_center,#fff7df_0%,#ead0a0_52%,#b9823d_100%)] px-8 py-10">
      <button
        onClick={onOpen}
        className="group relative cursor-pointer outline-none transition-all duration-700 hover:-translate-y-4 hover:scale-105 active:scale-95"
      >
        <div className="absolute -bottom-12 left-1/2 h-24 w-[420px] -translate-x-1/2 rounded-full bg-black/35 blur-3xl transition group-hover:w-[500px] group-hover:bg-black/45" />

        <div className="relative min-h-[620px] w-[430px] max-w-full rounded-r-[2.8rem] rounded-l-xl border border-amber-300 bg-gradient-to-br from-[#0d1b35] via-[#183763] to-[#06101f] p-10 text-left text-white shadow-[28px_36px_80px_rgba(0,0,0,0.48)] transition-all duration-700 group-hover:-rotate-2 group-hover:-translate-y-6 group-hover:shadow-[45px_60px_120px_rgba(0,0,0,0.65)]">
          <div className="absolute inset-y-0 left-6 w-2 rounded-full bg-white/10" />
          <div className="absolute inset-y-0 right-0 w-14 rounded-r-[2.8rem] bg-gradient-to-l from-black/35 to-transparent" />

          <div className="relative z-10 flex min-h-full flex-col justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.38em] text-amber-300">
                {subtitle}
              </p>

              <div className="mt-16 h-px w-24 bg-amber-300/70" />

              <h1 className="mt-10 line-clamp-3 text-4xl font-black leading-tight tracking-tight">
                {title}
              </h1>

              <p className="mt-8 line-clamp-5 max-w-sm text-lg leading-9 text-blue-100">
  {resolvedDescription}
</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-amber-200">{resolvedAuthor}</p>

              <div className="mt-10 flex flex-col items-center">
  <div className="h-px w-40 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />

  <p className="mt-5 text-xs font-black uppercase tracking-[0.35em] text-amber-200">
    {t.premiumReaderCoverCta}
  </p>

  <div className="mt-5 h-px w-40 bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
</div> 
            </div>
          </div>
        </div>
      </button>
    </section>
  );
}
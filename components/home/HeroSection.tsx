"use client";

import Link from "next/link";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export function HeroSection() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const chips = ["UPSC", "NCERT", t.chipScience, t.chipHistory, "AI", t.chipEngineering, t.chipPsychology];

  return (
    <section className="px-4 pt-0 sm:px-6">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[1.75rem] border border-orange-100 bg-[#fff8ed] shadow-2xl sm:rounded-[2.5rem]">
        <div className="grid min-h-0 grid-cols-1 lg:min-h-[430px] lg:grid-cols-[0.82fr_1.18fr]">
          <div className="relative z-10 px-5 py-7 sm:px-9 lg:px-10 lg:py-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-white/85 px-4 py-1.5 text-[13px] font-bold text-green-700 shadow-sm sm:px-5 sm:py-2 sm:text-sm">
              <span>🇮🇳</span>
              {t.heroKicker}
            </div>

            <h1 className="mt-4 text-[30px] font-black leading-[1.05] tracking-tight text-slate-950 sm:mt-5 sm:text-[40px] lg:text-[56px]">
              {t.heroH1Line1}
              <br />
              {t.heroH1Line2}
              <br />
              <span className="text-orange-600">{t.heroH1Line3}</span>
            </h1>

            {/* poweredByAI is a second, shorter tagline directly under
                readUnderstandRevise — on phones the two together just added
                stacked height without adding meaning, so only the more
                distinctive line ("Read. Understand. Revise. Master.") shows
                below the fold-critical viewport; both show together from
                `sm` up where the extra line is free real estate, not cost. */}
            <p className="mt-3 hidden text-xl font-semibold text-slate-900 sm:mt-4 sm:block">
              {t.poweredByAI} ✨
            </p>

            <p className="mt-3 text-[15px] font-semibold text-slate-800 sm:mt-1 sm:text-base">
              {t.readUnderstandRevise}
            </p>

            <p className="mt-2.5 max-w-xl text-sm leading-6 text-slate-600 sm:mt-3">
              {t.heroDesc}
            </p>

            {/* CTA hierarchy: Primary = Start AI Tutor, Secondary = Explore
                Library, Tertiary = Upload PDF — reflected in visual weight
                at every size. Mobile: the two real destinations get full-
                width one-thumb rows; Upload PDF drops to a plain text link
                instead of a third equal-weight button, so the hierarchy
                reads instantly instead of presenting three peers. Desktop
                keeps the original inline row. */}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <Link
                href="/ai-tutor"
                className="flex min-h-[48px] items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-[15px] font-bold text-white shadow-md shadow-orange-500/25 transition active:scale-[0.98] hover:-translate-y-1 hover:bg-orange-700 sm:justify-start sm:text-sm"
              >
                🤖 {t.heroAiTutor}
              </Link>

              <Link
                href="/library"
                className="flex min-h-[48px] items-center justify-center rounded-xl bg-white px-5 py-3 text-[15px] font-bold text-slate-800 shadow-md ring-1 ring-slate-200 transition active:scale-[0.98] hover:-translate-y-1 hover:bg-slate-50 sm:justify-start sm:text-sm"
              >
                📚 {t.heroExplore}
              </Link>

              <Link
                href="/read"
                className="flex min-h-[44px] items-center justify-center gap-1.5 text-[13.5px] font-semibold text-slate-500 transition hover:text-slate-800 sm:min-h-0 sm:rounded-xl sm:px-3 sm:py-3 sm:text-sm sm:hover:bg-slate-50"
              >
                📄 {t.uploadPdf}
              </Link>
            </div>
          </div>

          <div className="relative hidden min-h-[430px] lg:block">
            <img
              src="/hero-artwork.png"
              alt={t.heroArtworkAlt}
              className="absolute inset-0 h-full w-full object-contain object-center"
            />
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#fff8ed] to-transparent" />
          </div>
        </div>
      </div>

      <div className="relative z-20 mx-auto -mt-4 max-w-6xl rounded-3xl border border-orange-100 bg-white p-2.5 shadow-xl sm:-mt-5 sm:p-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="pl-2.5 text-xl sm:pl-4">🔍</span>
          <input
            type="text"
            placeholder={t.heroSearchPlaceholder}
            className="h-11 flex-1 min-w-0 border-none bg-transparent text-[15px] outline-none placeholder:text-slate-400 sm:text-base"
          />
          <button className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-md transition active:scale-95 hover:bg-orange-700">
            🔎
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 px-2.5 pb-1 sm:gap-3 sm:px-4">
          <span className="text-xs font-bold uppercase text-orange-600">
            {t.popular}
          </span>
          {chips.map((chip) => (
            <button
              key={chip}
              className="min-h-[38px] rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 transition active:scale-95 hover:bg-orange-100 hover:text-orange-700"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const chips = ["UPSC", "NCERT", "Science", "History", "AI", "Engineering", "Psychology"];

export function HeroSection() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const isEn = t.navLibrary === "Library";

  return (
    <section className="px-6 pt-0">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] border border-orange-100 bg-[#fff8ed] shadow-2xl">
        <div className="grid min-h-[430px] grid-cols-1 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="relative z-10 px-9 py-7 lg:px-10 lg:py-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-white/85 px-5 py-2 text-sm font-bold text-green-700 shadow-sm">
              <span>🇮🇳</span>
              {t.heroKicker}
            </div>

            <h1 className="mt-5 text-[40px] font-black leading-[1.02] tracking-tight text-slate-950 lg:text-[56px]">
              {t.heroH1Line1}
              <br />
              {t.heroH1Line2}
              <br />
              <span className="text-orange-600">{t.heroH1Line3}</span>
            </h1>

            <p className="mt-4 text-xl font-semibold text-slate-900">
              {t.poweredByAI} ✨
            </p>

            <p className="mt-1 text-base font-semibold text-slate-800">
              {t.readUnderstandRevise}
            </p>

            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              {t.heroDesc}
            </p>

            {/* CTA hierarchy: Primary = Start AI Tutor, Secondary = Explore
                Library, Tertiary = Upload PDF. Order and visual weight both
                reflect that priority now (previously Explore was first/
                filled and AI Tutor was second/outlined — reversed here —
                and AI Tutor pointed at the dead /reader route). */}
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/ai-tutor"
                className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-orange-500/25 transition hover:-translate-y-1 hover:bg-orange-700"
              >
                🤖 {isEn ? "Start AI Tutor" : "एआई ट्यूटर शुरू करें"}
              </Link>

              <Link
                href="/library"
                className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-800 shadow-md ring-1 ring-slate-200 transition hover:-translate-y-1 hover:bg-slate-50"
              >
                📚 {isEn ? "Explore Library" : "लाइब्रेरी देखें"}
              </Link>

              <Link
                href="/read"
                className="rounded-xl px-5 py-3 text-sm font-bold text-slate-500 transition hover:text-slate-800 hover:bg-slate-50"
              >
                📄 {isEn ? "Upload PDF" : "पीडीएफ अपलोड करें"}
              </Link>
            </div>
          </div>

          <div className="relative hidden min-h-[430px] lg:block">
            <img
              src="/hero-artwork.png"
              alt="Diverse learners connected by AI through books"
              className="absolute inset-0 h-full w-full object-contain object-center"
            />
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#fff8ed] to-transparent" />
          </div>
        </div>
      </div>

      <div className="relative z-20 mx-auto -mt-5 max-w-6xl rounded-3xl border border-orange-100 bg-white p-3 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="pl-4 text-xl">🔍</span>
          <input
            type="text"
            placeholder={t.heroSearchPlaceholder}
            className="h-11 flex-1 border-none bg-transparent text-base outline-none placeholder:text-slate-400"
          />
          <button className="h-10 w-10 rounded-xl bg-orange-600 text-white shadow-md transition hover:bg-orange-700">
            🔎
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 px-4 pb-1">
          <span className="text-xs font-bold uppercase text-orange-600">
            {t.popular}
          </span>
          {chips.map((chip) => (
            <button
              key={chip}
              className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-orange-100 hover:text-orange-700"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

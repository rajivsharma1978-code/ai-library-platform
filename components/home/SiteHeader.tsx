"use client";

import { UI_TEXT, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export function SiteHeader() {
  const { language, setLanguage } = useLanguage();
  const t = UI_TEXT[language];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-ndl-navy text-sm font-bold text-ndl-gold shadow-sm"
            aria-hidden
          >
            NDL
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-ndl-navy">{t.siteName}</p>
            <p className="text-xs text-slate-500">{t.government}</p>
          </div>
        </div>
        <nav
          className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex"
          aria-label="Main navigation"
        >
          <a href="#catalog" className="transition hover:text-ndl-navy">
            {t.catalog}
          </a>
          <a href="#tutors" className="transition hover:text-ndl-navy">
            {t.aiTutors}
          </a>
          <a href="#recommendations" className="transition hover:text-ndl-navy">
            {t.forYou}
          </a>
          <a href="#stats" className="transition hover:text-ndl-navy">
            {t.insights}
          </a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 sm:text-sm">
            <span className="hidden sm:inline">{t.language}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="bg-transparent text-slate-700 outline-none"
              aria-label={t.language}
            >
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
            </select>
          </label>
          <button
            type="button"
            className="hidden rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
          >
            {t.signIn}
          </button>
          <button
            type="button"
            className="rounded-lg bg-ndl-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-ndl-navy-light"
          >
            {t.register}
          </button>
        </div>
      </div>
    </header>
  );
}

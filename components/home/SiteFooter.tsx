"use client";

import Link from "next/link";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export function SiteFooter() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  return (
    <footer className="bg-[#1a0f05] text-stone-400">
      {/* Saffron top accent */}
      <div className="h-1 bg-[#C85A00]" />
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#C85A00]">
                <svg viewBox="0 0 28 28" fill="none" width="18" height="18">
                  <circle cx="14" cy="14" r="11" stroke="#C85A00" strokeWidth="1.5"/>
                  <circle cx="14" cy="14" r="4" fill="#C85A00"/>
                  <line x1="14" y1="3" x2="14" y2="25" stroke="#C85A00" strokeWidth="1" opacity="0.5"/>
                  <line x1="3" y1="14" x2="25" y2="14" stroke="#C85A00" strokeWidth="1" opacity="0.5"/>
                </svg>
              </div>
              <p className="text-base font-light text-stone-200"
                style={{ fontFamily: "var(--font-cormorant), serif" }}>
                {t.siteName}
              </p>
            </div>
            <p className="text-xs leading-relaxed text-stone-500">{t.footerDesc}</p>
            <p className="mt-4 text-[9px] uppercase tracking-widest text-stone-600">{t.government}</p>
            <p className="mt-2 text-[9px] uppercase tracking-widest text-[#C85A00]">{t.footerFree}</p>
          </div>
          <div>
            <p className="mb-4 text-[9px] uppercase tracking-widest text-stone-500">{t.footerResources}</p>
            <ul className="space-y-2.5 text-xs">
              {[
                [t.footerLibraryCatalog, "/library"],
                [t.footerResearchTools, "/library"],
                [t.footerAiTutor, "/reader"],
                [t.footerAccessibility, "/"],
              ].map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="text-stone-500 transition hover:text-[#C85A00]">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-4 text-[9px] uppercase tracking-widest text-stone-500">{t.footerSupport}</p>
            <ul className="space-y-2.5 text-xs">
              {[t.footerHelpCentre, t.footerPrivacy, t.footerTerms, t.footerFeedback].map(link => (
                <li key={link}><a href="#" className="text-stone-500 transition hover:text-[#C85A00]">{link}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-4 text-[9px] uppercase tracking-widest text-stone-500">{t.footerContact}</p>
            <p className="text-xs leading-relaxed text-stone-500">help@ndl.gov.in<br />1800-XXX-XXXX</p>
            <Link href="/admin-login"
              className="mt-5 inline-block rounded-sm border border-[#C85A00]/30 bg-[#C85A00]/10 px-4 py-2 text-[9px] uppercase tracking-widest text-[#C85A00] transition hover:bg-[#C85A00]/20">
              Admin Portal
            </Link>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-stone-800 pt-8 text-[9px] uppercase tracking-widest text-stone-600 sm:flex-row sm:items-center">
          <p>{t.footerCopy}</p>
          <p className="border border-stone-700 px-3 py-1">{t.footerBadge}</p>
        </div>
      </div>
    </footer>
  );
}

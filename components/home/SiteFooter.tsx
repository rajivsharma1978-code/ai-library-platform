"use client";

import Link from "next/link";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export function SiteFooter() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const LINKS = {
    [t.footerResources]: [[t.navLibrary,"/library"],[t.navAiTutor,"/ai-tutor"],[t.readerBadge,"/read"],[t.navExplore,"/explore"],[t.myLibraryTitle,"/my-library"],[t.navMySpace,"/my-space"]],
    [t.footerLearning]:  [[t.navNotes,"/notes"],[t.commonFlashcards,"/flashcards"],[t.footerQuizGenerator,"/quiz"],[t.footerRevisionHub,"/revision"],[t.footerAiSummaries,"/ai-tutor"]],
    [t.footerCompany]:   [[t.footerAboutUs,"/"],[t.footerCareers,"/"],[t.footerPress,"/"],[t.footerBlog,"/"],[t.footerContactUs,"/"]],
    [t.footerSupport]:   [[t.footerHelpCentre,"/"],[t.footerPrivacy,"/"],[t.footerTerms,"/"],[t.footerAccessibility,"/"]],
  };

  return (
    <footer className="bg-white border-t border-gray-100">
      <div className="mx-auto max-w-[1200px] px-6 py-14">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-10">

          {/* Brand — 2 cols */}
          <div className="col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-full border-2 border-orange-500 bg-orange-50 flex items-center justify-center">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                  <circle cx="12" cy="12" r="8" stroke="#f97316" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="3" fill="#f97316"/>
                  <line x1="12" y1="4" x2="12" y2="20" stroke="#f97316" strokeWidth="1.2" opacity="0.5"/>
                  <line x1="4" y1="12" x2="20" y2="12" stroke="#f97316" strokeWidth="1.2" opacity="0.5"/>
                </svg>
              </div>
              <div>
                <div className="text-[14px] font-extrabold text-gray-900">NDL AI</div>
                <div className="text-[10px] text-gray-400 leading-tight">{t.siteName}<br/>{t.government}</div>
              </div>
            </div>
            <p className="text-[13px] text-gray-500 leading-relaxed mb-5">{t.footerDesc}</p>
            <div className="flex items-center gap-2.5">
              {[["𝕏","#"],["f","#"],["▶","#"],["in","#"]].map(([icon,href])=>(
                <a key={icon} href={href}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[12px] font-bold text-gray-500 hover:bg-orange-50 hover:text-orange-500 hover:border-orange-200 transition-all">
                  {icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {(Object.entries(LINKS) as [string,[string,string][]][]).map(([heading,links])=>(
            <div key={heading}>
              <p className="text-[13px] font-extrabold text-gray-900 mb-4">{heading}</p>
              <ul className="space-y-2.5">
                {links.map(([label,href])=>(
                  <li key={label}>
                    <Link href={href} className="text-[13px] text-gray-500 hover:text-orange-500 transition-colors">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Get the App */}
          <div>
            <p className="text-[13px] font-extrabold text-gray-900 mb-4">{t.footerGetTheApp}</p>
            <div className="space-y-2.5">
              {[["▶","Google Play"],["🍎","App Store"]].map(([icon,label])=>(
                <a key={String(label)} href="#"
                  className="flex items-center gap-2.5 rounded-xl border border-gray-200 px-3.5 py-2.5 hover:border-orange-300 hover:bg-orange-50 transition-all">
                  <span className="text-xl flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-[9px] text-gray-400 leading-none">{t.footerDownloadOnThe}</p>
                    <p className="text-[13px] font-bold text-gray-800 leading-tight mt-0.5">{label}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[12.5px] text-gray-400">{t.footerCopy}</p>
          <div className="flex items-center gap-3">
            <p className="text-[12.5px] text-gray-400 flex items-center gap-1">{t.footerMadeWith} <span className="text-red-500 text-base">❤</span> {t.footerInIndia}</p>
            <span className="h-3 w-px bg-gray-200" aria-hidden="true" />
            <Link href="/admin-login" className="text-[12.5px] font-semibold text-gray-600 hover:text-orange-500 transition-colors">{t.adminConsoleLabel}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

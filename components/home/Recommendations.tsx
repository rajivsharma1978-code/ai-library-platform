"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { usePublicCatalog, type CatalogBook } from "@/lib/catalog";
import RealBookCover from "./RealBookCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type DirectorBook = CatalogBook;
interface ReadingProgressEntry { bookId: string; currentPage: number; totalPages: number; lastReadAt: number; [k: string]: any }


function readReadingProgress(): ReadingProgressEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("ndl_reading_progress");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function bookTotalPages(book?: DirectorBook): number {
  const n = Number(book?.pages);
  return Number.isFinite(n) && n > 0 ? n : 220;
}

export function Recommendations() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const books = usePublicCatalog();

  const TESTIMONIALS = [
    { initials:"AS", color:"bg-orange-500", quote: t.testimonial1Quote, name:"Ananya Singh", role: t.testimonial1Role },
    { initials:"RV", color:"bg-blue-500",   quote: t.testimonial2Quote, name:"Rohit Verma",  role: t.testimonial2Role },
    { initials:"NP", color:"bg-green-500",  quote: t.testimonial3Quote, name:"Neha Patel",   role: t.testimonial3Role },
  ];

  const [mounted, setMounted] = useState(false);
  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);
  useEffect(() => { setProgress(readReadingProgress()); setMounted(true); }, []);

  // Real progress if it exists; otherwise a plausible demo spread across
  // the real catalog — never the old fictional book list.
  const continueReading = (() => {
    if (progress.length > 0) {
      return [...progress]
        .sort((a, b) => b.lastReadAt - a.lastReadAt)
        .slice(0, 3)
        .map(p => {
          const book = books.find(b => b.id === p.bookId);
          if (!book) return null;
          const total = p.totalPages || bookTotalPages(book);
          return { book, pct: Math.min(100, Math.round((p.currentPage / Math.max(1, total)) * 100)) };
        })
        .filter((x): x is { book: DirectorBook; pct: number } => !!x);
    }
    const demoPercents = [72, 45, 88];
    return books.slice(0, 3).map((book, i) => ({ book, pct: demoPercents[i] ?? 50 }));
  })();
  const usingDemoProgress = mounted && progress.length === 0;

  return (
    <section id="recommendations" className="bg-white border-b border-gray-100">

      {/* Continue Reading — the actionable, personalized section, so it
          leads; static testimonial copy follows rather than gating it. */}
      <div className="py-9 sm:py-12">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="flex items-center justify-between mb-5 sm:mb-6">
            <div className="flex items-center gap-2">
              <h2 className="text-[18px] font-extrabold text-gray-900 sm:text-[20px]">{t.continueReading}</h2>
              {usingDemoProgress && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                  {t.demoTagLabel}
                </span>
              )}
            </div>
            <Link href="/my-library" className="text-[13px] font-semibold text-orange-500 hover:text-orange-600">{t.viewAll} →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {continueReading.map(({ book, pct }, i) => (
              <motion.div key={book.id}
                initial={{opacity:0,y:10}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
                transition={{delay:i*0.07}}
                className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-orange-200 hover:shadow-md">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-12 h-16 rounded-xl overflow-hidden shadow bg-gray-100">
                    <RealBookCover book={book} className="h-full w-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 truncate group-hover:text-orange-500 transition-colors">{book.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{book.author}</p>
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>{t.progressLabel}</span><span>{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full" style={{width:`${pct}%`}}/>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Two clear reading choices, per the site-wide requirement */}
                <div className="mt-3 flex gap-2">
                  <Link href={`/read?book=${book.id}`}
                    className="flex min-h-[40px] flex-1 items-center justify-center rounded-lg bg-slate-100 px-2 text-center text-[11px] font-bold text-slate-700 transition active:scale-[0.97] hover:bg-slate-200">
                    📖 {t.bookActionReadNormally}
                  </Link>
                  <Link href={`/reader-premium?book=${book.id}`}
                    className="flex min-h-[40px] flex-1 items-center justify-center rounded-lg bg-purple-600 px-2 text-center text-[11px] font-bold text-white transition active:scale-[0.97] hover:bg-purple-700">
                    🤖 {t.navAiTutor}
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Testimonials — a light horizontal strip of compact quote chips
          instead of three full-width cards stacked to their own screenful.
          Same carousel language as Director Collection above, so the two
          horizontal-scroll moments on this page feel like one consistent
          pattern rather than two different UI idioms. */}
      <div className="py-9 border-t border-gray-100 sm:py-12">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <h2 className="text-[18px] font-extrabold text-gray-900 mb-5 sm:text-[20px] sm:mb-6">{t.whatLearnersSay}</h2>
          <div
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {TESTIMONIALS.map((item, i) => (
              <motion.div key={item.name}
                initial={{opacity:0,y:12}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
                transition={{duration:0.35,delay:i*0.06}}
                className="w-[78%] flex-shrink-0 snap-start rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:w-[300px]">
                <p className="text-[13.5px] text-gray-700 leading-relaxed italic mb-4">"{item.quote}"</p>
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full ${item.color} flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0`}>
                    {item.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-bold text-gray-900 truncate">{item.name}</p>
                    <p className="text-[10.5px] text-gray-400 truncate">{item.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

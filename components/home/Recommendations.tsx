"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { directorBooks } from "@/lib/directorBooks";
import RealBookCover from "./RealBookCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type DirectorBook = { id: string; title: string; author?: string; pages?: number | string; [k: string]: any };
interface ReadingProgressEntry { bookId: string; currentPage: number; totalPages: number; lastReadAt: number; [k: string]: any }

const TESTIMONIALS = [
  { initials:"AS", color:"bg-orange-500",
    quote:"NDL AI has completely changed the way I study. The AI tutor is amazing!",
    name:"Ananya Singh", role:"UPSC Aspirant" },
  { initials:"RV", color:"bg-blue-500",
    quote:"I can now learn in my mother tongue and understand concepts better.",
    name:"Rohit Verma", role:"College Student" },
  { initials:"NP", color:"bg-green-500",
    quote:"The best digital learning platform I have ever used.",
    name:"Neha Patel", role:"School Teacher" },
];

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
  const isEn = t.navLibrary === "Library";
  const books = directorBooks as DirectorBook[];

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

      {/* Testimonials — unchanged, not book-data related */}
      <div className="py-12 border-b border-gray-100">
        <div className="mx-auto max-w-[1200px] px-6">
          <h2 className="text-[20px] font-extrabold text-gray-900 mb-8">{t.whatLearnersSay}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TESTIMONIALS.map((item, i) => (
              <motion.div key={item.name}
                initial={{opacity:0,y:16}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
                transition={{duration:0.4,delay:i*0.08}}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <p className="text-[14px] text-gray-700 leading-relaxed italic mb-5">"{item.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${item.color} flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0`}>
                    {item.initials}
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-gray-900">{item.name}</p>
                    <p className="text-[11px] text-gray-400">{item.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="flex justify-center gap-1.5 mt-7">
            <div className="w-5 h-2 rounded-full bg-orange-500"/>
            <div className="w-2 h-2 rounded-full bg-gray-200"/>
            <div className="w-2 h-2 rounded-full bg-gray-200"/>
          </div>
        </div>
      </div>

      {/* Continue Reading — now the REAL catalog + REAL progress */}
      <div className="py-12">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <h2 className="text-[20px] font-extrabold text-gray-900">{t.continueReading}</h2>
              {usingDemoProgress && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                  {isEn ? "demo" : "डेमो"}
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
                className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-orange-200 transition-all">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-12 h-16 rounded-xl overflow-hidden shadow bg-gray-100">
                    <RealBookCover book={book} className="h-full w-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 truncate group-hover:text-orange-500 transition-colors">{book.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{book.author}</p>
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>{isEn ? "Progress" : "प्रगति"}</span><span>{pct}%</span>
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
                    className="flex-1 rounded-lg bg-slate-100 px-2 py-1.5 text-center text-[11px] font-bold text-slate-700 hover:bg-slate-200">
                    📖 {isEn ? "Read Normally" : "सामान्य रूप से पढ़ें"}
                  </Link>
                  <Link href={`/reader-premium?book=${book.id}`}
                    className="flex-1 rounded-lg bg-purple-600 px-2 py-1.5 text-center text-[11px] font-bold text-white hover:bg-purple-700">
                    🤖 {isEn ? "AI Tutor" : "एआई ट्यूटर"}
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

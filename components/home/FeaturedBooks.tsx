"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { ALL_BOOKS, AI_SUMMARIES, type Book } from "./data";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const COVER_URLS: Record<string,string> = {
  "Artificial Intelligence":"https://covers.openlibrary.org/b/id/10523338-M.jpg",
  "Machine Learning":"https://covers.openlibrary.org/b/id/8231856-M.jpg",
  "Data Science":"https://covers.openlibrary.org/b/id/240726-M.jpg",
  "Deep Learning":"https://covers.openlibrary.org/b/id/10720543-M.jpg",
  "Quantum Computing":"https://covers.openlibrary.org/b/id/8235116-M.jpg",
  "Cyber Security":"https://covers.openlibrary.org/b/id/8775165-M.jpg",
  "Python Basics":"https://covers.openlibrary.org/b/id/9108915-M.jpg",
  "Robotics":"https://covers.openlibrary.org/b/id/5546156-M.jpg",
  "Cloud Architecture":"https://covers.openlibrary.org/b/id/8091016-M.jpg",
};

const CAT_COLORS: Record<string,string> = {
  Technology:"bg-blue-50 text-blue-600",
  Research:"bg-purple-50 text-purple-600",
  Governance:"bg-green-50 text-green-600",
};

export function FeaturedBooks() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [summaryBook, setSummaryBook] = useState<Book|null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [loading, setLoading] = useState(false);

  const scroll = (dir:"left"|"right") => {
    scrollRef.current?.scrollBy({left:dir==="right"?260:-260,behavior:"smooth"});
  };

  const openSummary = (book:Book) => {
    setSummaryBook(book); setSummaryText(""); setLoading(true);
    setTimeout(()=>{ setSummaryText(AI_SUMMARIES[book.title]??"Summary not available."); setLoading(false); }, 900);
  };

  return (
    <>
      <section id="catalog" className="bg-white border-b border-gray-100 py-10">
        <div className="mx-auto max-w-[1200px] px-6">

          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[20px] font-extrabold text-gray-900">{t.featuredBooks}</h2>
            <div className="flex items-center gap-2">
              <Link href="/library" className="text-[13px] font-semibold text-orange-500 hover:text-orange-600 mr-2">{t.viewAll}</Link>
              <button onClick={()=>scroll("left")}
                className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-500 transition-all shadow-sm text-[16px]">
                ‹
              </button>
              <button onClick={()=>scroll("right")}
                className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-500 transition-all shadow-sm text-[16px]">
                ›
              </button>
            </div>
          </div>

          {/* Carousel */}
          <div ref={scrollRef} className="flex gap-5 overflow-x-auto pb-3"
            style={{scrollbarWidth:"none",msOverflowStyle:"none"}}>
            {ALL_BOOKS.map((book,i)=>(
              <motion.div key={book.title}
                initial={{opacity:0,y:12}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
                transition={{duration:0.3,delay:i*0.04}}
                className="group flex-shrink-0 w-[140px]">
                {/* Cover */}
                <div className="relative overflow-hidden rounded-2xl bg-gray-100 shadow-md transition-all group-hover:shadow-xl group-hover:-translate-y-1"
                  style={{height:"192px"}}>
                  <img src={COVER_URLS[book.title]??"https://covers.openlibrary.org/b/id/8235116-M.jpg"}
                    alt={book.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={e=>{ const el=e.target as HTMLImageElement; el.style.display="none"; el.parentElement!.style.background=book.coverBg; }}/>
                  {/* Hover overlay with AI Summary */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all flex items-end p-2 opacity-0 group-hover:opacity-100">
                    <button onClick={()=>openSummary(book)}
                      className="w-full rounded-xl bg-white/90 backdrop-blur-sm py-1.5 text-[11px] font-bold text-gray-800 hover:bg-white transition-colors">
                      {t.aiSummaryBtn}
                    </button>
                  </div>
                </div>
                {/* Info */}
                <Link href={`/book/${encodeURIComponent(book.title)}`}>
                  <p className="mt-2.5 text-[13px] font-semibold text-gray-900 leading-tight line-clamp-2 hover:text-orange-500 transition-colors px-0.5">
                    {book.title}
                  </p>
                </Link>
                <p className="mt-0.5 text-[11px] text-gray-400 truncate px-0.5">{book.author}</p>
                <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${CAT_COLORS[book.category]??"bg-gray-100 text-gray-600"}`}>
                  {book.category}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Summary Modal */}
      {summaryBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={()=>setSummaryBook(null)}>
          <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}
            onClick={e=>e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-[420px] overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-5">
                <img src={COVER_URLS[summaryBook.title]??"https://covers.openlibrary.org/b/id/8235116-M.jpg"}
                  alt={summaryBook.title} className="w-14 h-20 object-cover rounded-xl shadow-md border border-gray-100"/>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-500 mb-1">{t.aiSummaryBtn}</p>
                  <h3 className="text-[16px] font-extrabold text-gray-900 leading-tight">{summaryBook.title}</h3>
                  <p className="text-[12px] text-gray-400 mt-0.5">{summaryBook.author}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-orange-50 p-4 min-h-[80px] text-[13px] leading-relaxed text-gray-700">
                {loading ? (
                  <div className="space-y-2.5">
                    {[1,0.85,0.92,0.7].map((w,i)=>(
                      <div key={i} className="h-3 rounded-full bg-orange-200 animate-pulse" style={{width:`${w*100}%`}}/>
                    ))}
                  </div>
                ) : summaryText}
              </div>
              <div className="flex gap-3 mt-5">
                <Link href={`/book/${encodeURIComponent(summaryBook.title)}`} onClick={()=>setSummaryBook(null)}
                  className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-[13px] py-3 text-center transition-colors">
                  {t.readNow}
                </Link>
                <button onClick={()=>setSummaryBook(null)}
                  className="flex-1 rounded-xl border-2 border-gray-200 hover:bg-gray-50 text-gray-600 font-semibold text-[13px] py-3 transition-colors">
                  ✕
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
"use client";

import Link from "next/link";
import { useRef, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { usePublicCatalog, type CatalogBook } from "@/lib/catalog";
import RealBookCover from "./RealBookCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export function FeaturedBooks() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const isEn = t.navLibrary === "Library";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [summaryBook, setSummaryBook] = useState<CatalogBook | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [loading, setLoading] = useState(false);

  const books = usePublicCatalog();

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "right" ? 260 : -260, behavior: "smooth" });
  };

  // Uses the book's real description as its "AI Summary" — no more
  // dependency on a separate mock summaries dictionary unrelated to the
  // real catalog. The short delay is kept purely for the loading-skeleton
  // feel; the content itself is real.
  const openSummary = (book: CatalogBook) => {
    setSummaryBook(book); setSummaryText(""); setLoading(true);
    setTimeout(() => {
      setSummaryText(book.description || (isEn ? "Summary not available." : "सारांश उपलब्ध नहीं है।"));
      setLoading(false);
    }, 700);
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
              <button onClick={() => scroll("left")}
                className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-500 transition-all shadow-sm text-[16px]">
                ‹
              </button>
              <button onClick={() => scroll("right")}
                className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-500 transition-all shadow-sm text-[16px]">
                ›
              </button>
            </div>
          </div>

          {/* Carousel */}
          <div ref={scrollRef} className="flex gap-5 overflow-x-auto pb-3"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {books.map((book, i) => (
              <motion.div key={book.id}
                initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="group flex-shrink-0 w-[140px]">
                {/* Cover */}
                <div className="relative overflow-hidden rounded-2xl bg-gray-100 shadow-md transition-all group-hover:shadow-xl group-hover:-translate-y-1"
                  style={{ height: "192px" }}>
                  <RealBookCover book={book} className="h-full w-full transition-transform duration-300 group-hover:scale-105" />
                  {/* Hover overlay with AI Summary */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all flex items-end p-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => openSummary(book)}
                      className="w-full rounded-xl bg-white/90 backdrop-blur-sm py-1.5 text-[11px] font-bold text-gray-800 hover:bg-white transition-colors">
                      {t.aiSummaryBtn}
                    </button>
                  </div>
                </div>
                {/* Info */}
                <Link href={`/reader-premium?book=${book.id}`}>
                  <p className="mt-2.5 text-[13px] font-semibold text-gray-900 leading-tight line-clamp-2 hover:text-orange-500 transition-colors px-0.5">
                    {book.title}
                  </p>
                </Link>
                <p className="mt-0.5 text-[11px] text-gray-400 truncate px-0.5">{book.author}</p>
                <span className="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-600">
                  {book.language}
                </span>
                {/* Two clear reading choices, per the site-wide requirement */}
                <div className="mt-2 flex gap-1.5 px-0.5">
                  <Link href={`/read?book=${book.id}`}
                    className="flex-1 rounded-lg bg-slate-100 px-2 py-1.5 text-center text-[10px] font-bold text-slate-700 hover:bg-slate-200">
                    📖 {isEn ? "Normal" : "सामान्य"}
                  </Link>
                  <Link href={`/reader-premium?book=${book.id}`}
                    className="flex-1 rounded-lg bg-purple-600 px-2 py-1.5 text-center text-[10px] font-bold text-white hover:bg-purple-700">
                    🤖 {isEn ? "AI Tutor" : "एआई ट्यूटर"}
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Summary Modal */}
      {summaryBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setSummaryBook(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            onClick={(e: MouseEvent) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-[420px] overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-20 rounded-xl shadow-md border border-gray-100 overflow-hidden flex-shrink-0">
                  <RealBookCover book={summaryBook} className="h-full w-full" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-500 mb-1">{t.aiSummaryBtn}</p>
                  <h3 className="text-[16px] font-extrabold text-gray-900 leading-tight">{summaryBook.title}</h3>
                  <p className="text-[12px] text-gray-400 mt-0.5">{summaryBook.author}</p>
                </div>
              </div>
              <div className="rounded-2xl bg-orange-50 p-4 min-h-[80px] text-[13px] leading-relaxed text-gray-700">
                {loading ? (
                  <div className="space-y-2.5">
                    {[1, 0.85, 0.92, 0.7].map((w, i) => (
                      <div key={i} className="h-3 rounded-full bg-orange-200 animate-pulse" style={{ width: `${w * 100}%` }} />
                    ))}
                  </div>
                ) : summaryText}
              </div>
              <div className="flex gap-2 mt-5">
                <Link href={`/read?book=${summaryBook.id}`} onClick={() => setSummaryBook(null)}
                  className="flex-1 rounded-xl border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[12px] py-3 text-center transition-colors">
                  📖 {isEn ? "Read Normally" : "सामान्य रूप से पढ़ें"}
                </Link>
                <Link href={`/reader-premium?book=${summaryBook.id}`} onClick={() => setSummaryBook(null)}
                  className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-[12px] py-3 text-center transition-colors">
                  {t.readNow}
                </Link>
                <button onClick={() => setSummaryBook(null)}
                  className="rounded-xl border-2 border-gray-200 hover:bg-gray-50 text-gray-600 font-semibold text-[13px] px-4 py-3 transition-colors">
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

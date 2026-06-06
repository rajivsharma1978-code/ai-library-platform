"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { ALL_BOOKS, AI_SUMMARIES, type Book } from "./data";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const COVER_URLS: Record<string, string> = {
  "Artificial Intelligence": "https://covers.openlibrary.org/b/id/10523338-M.jpg",
  "Machine Learning":        "https://covers.openlibrary.org/b/id/8231856-M.jpg",
  "Data Science":            "https://covers.openlibrary.org/b/id/240726-M.jpg",
  "Deep Learning":           "https://covers.openlibrary.org/b/id/10720543-M.jpg",
  "Quantum Computing":       "https://covers.openlibrary.org/b/id/8235116-M.jpg",
  "Cyber Security":          "https://covers.openlibrary.org/b/id/8775165-M.jpg",
  "Python Basics":           "https://covers.openlibrary.org/b/id/9108915-M.jpg",
  "Robotics":                "https://covers.openlibrary.org/b/id/5546156-M.jpg",
  "Cloud Architecture":      "https://covers.openlibrary.org/b/id/8091016-M.jpg",
};

export function FeaturedBooks() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const [summaryBook, setSummaryBook] = useState<Book | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [loading, setLoading] = useState(false);

  const openSummary = (book: Book) => {
    setSummaryBook(book);
    setSummaryText("");
    setLoading(true);
    setTimeout(() => {
      setSummaryText(AI_SUMMARIES[book.title] ?? "Summary not available.");
      setLoading(false);
    }, 900);
  };

  return (
    <>
      <section id="catalog" className="border-b border-orange-100 bg-[#FFFAF5] py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[2.5px] text-[#C85A00]">{t.catalogKicker}</p>
              <h2 className="text-3xl font-light text-stone-900"
                style={{ fontFamily: "var(--font-cormorant), serif" }}>{t.catalogTitle}</h2>
            </div>
            <Link href="/library"
              className="text-[10px] uppercase tracking-widest text-[#C85A00] transition hover:text-[#a84800]">
              {t.catalogViewAll}
            </Link>
          </div>

          <motion.div
            className="grid gap-px border border-orange-100 bg-orange-100 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-40px" }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
            {ALL_BOOKS.map((book) => (
              <motion.article key={book.title}
                variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
                className="group flex flex-col bg-white">
                {/* Cover with real image */}
                <Link href={`/book/${encodeURIComponent(book.title)}`}
                  className="relative block overflow-hidden bg-orange-50" style={{ height: "180px" }}>
                  <img
                    src={COVER_URLS[book.title] ?? "https://covers.openlibrary.org/b/id/8235116-M.jpg"}
                    alt={book.title}
                    className="h-full w-full object-cover transition group-hover:scale-105 duration-300"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                      el.parentElement!.style.background = book.coverBg;
                    }}
                  />
                  {/* Spine accent overlay */}
                  <div className="absolute left-0 top-0 h-full w-1.5" style={{ background: book.spineColor }} />
                  {/* Badge */}
                  {book.badge && (
                    <span className={`absolute right-2 top-2 rounded-sm px-2 py-0.5 text-[8px] uppercase tracking-widest font-medium ${
                      book.badge === "New" ? "bg-green-100 text-green-700" :
                      book.badge === "Trending" ? "bg-orange-100 text-orange-700" :
                      "bg-stone-900 text-white"}`}>
                      {book.badge === "New" ? t.badgeNew : book.badge === "Trending" ? t.badgeTrending : t.badgeEditorPick}
                    </span>
                  )}
                  {/* Category */}
                  <span className="absolute bottom-2 left-4 rounded-sm bg-white/90 px-2 py-0.5 text-[9px] uppercase tracking-wider text-stone-700">
                    {book.category}
                  </span>
                </Link>

                <div className="flex flex-1 flex-col p-4">
                  <Link href={`/book/${encodeURIComponent(book.title)}`}>
                    <h3 className="text-sm font-light leading-snug text-stone-900 transition group-hover:text-[#C85A00]"
                      style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "15px" }}>
                      {book.title}
                    </h3>
                  </Link>
                  <p className="mt-1 text-[10px] text-stone-400">{book.author}</p>
                  <div className="mt-auto pt-4 flex gap-2">
                    <Link href={`/book/${encodeURIComponent(book.title)}`}
                      className="flex-1 rounded-sm border border-stone-200 py-2 text-center text-[10px] uppercase tracking-wider text-stone-600 transition hover:bg-stone-900 hover:text-white hover:border-stone-900">
                      {t.readBtn}
                    </Link>
                    <button onClick={() => openSummary(book)}
                      className="flex-1 rounded-sm border border-orange-200 bg-orange-50 py-2 text-[10px] uppercase tracking-wider text-[#C85A00] transition hover:bg-orange-100">
                      {t.aiSummaryBtn}
                    </button>
                  </div>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      {/* AI Summary modal */}
      {summaryBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-sm border border-orange-100 bg-white p-8 shadow-2xl">
            <p className="text-[9px] uppercase tracking-[2.5px] text-[#C85A00]">{t.aiSummaryBtn}</p>
            <div className="mt-3 flex items-center gap-4">
              <img
                src={COVER_URLS[summaryBook.title] ?? "https://covers.openlibrary.org/b/id/8235116-M.jpg"}
                alt={summaryBook.title}
                className="w-12 h-16 object-cover rounded-sm border border-orange-100 shadow-sm"
              />
              <div>
                <h3 className="text-2xl font-light text-stone-900"
                  style={{ fontFamily: "var(--font-cormorant), serif" }}>{summaryBook.title}</h3>
                <p className="mt-0.5 text-xs text-stone-400">{summaryBook.author}</p>
              </div>
            </div>
            <div className="mt-6 rounded-sm border border-orange-100 bg-orange-50 p-5 text-sm leading-relaxed text-stone-700">
              {loading ? (
                <div className="space-y-3">
                  {[2/3, 1, 5/6, 3/4].map((w, i) => (
                    <div key={i} className="h-3 animate-pulse rounded bg-orange-100" style={{ width: `${w*100}%` }} />
                  ))}
                </div>
              ) : <p>{summaryText}</p>}
            </div>
            <div className="mt-6 flex gap-3">
              <Link href={`/book/${encodeURIComponent(summaryBook.title)}`}
                onClick={() => setSummaryBook(null)}
                className="flex-1 rounded-sm bg-[#C85A00] py-2.5 text-center text-[10px] uppercase tracking-widest text-white transition hover:bg-[#a84800]">
                {t.readNow}
              </Link>
              <button onClick={() => setSummaryBook(null)}
                className="flex-1 rounded-sm border border-stone-200 py-2.5 text-[10px] uppercase tracking-widest text-stone-600 transition hover:bg-stone-100">
                ✕
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}

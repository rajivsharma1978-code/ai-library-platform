"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { usePublicCatalog, type CatalogBook } from "@/lib/catalog";
import { comingSoonBooks } from "@/lib/comingSoonBooks";
import { useAdaptiveCarousel } from "@/lib/useAdaptiveCarousel";
import { useAutoScroll } from "@/lib/useAutoScroll";
import RealBookCover from "./RealBookCover";
import { ComingSoonCover } from "./ComingSoonCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// A distinct, lighter discovery mechanism from Director Collection — same
// carousel language, deliberately smaller cards and a single tap target
// per card (no stacked dual buttons) so it reads as the lightweight
// "editorially featured" rail, not a second flagship shelf. Adaptive like
// Director Collection — centers and hides arrows when the catalogue
// doesn't fill the row; reverts to a scrollable carousel once it does.
// Also drifts gently on its own (useAutoScroll) once there's enough
// content to scroll, pausing on hover/touch — manual swipe always wins.
// Mixes in one muted, non-interactive preview title after the real ones.
export function FeaturedBooks() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const [summaryBook, setSummaryBook] = useState<CatalogBook | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [loading, setLoading] = useState(false);

  const books = usePublicCatalog();
  const previewBooks = comingSoonBooks.slice(2, 3);
  const { ref: scrollRef, overflowing } = useAdaptiveCarousel<HTMLDivElement>([books.length + previewBooks.length]);
  useAutoScroll(scrollRef, overflowing);

  const scroll = (dir: "left" | "right") => {
    const card = scrollRef.current?.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 16 : 220;
    scrollRef.current?.scrollBy({ left: dir === "right" ? step : -step, behavior: "smooth" });
  };

  // Uses the book's real description as its "AI Summary" — no separate
  // mock summaries dictionary unrelated to the real catalog.
  const openSummary = (book: CatalogBook, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSummaryBook(book); setSummaryText(""); setLoading(true);
    setTimeout(() => {
      setSummaryText(book.description || t.summaryNotAvailable);
      setLoading(false);
    }, 700);
  };

  return (
    <>
      <section className="bg-white px-4 py-10 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
            <div className="min-w-0">
              <h2 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">{t.featuredBooks}</h2>
              <p className="mt-1.5 text-[13.5px] text-gray-500 sm:text-[15px]">{t.featuredBooksSub}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
              <Link href="/library" className="mr-1 text-[13px] font-semibold text-orange-500 hover:text-orange-600 sm:mr-2">{t.viewAll}</Link>
              {overflowing && (
                <>
                  <button type="button" onClick={() => scroll("left")} aria-label={t.commonPrevious}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] text-gray-600 shadow-sm transition-all active:scale-90 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500">
                    ‹
                  </button>
                  <button type="button" onClick={() => scroll("right")} aria-label={t.commonNext}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] text-gray-600 shadow-sm transition-all active:scale-90 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500">
                    ›
                  </button>
                </>
              )}
            </div>
          </div>

          <div
            ref={scrollRef}
            className={`flex gap-4 overflow-x-auto pb-1 ${overflowing ? "" : "justify-center"}`}
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {books.map((book, i) => (
              <motion.div key={book.id}
                initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="w-[41%] flex-shrink-0 sm:w-[180px] md:w-[198px] lg:w-[214px]">
                <Link href={`/reader-premium?book=${book.id}`} className="group block transition-transform duration-200 ease-out active:scale-[0.97] hover:-translate-y-1">
                  <div className="relative overflow-hidden rounded-2xl bg-gray-100 shadow-[0_8px_20px_-8px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.05] transition-shadow duration-300 group-hover:shadow-[0_16px_32px_-10px_rgba(15,23,42,0.28)]" style={{ aspectRatio: "3 / 4" }}>
                    <RealBookCover book={book} className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
                    <button
                      type="button"
                      onClick={(e) => openSummary(book, e)}
                      aria-label={t.aiSummaryBtn}
                      className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[13px] shadow transition active:scale-90 hover:bg-white"
                    >
                      ✨
                    </button>
                  </div>
                  <p className="mt-2 text-[12.5px] font-bold leading-tight text-gray-900 truncate group-hover:text-orange-500 transition-colors">
                    {book.title}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-gray-400 truncate">{book.author}</p>
                </Link>
              </motion.div>
            ))}

            {previewBooks.map((book) => (
              <div key={book.id} className="w-[41%] flex-shrink-0 cursor-default sm:w-[180px] md:w-[198px] lg:w-[214px]">
                <div className="overflow-hidden rounded-2xl opacity-[0.78] shadow-[0_4px_12px_-6px_rgba(15,23,42,0.14)] saturate-[0.82]" style={{ aspectRatio: "3 / 4" }}>
                  <ComingSoonCover id={book.id} className="h-full w-full" />
                </div>
                <p className="mt-2 text-[12.5px] font-semibold leading-tight text-gray-600 truncate">
                  {book.title}
                </p>
                <p className="mt-0.5 text-[10.5px] text-gray-400 truncate">{book.author}</p>
              </div>
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
                  📖 {t.bookActionReadNormally}
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

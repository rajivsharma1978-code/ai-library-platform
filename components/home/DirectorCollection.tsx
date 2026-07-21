"use client";

import Link from "next/link";
import { usePublicCatalog } from "@/lib/catalog";
import { comingSoonBooks } from "@/lib/comingSoonBooks";
import { useAdaptiveCarousel } from "@/lib/useAdaptiveCarousel";
import RealBookCover from "./RealBookCover";
import { ComingSoonCover } from "./ComingSoonCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// Premium horizontal carousel (Netflix / Disney+ Hotstar / Apple Books
// pattern). Mobile shows ~2.2 covers with a snap-scroll swipe; desktop
// widens each card so 3-5 are visible at once — same card width at every
// breakpoint, no separate mobile/desktop layout to keep in sync.
//
// The row is adaptive: useAdaptiveCarousel detects whether the row's
// content actually overflows its container and switches between a
// centered, arrow-free presentation and a left-aligned scrolling one
// accordingly — no code change needed as the catalogue grows.
//
// The rail also mixes in a small number of "preview" titles after the
// real, fully-working books — enough that the shelf reads as a growing
// library, not so many that they crowd out the real catalogue. Real
// books stay exactly as they were (full brightness, clickable, hover,
// "Read Now"); preview titles render through their own bookstore-quality
// cover art but muted, static, and non-interactive — the editorial note
// above already sets expectations, so no per-card label repeats it.
export default function DirectorCollection() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const liveBooks = usePublicCatalog();
  const previewBooks = comingSoonBooks.slice(0, 2);
  const totalCount = liveBooks.length + previewBooks.length;
  const { ref: scrollRef, overflowing } = useAdaptiveCarousel<HTMLDivElement>([totalCount]);

  const scroll = (dir: "left" | "right") => {
    const card = scrollRef.current?.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 16 : 220;
    scrollRef.current?.scrollBy({ left: dir === "right" ? step : -step, behavior: "smooth" });
  };

  return (
    <section className="bg-[#fff8ed] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <p className="mb-2.5 max-w-2xl text-[13px] italic leading-relaxed text-amber-800/80 sm:mb-3 sm:text-[14px]">
          {t.directorEditorialNote}
        </p>

        <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
          <div className="min-w-0">
            <p className="text-[10.5px] font-black uppercase tracking-[0.3em] text-amber-700 sm:text-[11px]">
              {t.directorEyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-3xl md:text-4xl">
              {t.directorHeading}
            </h2>
            <p className="mt-2 hidden max-w-2xl text-[15px] leading-relaxed text-slate-600 md:block">
              {t.directorDesc}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            <Link
              href="/reader-premium"
              className="hidden rounded-full bg-slate-950 px-5 py-2.5 text-xs font-black text-white shadow-lg transition active:scale-[0.97] hover:bg-slate-800 md:inline-block"
            >
              {t.directorOpenPremiumReader} →
            </Link>
            {overflowing && (
              <>
                <button
                  type="button"
                  onClick={() => scroll("left")}
                  aria-label={t.commonPrevious}
                  className="hidden h-10 w-10 items-center justify-center rounded-full border border-amber-200 bg-white text-slate-600 shadow-sm transition-all active:scale-90 hover:border-amber-400 hover:text-amber-700 sm:flex"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => scroll("right")}
                  aria-label={t.commonNext}
                  className="hidden h-10 w-10 items-center justify-center rounded-full border border-amber-200 bg-white text-slate-600 shadow-sm transition-all active:scale-90 hover:border-amber-400 hover:text-amber-700 sm:flex"
                >
                  ›
                </button>
              </>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          className={`flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pl-0.5 pt-0.5 ${overflowing ? "" : "justify-center"}`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {liveBooks.map((book) => (
            <Link
              key={book.id}
              href={`/reader-premium?book=${book.id}`}
              className="group w-[44%] flex-shrink-0 snap-start transition-transform duration-200 ease-out active:scale-[0.97] hover:-translate-y-1 sm:w-[190px] md:w-[210px] lg:w-[228px]"
            >
              <div
                className="relative overflow-hidden rounded-2xl bg-white shadow-[0_8px_20px_-8px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.05] transition-shadow duration-300 group-hover:shadow-[0_16px_32px_-10px_rgba(15,23,42,0.28)]"
                style={{ aspectRatio: "3 / 4" }}
              >
                <RealBookCover book={book} className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
                <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-amber-700 backdrop-blur-sm">
                  {book.language}
                </span>
              </div>

              <p className="mt-2.5 text-[13.5px] font-bold leading-tight text-slate-900 line-clamp-2 transition-colors group-hover:text-amber-700">
                {book.title}
              </p>
              <p className="mt-0.5 text-[11.5px] text-slate-500 truncate">{book.author}</p>
              <span className="mt-1.5 inline-block text-[11.5px] font-bold text-amber-700">
                {t.readNow}
              </span>
            </Link>
          ))}

          {previewBooks.map((book) => (
            <div
              key={book.id}
              className="w-[44%] flex-shrink-0 snap-start cursor-default sm:w-[190px] md:w-[210px] lg:w-[228px]"
            >
              <div
                className="overflow-hidden rounded-2xl opacity-[0.78] shadow-[0_4px_12px_-6px_rgba(15,23,42,0.14)] saturate-[0.82]"
                style={{ aspectRatio: "3 / 4" }}
              >
                <ComingSoonCover id={book.id} className="h-full w-full" />
              </div>

              <p className="mt-2.5 text-[13.5px] font-semibold leading-tight text-slate-600 line-clamp-2">
                {book.title}
              </p>
              <p className="mt-0.5 text-[11.5px] text-slate-400 truncate">{book.author}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

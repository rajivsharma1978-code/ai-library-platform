"use client";

import Link from "next/link";
import { usePublicCatalog } from "@/lib/catalog";
import { useAdaptiveCarousel } from "@/lib/useAdaptiveCarousel";
import RealBookCover from "./RealBookCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// Premium horizontal carousel (Netflix / Disney+ Hotstar / Apple Books
// pattern). Mobile shows ~2.2 covers with a snap-scroll swipe; desktop
// widens each card so 3-5 are visible at once — same card width at every
// breakpoint, no separate mobile/desktop layout to keep in sync.
//
// The row is adaptive: with a small catalogue (today, 3 demo books) the
// cards don't fill the container, so useAdaptiveCarousel detects that and
// the row centers itself — reading as a deliberately curated selection
// rather than a scrollable list that happens to be missing books. Once
// the catalogue is large enough to overflow, it automatically reverts to
// the left-aligned, arrow-driven scrolling carousel — no code change
// needed when real content arrives.
export default function DirectorCollection() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const books = usePublicCatalog();
  const { ref: scrollRef, overflowing } = useAdaptiveCarousel<HTMLDivElement>([books.length]);

  const scroll = (dir: "left" | "right") => {
    const card = scrollRef.current?.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 16 : 220;
    scrollRef.current?.scrollBy({ left: dir === "right" ? step : -step, behavior: "smooth" });
  };

  return (
    <section className="bg-[#fff8ed] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
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
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/reader-premium?book=${book.id}`}
              className="group w-[42%] flex-shrink-0 snap-start transition-transform duration-200 ease-out active:scale-[0.97] hover:-translate-y-1 sm:w-[188px] md:w-[208px] lg:w-[224px]"
            >
              <div
                className="relative overflow-hidden rounded-2xl bg-white shadow-[0_10px_28px_-8px_rgba(146,90,20,0.28)] ring-1 ring-amber-900/[0.06] transition-shadow duration-300 group-hover:shadow-[0_18px_38px_-10px_rgba(146,90,20,0.38)]"
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
        </div>
      </div>
    </section>
  );
}

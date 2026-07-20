"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { usePublicCatalog } from "@/lib/catalog";
import { useAdaptiveCarousel } from "@/lib/useAdaptiveCarousel";
import RealBookCover from "./RealBookCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// Recently-added books — a genuinely different product responsibility from
// both Director Collection (curated showcase) and Featured Books (editorial
// picks): this rail is chronological, not curated or personalized. Compact
// list-chip shape (small thumbnail + text, not a cover grid) keeps it
// visually distinct from the two cover-carousels above it. Adaptive like
// the other two rails — centers and hides arrows when the catalogue
// doesn't fill the row.
//
// NOTE: DirectorBook has no "date added" field yet (see lib/directorBooks.ts)
// — there's nothing to sort by with the current 3-book demo catalog, so this
// reverses catalog order as a placeholder "newest last in the source file"
// convention. When the catalog gains a real timestamp, swap the `.reverse()`
// below for a sort on that field; nothing else here needs to change.
export function NewArrivals() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const catalog = usePublicCatalog();
  const books = [...catalog].reverse();
  const { ref: scrollRef, overflowing } = useAdaptiveCarousel<HTMLDivElement>([books.length]);
  const scroll = (dir: "left" | "right") => {
    const card = scrollRef.current?.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 16 : 240;
    scrollRef.current?.scrollBy({ left: dir === "right" ? step : -step, behavior: "smooth" });
  };

  return (
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">{t.newArrivalsHeading}</h2>
            <p className="mt-1.5 text-[13.5px] text-gray-500 sm:text-[15px]">{t.newArrivalsSub}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
            <Link href="/library" className="mr-1 text-[13px] font-semibold text-orange-500 hover:text-orange-600 sm:mr-2">{t.viewAll}</Link>
            {overflowing && (
              <>
                <button type="button" onClick={() => scroll("left")} aria-label={t.commonPrevious}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] text-gray-600 shadow-sm transition-all active:scale-90 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500">‹</button>
                <button type="button" onClick={() => scroll("right")} aria-label={t.commonNext}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] text-gray-600 shadow-sm transition-all active:scale-90 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500">›</button>
              </>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          className={`flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 ${overflowing ? "" : "justify-center"}`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {books.map((book, i) => (
            <motion.div key={book.id}
              initial={{ opacity: 0, x: 8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="w-[60%] flex-shrink-0 snap-start sm:w-[215px] lg:w-[230px]">
              <Link href={`/reader-premium?book=${book.id}`}
                className="group flex min-h-[64px] items-center gap-3 rounded-xl border border-gray-100 bg-white p-2 shadow-sm transition-all active:scale-[0.98] hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md">
                <div className="h-[52px] w-[40px] flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 shadow-sm">
                  <RealBookCover book={book} className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="min-w-0 truncate text-[12.5px] font-semibold leading-tight text-gray-900 transition-colors group-hover:text-orange-500">{book.title}</p>
                    <span className="flex-shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-600">
                      {t.badgeNew}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10.5px] text-gray-400 truncate">{book.author}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

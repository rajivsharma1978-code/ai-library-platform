"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion } from "framer-motion";
import { usePublicCatalog } from "@/lib/catalog";
import RealBookCover from "./RealBookCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// Recently-added books — a genuinely different product responsibility from
// both Director Collection (curated showcase) and Featured Books (editorial
// picks): this rail is chronological, not curated or personalized. Compact
// list-chip shape (small thumbnail + text, not a cover grid) keeps it
// visually distinct from the two cover-carousels above it.
//
// NOTE: DirectorBook has no "date added" field yet (see lib/directorBooks.ts)
// — there's nothing to sort by with the current 3-book demo catalog, so this
// reverses catalog order as a placeholder "newest last in the source file"
// convention. When the catalog gains a real timestamp, swap the `.reverse()`
// below for a sort on that field; nothing else here needs to change.
export function NewArrivals() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: "left" | "right") => {
    const card = scrollRef.current?.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 10 : 220;
    scrollRef.current?.scrollBy({ left: dir === "right" ? step : -step, behavior: "smooth" });
  };

  const catalog = usePublicCatalog();
  const books = [...catalog].reverse();

  return (
    <section className="bg-white px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between sm:mb-5">
          <div className="min-w-0">
            <h2 className="text-[18px] font-extrabold text-gray-900 sm:text-[20px]">{t.newArrivalsHeading}</h2>
            <p className="mt-0.5 text-[12px] text-gray-400">{t.newArrivalsSub}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
            <Link href="/library" className="mr-1 text-[13px] font-semibold text-orange-500 hover:text-orange-600 sm:mr-2">{t.viewAll}</Link>
            <button type="button" onClick={() => scroll("left")} aria-label={t.commonPrevious}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] text-gray-600 shadow-sm transition-all active:scale-90 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500">‹</button>
            <button type="button" onClick={() => scroll("right")} aria-label={t.commonNext}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] text-gray-600 shadow-sm transition-all active:scale-90 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-500">›</button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {books.map((book, i) => (
            <motion.div key={book.id}
              initial={{ opacity: 0, x: 8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="w-[78%] flex-shrink-0 snap-start sm:w-[220px]">
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

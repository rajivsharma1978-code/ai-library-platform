"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { usePublicCatalog } from "@/lib/catalog";
import { comingSoonBooks } from "@/lib/comingSoonBooks";
import { useAdaptiveCarousel } from "@/lib/useAdaptiveCarousel";
import { useAutoScroll } from "@/lib/useAutoScroll";
import RealBookCover from "./RealBookCover";
import { ComingSoonCover } from "./ComingSoonCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// Recently-added books — a different product responsibility from both
// Director Collection (curated showcase) and Featured Books (editorial
// picks): this rail is chronological, not curated. It used to be a
// compact list-chip row (small thumbnail + sideways text) specifically to
// look distinct from the two cover-carousels above it — but that broke
// the page's visual rhythm, jumping straight from full covers to tiny
// thumbnails. It now shares Featured Books' card family (same cover-
// forward shape, one size step down) so all three rails read as one
// coherent shelf, with the "New Arrivals" heading itself carrying the
// distinction rather than a different card shape. Adaptive + auto-
// scrolling like Featured Books.
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
  const previewBooks = comingSoonBooks.slice(3, 5);
  const { ref: scrollRef, overflowing } = useAdaptiveCarousel<HTMLDivElement>([books.length + previewBooks.length]);
  useAutoScroll(scrollRef, overflowing);

  const scroll = (dir: "left" | "right") => {
    const card = scrollRef.current?.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 16 : 200;
    scrollRef.current?.scrollBy({ left: dir === "right" ? step : -step, behavior: "smooth" });
  };

  return (
    <section className="bg-white px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
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
          className={`flex gap-4 overflow-x-auto pb-1 ${overflowing ? "" : "justify-center"}`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {books.map((book, i) => (
            <motion.div key={book.id}
              initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="w-[41%] flex-shrink-0 sm:w-[178px] md:w-[194px] lg:w-[206px]">
              <Link href={`/reader-premium?book=${book.id}`} className="group block transition-transform duration-200 ease-out active:scale-[0.97] hover:-translate-y-1">
                <div className="overflow-hidden rounded-2xl bg-gray-100 shadow-[0_8px_20px_-8px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.05] transition-shadow duration-300 group-hover:shadow-[0_16px_32px_-10px_rgba(15,23,42,0.28)]" style={{ aspectRatio: "3 / 4" }}>
                  <RealBookCover book={book} className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
                </div>
                <p className="mt-2 text-[12.5px] font-bold leading-tight text-gray-900 truncate group-hover:text-orange-500 transition-colors">
                  {book.title}
                </p>
                <p className="mt-0.5 text-[10.5px] text-gray-400 truncate">{book.author}</p>
              </Link>
            </motion.div>
          ))}

          {previewBooks.map((book) => (
            <div key={book.id} className="w-[41%] flex-shrink-0 cursor-default sm:w-[178px] md:w-[194px] lg:w-[206px]">
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
  );
}

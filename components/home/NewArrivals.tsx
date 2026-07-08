"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion } from "framer-motion";
import { directorBooks } from "@/lib/directorBooks";
import RealBookCover from "./RealBookCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

type DirectorBook = { id: string; title: string; author?: string; language?: string; [k: string]: any };

export function NewArrivals() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: "left" | "right") => scrollRef.current?.scrollBy({ left: dir === "right" ? 300 : -300, behavior: "smooth" });

  // Same real catalog as Featured Books, shown in reverse order for a
  // touch of visual variety between the two sections — there's no real
  // "date added" field to sort by with only three demo books.
  const books = [...(directorBooks as DirectorBook[])].reverse();

  return (
    <section id="new-arrivals" className="bg-white border-b border-gray-100 py-10">
      <div className="mx-auto max-w-[1200px] px-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[20px] font-extrabold text-gray-900">{t.recommendedForYou}</h2>
            <p className="mt-0.5 text-[13px] text-gray-400">{t.recommendedSub}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/library" className="text-[13px] font-semibold text-orange-500 hover:text-orange-600 mr-2">{t.viewAll}</Link>
            <button onClick={() => scroll("left")}
              className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:text-orange-500 transition-all shadow-sm text-[16px]">‹</button>
            <button onClick={() => scroll("right")}
              className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:text-orange-500 transition-all shadow-sm text-[16px]">›</button>
          </div>
        </div>

        {/* Horizontal scroll */}
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {books.map((book, i) => (
            <motion.div key={book.id}
              initial={{ opacity: 0, x: 10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="flex-shrink-0 w-[200px]">
              <Link href={`/reader-premium?book=${book.id}`}
                className="group flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-orange-200 hover:-translate-y-0.5">
                {/* Cover */}
                <div className="w-[48px] h-[64px] flex-shrink-0 rounded-xl overflow-hidden shadow bg-gray-100">
                  <RealBookCover book={book} className="h-full w-full" />
                </div>
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-900 line-clamp-2 leading-tight group-hover:text-orange-500 transition-colors">{book.title}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400 truncate">{book.author}</p>
                  <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700">
                    {book.language}
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

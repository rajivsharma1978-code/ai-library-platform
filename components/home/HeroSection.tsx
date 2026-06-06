"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { AiSearchBar } from "./AiSearchBar";
import { ALL_BOOKS } from "./data";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: "easeOut" as const },
});

// OpenLibrary cover IDs for each book
const COVER_IDS: Record<string, string> = {
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

export function HeroSection() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const heroBooks = ALL_BOOKS.slice(0, 3);
  const tags = [t.heroTag1, t.heroTag2, t.heroTag3, t.heroTag4, t.heroTag5];

  return (
    <section className="border-b border-orange-100 bg-[#FFFAF5]">
      <div className="mx-auto max-w-7xl">
        <div className="grid min-h-[520px] lg:grid-cols-2">

          {/* Left */}
          <div className="flex flex-col justify-between border-r border-orange-100 px-6 py-16 lg:px-8 lg:py-20">
            <div>
              <motion.p {...fade(0)}
                className="mb-5 text-[10px] uppercase tracking-[3px] text-[#C85A00]">
                {t.heroKicker}
              </motion.p>
              <motion.h1 {...fade(0.08)}
                className="max-w-lg text-5xl font-light leading-[1.08] text-stone-900 lg:text-6xl"
                style={{ fontFamily: "var(--font-cormorant), serif" }}>
                {t.heroH1Line1}<br />
                {t.heroH1Line2}<br />
                <em className="italic text-[#C85A00]">{t.heroH1Line3}</em><br />
                {t.heroH1Line4}
              </motion.h1>
              <motion.p {...fade(0.16)}
                className="mt-5 max-w-sm text-sm leading-relaxed text-stone-500">
                {t.heroDesc}
              </motion.p>
              <motion.div {...fade(0.22)} className="mt-8 flex gap-3">
                <Link href="/library"
                  className="rounded-sm bg-[#C85A00] px-7 py-3 text-[11px] uppercase tracking-widest text-white transition hover:bg-[#a84800]">
                  {t.heroExplore}
                </Link>
                <Link href="/reader"
                  className="rounded-sm border border-orange-300 px-7 py-3 text-[11px] uppercase tracking-widest text-[#C85A00] transition hover:bg-orange-50">
                  {t.heroAiTutor}
                </Link>
              </motion.div>
            </div>

            <motion.div {...fade(0.3)} className="mt-14">
              <p className="mb-3 text-[10px] uppercase tracking-[2.5px] text-stone-400">{t.heroSearchLabel}</p>
              <AiSearchBar />
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={tag}
                    className="cursor-pointer rounded-sm border border-orange-200 px-3 py-1 text-[10px] uppercase tracking-wider text-stone-400 transition hover:border-[#C85A00] hover:text-[#C85A00]">
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col justify-end bg-orange-50 p-6 lg:p-8"
          >
            {/* Editor's choice card with book images */}
            <div className="mb-5 rounded-sm border border-orange-200 bg-white p-6 shadow-sm">
              <p className="mb-5 text-[9px] uppercase tracking-[2.5px] text-[#C85A00]">{t.editorChoice}</p>
              <div className="space-y-4">
                {heroBooks.map((book) => (
                  <Link key={book.title} href={`/book/${encodeURIComponent(book.title)}`}
                    className="flex items-center gap-4 group">
                    {/* Book cover image */}
                    <div className="w-12 h-16 flex-shrink-0 overflow-hidden rounded-sm border border-orange-100 shadow-sm bg-orange-50">
                      <img
                        src={COVER_IDS[book.title] ?? `https://covers.openlibrary.org/b/id/8235116-M.jpg`}
                        alt={book.title}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-light text-stone-800 group-hover:text-[#C85A00] transition"
                        style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "15px" }}>
                        {book.title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-stone-400">{book.author}</p>
                      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[#C85A00]">{book.category}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Mini stats */}
            <div className="grid grid-cols-2 gap-2">
              {[
                [t.stat1Val, t.stat1Label],
                [t.stat2Val, t.stat2Label],
                [t.stat3Val, t.stat3Label],
                [t.stat4Val, t.stat4Label],
              ].map(([val, label]) => (
                <div key={label} className="rounded-sm border border-orange-100 bg-white p-4 shadow-sm">
                  <p className="text-2xl font-light text-[#C85A00]"
                    style={{ fontFamily: "var(--font-cormorant), serif" }}>{val}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-wider text-stone-400">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

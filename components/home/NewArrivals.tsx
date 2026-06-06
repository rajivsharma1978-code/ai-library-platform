"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ALL_BOOKS } from "./data";
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

const featured = ALL_BOOKS.find(b => b.title === "Deep Learning")!;
const smallCards = ALL_BOOKS.filter(b => b.title !== "Deep Learning" && b.badge !== null).slice(0, 4);

export function NewArrivals() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  return (
    <section id="new-arrivals" className="border-b border-orange-100 bg-[#FFFAF5] py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[2.5px] text-[#C85A00]">{t.arrivalsKicker}</p>
            <h2 className="text-3xl font-light text-stone-900"
              style={{ fontFamily: "var(--font-cormorant), serif" }}>{t.arrivalsTitle}</h2>
          </div>
          <Link href="/library"
            className="text-[10px] uppercase tracking-widest text-[#C85A00] transition hover:text-[#a84800]">
            {t.arrivalsViewAll}
          </Link>
        </div>

        <div className="grid gap-px border border-orange-100 bg-orange-100 lg:grid-cols-3">
          {/* Featured large card — saffron warm */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}
            className="flex flex-col bg-[#FFF2E0] p-8 lg:row-span-2" style={{ minHeight: "340px" }}>
            <p className="mb-4 text-[9px] uppercase tracking-[2.5px] text-[#C85A00]">{t.featuredRelease}</p>
            <div className="flex gap-4 mb-4">
              <img
                src={COVER_URLS[featured.title]}
                alt={featured.title}
                className="w-16 h-22 object-cover rounded-sm shadow-md border border-orange-100 flex-shrink-0"
                style={{ height: "88px" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div>
                <h3 className="text-2xl font-light leading-tight text-stone-900"
                  style={{ fontFamily: "var(--font-cormorant), serif" }}>{featured.title}</h3>
                <p className="mt-1 text-[10px] text-stone-500">{featured.author}</p>
              </div>
            </div>
            <p className="mb-6 text-sm leading-relaxed text-stone-500 flex-1">{featured.description}</p>
            <div className="flex gap-3">
              <Link href={`/book/${encodeURIComponent(featured.title)}`}
                className="rounded-sm bg-[#C85A00] px-5 py-2.5 text-[10px] uppercase tracking-widest text-white transition hover:bg-[#a84800]">
                {t.readNow}
              </Link>
              <Link href={`/reader`}
                className="rounded-sm border border-orange-300 px-5 py-2.5 text-[10px] uppercase tracking-widest text-[#C85A00] transition hover:bg-orange-100">
                {t.aiMode}
              </Link>
            </div>
          </motion.div>

          {/* Small cards */}
          {smallCards.map((book, i) => (
            <motion.div key={book.title}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.07 }}
              className={`group flex items-center gap-4 p-6 ${i % 2 === 1 ? "bg-orange-50" : "bg-white"}`}
              style={{ minHeight: "160px" }}>
              {/* Book cover */}
              <img
                src={COVER_URLS[book.title] ?? "https://covers.openlibrary.org/b/id/8235116-M.jpg"}
                alt={book.title}
                className="w-12 h-16 object-cover rounded-sm shadow border border-orange-100 flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div className="min-w-0">
                <p className="mb-1 text-[9px] uppercase tracking-[2px] text-stone-400">
                  {book.badge === "New" ? t.newArrival :
                   book.badge === "Trending" ? t.trendingNow : t.badgeEditorPick}
                </p>
                <Link href={`/book/${encodeURIComponent(book.title)}`}>
                  <h3 className="text-base font-light leading-snug text-stone-900 transition group-hover:text-[#C85A00]"
                    style={{ fontFamily: "var(--font-cormorant), serif" }}>{book.title}</h3>
                </Link>
                <p className="mt-1 text-[10px] text-stone-400 mb-2">{book.author}</p>
                <div className="flex items-center gap-3">
                  <span className={`rounded-sm px-2 py-0.5 text-[8px] uppercase tracking-wider font-medium ${
                    book.badge === "New" ? "bg-green-100 text-green-700" :
                    book.badge === "Trending" ? "bg-orange-100 text-orange-700" :
                    "bg-stone-100 text-stone-600"}`}>
                    {book.badge === "New" ? t.badgeNew : book.badge === "Trending" ? t.badgeTrending : t.badgeEditorPick}
                  </span>
                  <Link href={`/book/${encodeURIComponent(book.title)}`}
                    className="text-[9px] uppercase tracking-wider text-[#C85A00] transition hover:text-[#a84800]">
                    {t.openBook}
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { RECOMMENDATIONS, LEARNING_PATHS, READING_HISTORY, ALL_BOOKS } from "./data";
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

export function Recommendations() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  return (
    <section id="recommendations" className="border-b border-orange-100 bg-[#FFFAF5] py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[2.5px] text-[#C85A00]">{t.recKicker}</p>
            <h2 className="text-3xl font-light text-stone-900"
              style={{ fontFamily: "var(--font-cormorant), serif" }}>{t.recTitle}</h2>
          </div>
          <button className="text-[10px] uppercase tracking-widest text-[#C85A00] transition hover:text-[#a84800]">
            {t.recRefresh}
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recs list */}
          <div className="lg:col-span-2">
            <div className="divide-y divide-orange-50 border border-orange-100 rounded-sm overflow-hidden">
              {RECOMMENDATIONS.map((item, i) => {
                const book = ALL_BOOKS.find(b => b.title === item.title);
                return (
                  <motion.div key={item.title}
                    initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }} transition={{ delay: i * 0.07 }}
                    className="flex items-center gap-4 p-5 bg-white transition hover:bg-orange-50">
                    <img
                      src={COVER_URLS[item.title] ?? "https://covers.openlibrary.org/b/id/8235116-M.jpg"}
                      alt={item.title}
                      className="w-10 h-14 object-cover rounded-sm border border-orange-100 flex-shrink-0 shadow-sm"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div className="flex-1 min-w-0">
                      <Link href={`/book/${encodeURIComponent(item.title)}`}
                        className="font-light text-stone-900 transition hover:text-[#C85A00]"
                        style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "16px" }}>
                        {item.title}
                      </Link>
                      <p className="mt-0.5 text-[10px] text-stone-400">{item.reason}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="rounded-sm bg-green-50 border border-green-100 px-2.5 py-1 text-[9px] uppercase tracking-wider text-green-700">
                        {item.match}
                      </span>
                      <Link href={`/book/${encodeURIComponent(item.title)}`}
                        className="rounded-sm border border-orange-200 bg-orange-50 px-4 py-1.5 text-[9px] uppercase tracking-wider text-[#C85A00] transition hover:bg-orange-100">
                        {t.readBtn}
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Learning paths */}
            <div className="mt-6 border border-orange-100 rounded-sm overflow-hidden">
              <div className="bg-orange-50 px-6 py-4 border-b border-orange-100">
                <p className="text-[10px] uppercase tracking-[2px] text-[#C85A00]">Learning Paths</p>
              </div>
              <div className="divide-y divide-orange-50">
                {LEARNING_PATHS.map(path => (
                  <div key={path.title} className="flex items-center justify-between bg-white p-5">
                    <div>
                      <p className="text-sm font-light text-stone-800"
                        style={{ fontFamily: "var(--font-cormorant), serif" }}>{path.title}</p>
                      <p className="mt-0.5 text-[10px] text-stone-400">
                        {path.modules} modules · {path.duration} · {path.level}
                      </p>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider text-[#C85A00] cursor-pointer hover:text-[#a84800]">
                      Start →
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Reading history */}
          <div className="space-y-5">
            <div className="border border-orange-100 rounded-sm overflow-hidden">
              <div className="bg-orange-50 px-6 py-4 border-b border-orange-100">
                <p className="text-[10px] uppercase tracking-[2px] text-[#C85A00]">Reading History</p>
              </div>
              <div className="divide-y divide-orange-50 bg-white">
                {READING_HISTORY.map(item => (
                  <div key={item.title} className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <img
                        src={COVER_URLS[item.title] ?? "https://covers.openlibrary.org/b/id/8235116-M.jpg"}
                        alt={item.title}
                        className="w-8 h-11 object-cover rounded-sm border border-orange-100 flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="min-w-0">
                        <Link href={`/book/${encodeURIComponent(item.title)}`}
                          className="text-sm font-light text-stone-800 hover:text-[#C85A00] transition block truncate"
                          style={{ fontFamily: "var(--font-cormorant), serif" }}>
                          {item.title}
                        </Link>
                        <p className="text-[9px] text-stone-400">{item.lastRead}</p>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-orange-50 rounded-full">
                      <div className="h-full bg-[#C85A00] rounded-full" style={{ width: `${item.progress}%` }} />
                    </div>
                    <p className="mt-1 text-[9px] text-stone-400 text-right">{item.progress}%</p>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Suggestions */}
            <div className="border border-orange-200 rounded-sm overflow-hidden bg-orange-50">
              <div className="bg-[#C85A00] px-6 py-4">
                <p className="text-[9px] uppercase tracking-[2px] text-orange-100">AI Suggestions</p>
              </div>
              <div className="divide-y divide-orange-100">
                {[
                  "Revise Chapter 4 before starting the Deep Learning path.",
                  "You may benefit from a quiz on neural network architectures.",
                  "Schedule a 20-minute AI tutor session for Python Basics.",
                ].map((s, i) => (
                  <div key={i} className="p-4 bg-white">
                    <p className="text-[9px] uppercase tracking-wider text-[#C85A00] mb-1">Suggestion {i + 1}</p>
                    <p className="text-xs text-stone-500 leading-relaxed">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

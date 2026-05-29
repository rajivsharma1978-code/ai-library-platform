"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FEATURED_BOOKS } from "./data";

const MOCK_SUMMARIES: Record<string, string> = {
  "Introduction to Public Policy":
    "This book introduces how public policy is designed, approved, and evaluated. It explains agenda setting, institutional roles, budget trade-offs, and impact assessment through practical case studies from education, health, and urban governance.",
  "Climate Science for Citizens":
    "The text simplifies climate systems, carbon cycles, and adaptation strategies for non-specialists. It combines scientific fundamentals with policy choices, helping readers understand risk, resilience planning, and responsible citizen action.",
  "Digital India: A Handbook":
    "A practical overview of digital public infrastructure, identity systems, data governance, and service delivery modernization. The book highlights interoperability, privacy safeguards, and implementation patterns for large-scale national platforms.",
  "Constitutional Foundations":
    "This volume explains constitutional principles, separation of powers, and rights jurisprudence with landmark judgments. It connects legal doctrine to contemporary administrative and policy decisions to support evidence-based civic understanding.",
};

export function FeaturedBooks() {
  const [selectedBook, setSelectedBook] = useState<(typeof FEATURED_BOOKS)[number] | null>(
    null
  );
  const [summary, setSummary] = useState("");
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  const openSummary = (book: (typeof FEATURED_BOOKS)[number]) => {
    setSelectedBook(book);
    setSummary("");
    setIsLoadingSummary(true);

    window.setTimeout(() => {
      setSummary(MOCK_SUMMARIES[book.title] ?? "Summary unavailable for this title.");
      setIsLoadingSummary(false);
    }, 1100);
  };

  const closeSummary = () => {
    setSelectedBook(null);
    setSummary("");
    setIsLoadingSummary(false);
  };

  return (
    <>
      <section
        id="catalog"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
        aria-labelledby="featured-heading"
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-ndl-gold">
              Curated collection
            </p>
            <h2
              id="featured-heading"
              className="mt-1 text-2xl font-bold text-ndl-navy sm:text-3xl"
            >
              Featured books
            </h2>
          </div>
          <a
            href="#"
            className="text-sm font-semibold text-ndl-navy underline-offset-4 hover:underline"
          >
            View full catalog →
          </a>
        </motion.div>

        <motion.div
          className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.08 } },
          }}
        >
          {FEATURED_BOOKS.map((book) => (
            <motion.article
              key={book.title}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              whileHover={{ y: -4 }}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-ndl-gold/30 hover:shadow-md"
            >
              <div
                className={`aspect-[3/4] rounded-lg bg-gradient-to-br ${book.gradient} flex items-end p-4`}
              >
                <span className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-ndl-navy">
                  {book.category}
                </span>
              </div>
              <h3 className="mt-4 font-semibold text-slate-900 transition group-hover:text-ndl-navy">
                {book.title}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{book.author}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-ndl-navy transition hover:bg-ndl-navy hover:text-white"
                >
                  Read now
                </button>
                <button
                  type="button"
                  onClick={() => openSummary(book)}
                  className="w-full rounded-lg bg-ndl-gold py-2 text-sm font-semibold text-ndl-navy transition hover:bg-ndl-gold-light"
                >
                  AI Summary
                </button>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </section>

      {selectedBook && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ndl-gold">
                  AI Summary
                </p>
                <h3 className="mt-1 text-xl font-bold text-ndl-navy">{selectedBook.title}</h3>
                <p className="text-sm text-slate-500">{selectedBook.author}</p>
              </div>
              <button
                type="button"
                onClick={closeSummary}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              {isLoadingSummary ? (
                <div className="space-y-3">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200" />
                  <p className="pt-1 text-xs text-slate-500">Generating AI summary...</p>
                </div>
              ) : (
                <p>{summary}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

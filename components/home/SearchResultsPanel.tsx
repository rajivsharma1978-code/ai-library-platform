"use client";

import Link from "next/link";
import type { SearchResultItem } from "@/lib/api";

type SearchResultsPanelProps = {
  query: string;
  results: SearchResultItem[];
  labels: {
    resultsFor: string;
    rank: string;
    relevance: string;
    passage: string;
    noResults: string;
    openInChat: string;
    resultCount: string;
  };
};

export function SearchResultsPanel({ query, results, labels }: SearchResultsPanelProps) {
  if (results.length === 0) {
    return (
      <div className="rounded-sm border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500" role="status">
        {labels.noResults}
      </div>
    );
  }

  return (
    <div
      id="search-results"
      className="rounded-sm border border-stone-200 bg-[#FAF8F5] shadow-lg"
      role="region"
      aria-label={`${labels.resultsFor} "${query}"`}
    >
      <div className="border-b border-stone-100 px-5 py-3">
        <p className="text-xs font-medium text-stone-700">
          {labels.resultsFor} <span className="text-stone-500">"{query}"</span>
        </p>
        <p className="mt-0.5 text-[10px] text-stone-400">
          {labels.resultCount.replace("{count}", String(results.length))}
        </p>
      </div>

      <ul className="divide-y divide-stone-100">
        {results.map((item) => (
          <li key={`${item.file_id}-${item.chunk_index}-${item.rank}`} className="px-5 py-4 transition hover:bg-stone-50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-stone-900 text-[10px] font-bold text-[#FAF8F5]">
                    {item.rank}
                  </span>
                  <h3 className="truncate text-sm font-light text-stone-800" style={{ fontFamily: "var(--font-cormorant), serif" }}>
                    {item.original_filename}
                  </h3>
                  <span className="rounded-sm border border-stone-200 px-2 py-0.5 text-[9px] uppercase tracking-wider text-stone-400">
                    {labels.passage} {item.chunk_index + 1}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-stone-600">{item.snippet}</p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <span className="text-[10px] text-stone-400">
                  {labels.relevance}: <span className="tabular-nums text-stone-700">{item.score.toFixed(2)}</span>
                </span>
                <Link href="/reader" className="text-[10px] uppercase tracking-wider text-amber-800 hover:text-amber-600 transition">
                  {labels.openInChat} →
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

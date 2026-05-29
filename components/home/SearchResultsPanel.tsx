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

export function SearchResultsPanel({
  query,
  results,
  labels,
}: SearchResultsPanelProps) {
  if (results.length === 0) {
    return (
      <div
        className="rounded-xl border border-white/20 bg-white/95 px-4 py-6 text-center text-sm text-slate-600 shadow-lg backdrop-blur-sm"
        role="status"
      >
        {labels.noResults}
      </div>
    );
  }

  return (
    <div
      id="search-results"
      className="rounded-xl border border-white/20 bg-white/95 shadow-xl backdrop-blur-sm"
      role="region"
      aria-label={`${labels.resultsFor} "${query}"`}
    >
      <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold text-ndl-navy">
          {labels.resultsFor}{" "}
          <span className="text-slate-600">&ldquo;{query}&rdquo;</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {labels.resultCount.replace("{count}", String(results.length))}
        </p>
      </div>

      <ul className="divide-y divide-slate-100">
        {results.map((item) => (
          <li
            key={`${item.file_id}-${item.chunk_index}-${item.rank}`}
            className="px-4 py-4 transition hover:bg-slate-50 sm:px-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-ndl-navy text-xs font-bold text-white">
                    {item.rank}
                  </span>
                  <h3 className="truncate text-sm font-semibold text-ndl-navy">
                    {item.original_filename}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {labels.passage} {item.chunk_index + 1}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-700">{item.snippet}</p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <span className="text-xs font-medium text-slate-500">
                  {labels.relevance}:{" "}
                  <span className="tabular-nums text-ndl-navy">{item.score.toFixed(2)}</span>
                </span>
                <Link
                  href="/chat"
                  className="text-xs font-semibold text-ndl-gold underline-offset-2 hover:underline"
                >
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

"use client";

import { useRef, useState } from "react";
import { semanticSearch, type SearchResultItem } from "@/lib/api";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { SearchResultsPanel } from "./SearchResultsPanel";

type SearchStatus = "idle" | "loading" | "success" | "error";

export function AiSearchBar() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [lastQuery, setLastQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setErrorMessage(t.searchEmptyQuery);
      setStatus("error");
      setResults([]);
      return;
    }
    setStatus("loading");
    setErrorMessage(null);
    setResults([]);
    try {
      const response = await semanticSearch(trimmed, 8);
      setLastQuery(response.query);
      setResults(response.results);
      setStatus("success");
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : t.searchError);
    }
  };

  const isLoading = status === "loading";

  return (
    <div className="relative w-full">
      <form onSubmit={handleSearch}>
        <div className="flex items-center border-b-2 border-stone-900 pb-3 gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, author, subject, or ask a question…"
            disabled={isLoading}
            className="flex-1 bg-transparent text-base text-stone-900 outline-none placeholder:text-stone-300 disabled:opacity-60"
            style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "18px" }}
            aria-label={t.searchPlaceholder}
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="flex-shrink-0 text-[10px] uppercase tracking-widest text-amber-800 transition hover:text-amber-600 disabled:opacity-40"
          >
            {isLoading ? "Searching…" : "Search with AI →"}
          </button>
        </div>
      </form>

      <div ref={resultsRef} className="mt-4 space-y-3">
        {errorMessage && status === "error" && (
          <div className="flex items-start justify-between gap-2 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={() => { setErrorMessage(null); setStatus("idle"); }}
              className="text-xs hover:underline"
            >
              ✕
            </button>
          </div>
        )}
        {status === "success" && (
          <SearchResultsPanel
            query={lastQuery}
            results={results}
            labels={{
              resultsFor: t.searchResultsFor,
              rank: t.searchRank,
              relevance: t.searchRelevance,
              passage: t.searchPassage,
              noResults: t.searchNoResults,
              openInChat: t.openInChat,
              resultCount: t.searchResultCount,
            }}
          />
        )}
      </div>
    </div>
  );
}

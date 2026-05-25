"use client";

import { motion } from "framer-motion";
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
      setErrorMessage(
        error instanceof Error ? error.message : t.searchError,
      );
    }
  };

  const isLoading = status === "loading";

  return (
    <div className="relative w-full max-w-3xl">
      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        onSubmit={handleSearch}
        className="relative"
      >
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-ndl-gold/10 to-transparent"
          animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          style={{ backgroundSize: "200% 100%" }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-2 rounded-2xl border border-white/20 bg-white/95 p-2 shadow-2xl shadow-black/20 backdrop-blur-sm focus-within:ring-2 focus-within:ring-ndl-gold sm:flex-row sm:items-center sm:gap-0 sm:pl-5">
          <span className="hidden pl-1 text-ndl-gold sm:inline" aria-hidden>
            ✦
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            disabled={isLoading}
            className="w-full bg-transparent px-4 py-3.5 text-base text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-70 sm:flex-1 sm:px-2 sm:py-4"
            aria-label={t.searchPlaceholder}
          />
          <motion.button
            type="submit"
            disabled={isLoading || !query.trim()}
            whileHover={isLoading ? undefined : { scale: 1.02 }}
            whileTap={isLoading ? undefined : { scale: 0.98 }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ndl-navy px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-ndl-navy-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden
                />
                <span className="sr-only">{t.searchLoading}</span>
                <span className="hidden sm:inline">{t.searchLoading}</span>
                <span className="sm:hidden">…</span>
              </>
            ) : (
              t.searchWithAi
            )}
          </motion.button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-300 sm:text-left">
          {t.searchPoweredBy}
        </p>
      </motion.form>

      <div ref={resultsRef} className="mt-4 space-y-3">
        {isLoading && (
          <div
            className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/90 px-4 py-4 text-sm text-slate-600 shadow-lg backdrop-blur-sm"
            role="status"
            aria-live="polite"
          >
            <span
              className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-ndl-navy/20 border-t-ndl-navy"
              aria-hidden
            />
            <span>{t.searchLoading}</span>
            <span className="flex gap-1" aria-hidden>
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ndl-navy [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ndl-navy [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ndl-navy [animation-delay:300ms]" />
            </span>
          </div>
        )}

        {errorMessage && status === "error" && (
          <div
            className="flex items-start justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg"
            role="alert"
          >
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setStatus("idle");
              }}
              className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold hover:bg-red-100"
              aria-label="Dismiss"
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

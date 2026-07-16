"use client";

import { useMemo } from "react";
import Link from "next/link";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { usePublicCatalog, type CatalogBook } from "@/lib/catalog";
import PageHeader from "@/components/ui/PageHeader";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";
import BookCover from "@/components/ui/BookCover";
import AppButton from "@/components/ui/AppButton";

// Widened to `string` values (rather than `typeof UI_TEXT["en"]` directly)
// so FeaturedCard accepts `t` for ANY of the 6 language variants, not just
// the literal-typed English one.
type UIText = { [K in keyof typeof UI_TEXT["en"]]: string };

// ══════════════════════════════════════════════════════════════════════
// /explore — a lightweight discovery landing page, NOT a second catalog
// browser. Categories and the Featured Collection are both derived from
// the same live catalog /library uses (usePublicCatalog), so this page
// can never drift out of sync with what books actually exist or show a
// category that doesn't correspond to any real book. Category cards hand
// off into /library (the real search/filter/browse experience) rather
// than reimplementing filtering here.
// ══════════════════════════════════════════════════════════════════════

const FEATURED_COUNT = 3;

export default function ExplorePage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const catalog = usePublicCatalog();

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of catalog) {
      if (!book.category) continue;
      counts.set(book.category, (counts.get(book.category) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog]);

  const featured = useMemo(() => catalog.slice(0, FEATURED_COUNT), [catalog]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <PageHeader title={t.exploreTitle} subtitle={t.exploreSubtitle} homeLabel={t.commonHome} />

        <section className="mt-4">
          <h2 className="text-lg font-black text-slate-900 mb-4">
            {t.exploreBrowseCategories}
          </h2>

          {categories.length === 0 ? (
            <p className="text-slate-500">{t.exploreEmptyCatalog}</p>
          ) : (
            <div className="grid md:grid-cols-4 gap-4">
              {categories.map((category) => (
                <Link
                  key={category.name}
                  href="/library"
                  className="block bg-white rounded-3xl p-6 shadow-[0_10px_30px_rgba(75,45,12,0.08)] ring-1 ring-black/5 hover:-translate-y-0.5 transition"
                >
                  <h3 className="font-black text-lg text-slate-900">
                    {category.name}
                  </h3>
                  <p className="text-slate-500 text-sm mt-2">
                    {t.exploreBooksCount.replace("{count}", String(category.count))}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10 pb-6">
          <h2 className="text-lg font-black text-slate-900 mb-4">
            {t.exploreFeaturedCollection}
          </h2>

          {featured.length === 0 ? (
            <p className="text-slate-500">{t.exploreEmptyCatalog}</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {featured.map((book) => (
                <FeaturedCard key={book.id} book={book} t={t} />
              ))}
            </div>
          )}
        </section>
      </div>
      <AccessibilityToolbar />
    </main>
  );
}

function FeaturedCard({ book, t }: { book: CatalogBook; t: UIText }) {
  return (
    <div className="min-w-0 bg-white rounded-[2rem] p-6 shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5">
      <div className="h-48 w-full overflow-hidden rounded-2xl shadow">
        <BookCover book={book} className="h-full w-full" />
      </div>
      <h3 className="mt-4 font-black text-lg text-slate-950 truncate">{book.title}</h3>
      {book.author && <p className="text-slate-500 text-sm truncate">{book.author}</p>}
      {book.category && (
        <span className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
          {book.category}
        </span>
      )}
      {/* Stacked on narrow screens so longer translated labels (Bengali,
          Tamil, etc.) never force horizontal page overflow; back to a
          side-by-side row once the card has enough width to fit both
          without either button's text needing to shrink below its
          natural size. min-w-0 lets each item wrap instead of overflow
          if a label is ever still too wide for its half of the row. */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <AppButton href={`/read?book=${book.id}`} variant="secondary" size="sm" fullWidth>
            📖 {t.readerReadNormally}
          </AppButton>
        </div>
        <div className="min-w-0 flex-1">
          <AppButton href={`/reader-premium?book=${book.id}`} variant="primary" size="sm" fullWidth>
            🤖 {t.readerReadWithAi}
          </AppButton>
        </div>
      </div>
    </div>
  );
}

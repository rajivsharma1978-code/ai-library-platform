// ── Public catalog helper ───────────────────────────────────────────────
// Merges the static lib/directorBooks.ts catalog with admin overrides
// (the same ndl_admin_books key + buildDisplayBooks() logic the Admin
// module already uses) so that editing/removing a book, or publishing a
// custom admin-created book, actually shows up everywhere the public app
// lists or opens books — not just inside /admin.
//
// Client-only: reads localStorage, so it must never be called during SSR
// or a component's first (hydration) render. Every caller is expected to
// gate this behind whatever mount/hydration check it already has (the
// same "before hydration: static default, after: real data" pattern
// already used throughout this app) — this module does not manage that
// gating itself, it just does the merge once called.

"use client";

import { useEffect, useState } from "react";
import { directorBooks, type DirectorBook } from "@/lib/directorBooks";
import { loadBookOverrides, type AdminBookOverride, type BookStatus } from "@/components/admin/adminData";

export type CatalogBook = DirectorBook & {
  status?: BookStatus;
  isCustom?: boolean;
};

/** directorBooks.ts + ndl_admin_books overrides, filtered to books an
 *  admin hasn't removed or left in a non-Published state — i.e. exactly
 *  what a real visitor should see. Safe to call repeatedly; it's a plain
 *  read + merge, no caching. */
export function getPublicCatalog(): CatalogBook[] {
  const overrides = loadBookOverrides();
  const overrideMap = new Map<string, AdminBookOverride>(overrides.map(o => [o.id, o]));

  const fromCatalog: CatalogBook[] = directorBooks
    .map((b): CatalogBook | null => {
      const o = overrideMap.get(b.id);
      if (o?.removed) return null;
      if (!o) return { ...b, status: "Published" };
      return {
        ...b,
        title: o.title ?? b.title,
        author: o.author ?? b.author,
        language: o.language ?? b.language,
        pages: o.pages ?? b.pages,
        category: o.category ?? b.category,
        status: o.status ?? "Published",
        pageNumbering: o.pageNumbering ?? b.pageNumbering,
      };
    })
    .filter((b): b is CatalogBook => b !== null);

  const customBooks: CatalogBook[] = overrides
    .filter(o => o.isCustom && !o.removed)
    .map((o): CatalogBook => ({
      id: o.id,
      title: o.title || "Untitled Book",
      author: o.author || "",
      description: "",
      language: o.language || "English",
      category: o.category || "General Knowledge",
      cover: "",
      // A real Upload Queue approval sets pdfDataUrl (an actual openable
      // PDF); Book Management's own mock-upload never does, so a book
      // added that way still ends up with "" here — same as before.
      pdf: o.pdfDataUrl || "",
      pages: o.pages || 0,
      status: o.status || "Draft",
      isCustom: true,
      pageNumbering: o.pageNumbering,
    }));

  return [...fromCatalog, ...customBooks].filter(b => (b.status ?? "Published") === "Published");
}

/** Hydration-safe hook for components with no mount gate of their own —
 *  returns the raw static directorBooks list during SSR and the client's
 *  first (hydration) render (byte-identical to today's behavior, so it
 *  can never cause a mismatch), then swaps to the real merged catalog in
 *  a useEffect, i.e. strictly after hydration — a normal post-mount
 *  state update, not part of hydration reconciliation. */
export function usePublicCatalog(): CatalogBook[] {
  const [books, setBooks] = useState<CatalogBook[]>(directorBooks);
  useEffect(() => {
    setBooks(getPublicCatalog());
  }, []);
  return books;
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { getCurrentBook, buildCurrentBookUrl, type CurrentBookRecord } from "@/lib/currentBook";

/** Compact "Return to Book" banner — reads the shared current-book record
 * (if any) and links straight back to the exact reader route, book, and
 * page. Renders nothing when no valid context exists (never a dead/empty
 * control). The record only exists in localStorage, so it's read after
 * mount and this deliberately renders nothing on the very first paint —
 * that first null render matches the server render exactly, so there is
 * no hydration mismatch; the banner simply fades in a moment later if a
 * valid book is found. */
export default function ReturnToBook() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const [record, setRecord] = useState<CurrentBookRecord | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setRecord(getCurrentBook());
  }, []);

  if (!mounted || !record) return null;

  const href = buildCurrentBookUrl(record);

  return (
    <Link
      href={href}
      className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200 transition-colors hover:bg-amber-100"
    >
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <span aria-hidden="true">📖</span>
        <span className="flex-shrink-0 font-bold text-amber-900">{t.returnToBook}</span>
        <span className="truncate text-amber-700">— {record.title}</span>
        <span className="flex-shrink-0 text-xs font-semibold text-amber-600">
          ({t.commonPage} {record.page})
        </span>
      </span>
      <span aria-hidden="true" className="flex-shrink-0 text-amber-600">→</span>
    </Link>
  );
}

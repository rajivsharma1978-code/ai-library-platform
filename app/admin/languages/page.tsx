"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import {
  loadBookOverrides, buildDisplayBooks, loadLanguageSettings, saveLanguageSettings,
  usingDemoLanguageSettings, logActivity, type AdminLanguageSetting,
} from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";

export default function AdminLanguagesPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [settings, setSettings] = useState<AdminLanguageSetting[]>([]);
  const [usingDemo, setUsingDemo] = useState(false);
  const [bookCounts, setBookCounts] = useState<Record<string, number>>({});

  function refresh() {
    setSettings(loadLanguageSettings());
    setUsingDemo(usingDemoLanguageSettings());
    const overrides = loadBookOverrides();
    const books = buildDisplayBooks(directorBooks as any[], overrides);
    const counts: Record<string, number> = {};
    books.forEach(b => { counts[b.language] = (counts[b.language] || 0) + 1; });
    setBookCounts(counts);
  }

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") {
      router.push("/admin-login");
      return;
    }
    setCheckedAccess(true);
    refresh();
    setMounted(true);
  }, [router]);

  function toggleEnabled(lang: AdminLanguageSetting) {
    const next = settings.map(s => s.language === lang.language ? { ...s, enabled: !s.enabled } : s);
    saveLanguageSettings(next);
    logActivity("edit", `${lang.language} ${lang.enabled ? "disabled" : "enabled"} for the platform`);
    refresh();
  }

  function updateTarget(lang: AdminLanguageSetting, value: number) {
    const next = settings.map(s => s.language === lang.language ? { ...s, targetCoveragePercent: value } : s);
    saveLanguageSettings(next);
    refresh();
  }

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
        <p className="text-sm font-semibold text-slate-400">{t.adminCheckingAccess}</p>
      </main>
    );
  }

  const totalBooks = Object.values(bookCounts).reduce((a, b) => a + b, 0);
  const enabledCount = settings.filter(s => s.enabled).length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex flex-col lg:flex-row">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <PageHeader
          badge={t.adminLangBadge}
          title={t.adminQuickLanguageSettings}
          subtitle={t.adminLangSubtitle}
          homeLabel={t.commonHome}
          showHomeLink={false}
        />

        <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
          📌 {t.adminDemoDisclaimer}
        </InfoCard>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label={t.adminLangStatTracked} value={settings.length} />
          <StatCard label={t.commonEnabled} value={enabledCount} valueClassName="text-green-600" />
          <StatCard label={t.adminLangStatBooksInCatalog} value={totalBooks} badge={usingDemo ? t.adminLangDemoSettingsBadge : undefined} />
        </div>

        <InfoCard className="mt-8">
          <h3 className="text-2xl font-black text-slate-950">{t.adminLanguageCoverageHeading}</h3>
          <div className="mt-6 space-y-6">
            {settings.map(s => {
              const count = bookCounts[s.language] || 0;
              const actualPct = totalBooks > 0 ? Math.round((count / totalBooks) * 100) : 0;
              return (
                <div key={s.language} className="rounded-2xl border border-slate-100 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{s.language}</p>
                      <p className="text-xs text-slate-500">{t.adminLangBooksInCatalogStat.replace("{count}", String(count)).replace("{pct}", String(actualPct))}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        {t.adminLangTargetCoverageLabel}
                        <input
                          type="number" min={0} max={100} value={s.targetCoveragePercent}
                          onChange={(e) => updateTarget(s, Math.max(0, Math.min(100, Number(e.target.value))))}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                        />%
                      </label>
                      <button
                        onClick={() => toggleEnabled(s)}
                        className={`rounded-full px-4 py-1.5 text-xs font-bold ${s.enabled ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}
                      >
                        {s.enabled ? t.commonEnabled : t.adminLangDisabled}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 w-full bg-slate-200 h-3 rounded-full">
                    <div className="bg-amber-500 h-3 rounded-full" style={{ width: `${actualPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </InfoCard>
      </section>
    </main>
  );
}

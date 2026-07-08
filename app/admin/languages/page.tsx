"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { directorBooks } from "@/lib/directorBooks";
import {
  loadBookOverrides, buildDisplayBooks, loadLanguageSettings, saveLanguageSettings,
  usingDemoLanguageSettings, logActivity, type AdminLanguageSetting,
} from "@/components/admin/adminData";

export default function AdminLanguagesPage() {
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
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-semibold text-slate-400">Checking admin access…</p>
      </main>
    );
  }

  const totalBooks = Object.values(bookCounts).reduce((a, b) => a + b, 0);
  const enabledCount = settings.filter(s => s.enabled).length;

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-teal-700 to-blue-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · Languages</p>
          <h2 className="text-4xl font-bold mt-2">Language Settings</h2>
          <p className="mt-3 text-teal-100">Manage which languages are available, and track catalog coverage per language.</p>
        </div>

        <div className="mt-6 rounded-2xl bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-slate-900">{settings.length}</p><p className="text-slate-500 text-sm mt-1">Languages Tracked</p></div>
          <div className="bg-white rounded-2xl p-5 shadow"><p className="text-3xl font-bold text-green-600">{enabledCount}</p><p className="text-slate-500 text-sm mt-1">Enabled</p></div>
          <div className="bg-white rounded-2xl p-5 shadow">
            <p className="text-3xl font-bold text-blue-600">{totalBooks}</p>
            <p className="text-slate-500 text-sm mt-1">Books in Catalog</p>
            {usingDemo && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">demo settings</span>}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-lg mt-8">
          <h3 className="text-2xl font-bold">Language Coverage</h3>
          <div className="mt-6 space-y-6">
            {settings.map(s => {
              const count = bookCounts[s.language] || 0;
              const actualPct = totalBooks > 0 ? Math.round((count / totalBooks) * 100) : 0;
              return (
                <div key={s.language} className="rounded-2xl border border-slate-100 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{s.language}</p>
                      <p className="text-xs text-slate-500">{count} book{count === 1 ? "" : "s"} in catalog · {actualPct}% of total</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        Target coverage
                        <input
                          type="number" min={0} max={100} value={s.targetCoveragePercent}
                          onChange={(e) => updateTarget(s, Math.max(0, Math.min(100, Number(e.target.value))))}
                          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm outline-none"
                        />%
                      </label>
                      <button
                        onClick={() => toggleEnabled(s)}
                        className={`rounded-full px-4 py-1.5 text-xs font-bold ${s.enabled ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}
                      >
                        {s.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 w-full bg-slate-200 h-3 rounded-full">
                    <div className="bg-teal-600 h-3 rounded-full" style={{ width: `${actualPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

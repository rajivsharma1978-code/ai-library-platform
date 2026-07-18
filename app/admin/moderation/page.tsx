"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import {
  loadModeration, saveModeration, usingDemoModeration, logActivity,
  type ModerationFlag, type ModerationSeverity,
} from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import FilterBar from "@/components/ui/FilterBar";

// Fixed severity/status sets compared and stored using these exact
// English values — only their on-screen text goes through
// SEVERITY_LABELS/STATUS_LABELS below.
const SEVERITY_COLORS: Record<ModerationSeverity, string> = {
  Low: "bg-slate-200 text-slate-600",
  Medium: "bg-yellow-100 text-yellow-700",
  High: "bg-red-100 text-red-700",
};

type ModerationFilter = "All" | "Open" | "Resolved";

function timeAgo(ts: number, t: { [K in keyof typeof UI_TEXT["en"]]: string }): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t.mySpaceJustNow;
  if (mins < 60) return t.mySpaceMinAgo.replace("{n}", String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t.mySpaceHourAgo.replace("{n}", String(hrs));
  return t.mySpaceDayAgo.replace("{n}", String(Math.floor(hrs / 24)));
}

export default function AdminModerationPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [flags, setFlags] = useState<ModerationFlag[]>([]);
  const [usingDemo, setUsingDemo] = useState(false);
  const [filter, setFilter] = useState<ModerationFilter>("Open");

  const FILTER_OPTIONS: { key: ModerationFilter; label: string }[] = [
    { key: "Open", label: t.adminModerationStatOpen },
    { key: "Resolved", label: t.adminModerationStatResolved },
    { key: "All", label: t.commonAll },
  ];
  const SEVERITY_LABELS: Record<ModerationSeverity, string> = {
    Low: t.adminModerationSeverityLow, Medium: t.adminModerationSeverityMedium, High: t.adminModerationSeverityHigh,
  };
  const STATUS_LABELS: Record<ModerationFlag["status"], string> = {
    Open: t.adminModerationStatOpen, Resolved: t.adminModerationStatResolved,
  };

  function refresh() {
    setFlags(loadModeration());
    setUsingDemo(usingDemoModeration());
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

  function resolve(flag: ModerationFlag) {
    saveModeration(flags.map(f => f.id === flag.id ? { ...f, status: "Resolved" as const } : f));
    logActivity("moderation", `Flag on "${flag.subject}" marked resolved`);
    refresh();
  }
  function reopen(flag: ModerationFlag) {
    saveModeration(flags.map(f => f.id === flag.id ? { ...f, status: "Open" as const } : f));
    logActivity("moderation", `Flag on "${flag.subject}" reopened`);
    refresh();
  }
  function dismiss(flag: ModerationFlag) {
    saveModeration(flags.filter(f => f.id !== flag.id));
    logActivity("moderation", `Flag on "${flag.subject}" dismissed`);
    refresh();
  }

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
        <p className="text-sm font-semibold text-slate-400">{t.adminCheckingAccess}</p>
      </main>
    );
  }

  const open = flags.filter(f => f.status === "Open").length;
  const resolved = flags.filter(f => f.status === "Resolved").length;
  const highSeverity = flags.filter(f => f.severity === "High" && f.status === "Open").length;
  const visible = flags.filter(f => filter === "All" || f.status === filter);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <PageHeader
          badge={t.adminModerationBadge}
          title={t.adminModerationTitle}
          subtitle={t.adminModerationSubtitle}
          homeLabel={t.commonHome}
        />

        <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
          📌 {t.adminDemoDisclaimer}
        </InfoCard>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t.adminModerationStatTotal} value={flags.length} badge={usingDemo ? t.commonDemo : undefined} />
          <StatCard label={t.adminModerationStatOpen} value={open} valueClassName="text-yellow-600" />
          <StatCard label={t.adminModerationStatResolved} value={resolved} valueClassName="text-green-600" />
          <StatCard label={t.adminModerationStatHighSeverity} value={highSeverity} valueClassName="text-red-600" />
        </div>

        <div className="mt-6">
          <FilterBar options={FILTER_OPTIONS} active={filter} onChange={setFilter} />
        </div>

        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 mt-6 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{[t.adminModerationTableSubject, t.adminModerationTableReason, t.adminModerationTableSeverity, t.adminBmFieldStatus, t.adminModerationTableFlagged, t.adminBmTableActions].map(h => (
                <th key={h} className="text-left px-6 py-4 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {visible.map(f => (
                <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-800">{f.subject}</td>
                  <td className="px-6 py-4 text-slate-600">{f.reason}</td>
                  <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${SEVERITY_COLORS[f.severity]}`}>{SEVERITY_LABELS[f.severity] ?? f.severity}</span></td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${f.status === "Open" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                      {STATUS_LABELS[f.status] ?? f.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{timeAgo(f.flaggedAt, t)}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      {f.status === "Open" ? (
                        <button onClick={() => resolve(f)} className="text-green-600 hover:underline text-xs font-semibold">{t.adminModerationResolve}</button>
                      ) : (
                        <button onClick={() => reopen(f)} className="text-blue-600 hover:underline text-xs font-semibold">{t.adminModerationReopen}</button>
                      )}
                      <button onClick={() => dismiss(f)} className="text-red-500 hover:underline text-xs font-semibold">{t.adminUqDismiss}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="text-center text-slate-400 py-12">{t.adminModerationEmpty}</p>}
        </div>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import {
  loadBookOverrides, loadActivity, loadAIUsage, buildDisplayBooks,
  loadUsers, usingDemoUsers,
  type AdminActivityEntry, type ActivityType,
} from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import AppButton from "@/components/ui/AppButton";

const DEMO_AI_QUESTIONS = 24;

const ACTIVITY_ICON: Record<ActivityType, string> = {
  add: "➕", edit: "✏️", delete: "🗑️", upload: "⬆️", ai: "🤖", moderation: "🛡️",
};

export default function AdminPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);

  useEffect(() => {
    const access = localStorage.getItem("ndlAdminAccess");
    if (access !== "granted") {
      router.push("/admin-login");
      return;
    }
    setCheckedAccess(true);
    setMounted(true);
  }, [router]);

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t.mySpaceJustNow;
    if (mins < 60) return t.mySpaceMinAgo.replace("{n}", String(mins));
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t.mySpaceHourAgo.replace("{n}", String(hrs));
    return t.mySpaceDayAgo.replace("{n}", String(Math.floor(hrs / 24)));
  }

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
        <p className="text-sm font-semibold text-slate-400">{t.adminCheckingAccess}</p>
      </main>
    );
  }

  const DEMO_ACTIVITY: AdminActivityEntry[] = [
    { id: "demo-1", type: "upload",     message: t.adminDashboardDemoActivity1, timestamp: Date.now() - 1000 * 60 * 40 },
    { id: "demo-2", type: "edit",       message: t.adminDashboardDemoActivity2, timestamp: Date.now() - 1000 * 60 * 60 * 3 },
    { id: "demo-3", type: "ai",        message: t.adminDashboardDemoActivity3, timestamp: Date.now() - 1000 * 60 * 60 * 5 },
    { id: "demo-4", type: "moderation", message: t.adminDashboardDemoActivity4, timestamp: Date.now() - 1000 * 60 * 60 * 20 },
    { id: "demo-5", type: "add",        message: t.adminDashboardDemoActivity5, timestamp: Date.now() - 1000 * 60 * 60 * 30 },
  ];

  const overrides = loadBookOverrides();
  const displayBooks = buildDisplayBooks(directorBooks as any[], overrides);
  const totalBooks = displayBooks.length;
  const publishedBooks = displayBooks.filter(b => b.status === "Published").length;
  const draftBooks = displayBooks.filter(b => b.status === "Draft").length;
  const uploadQueueCount = displayBooks.filter(b => b.status === "Pending" || b.status === "Under Review").length;
  const uniqueLanguages = new Set(displayBooks.map(b => b.language)).size;

  const aiUsage = loadAIUsage();
  const aiQuestions = aiUsage.questionsAsked > 0 ? aiUsage.questionsAsked : DEMO_AI_QUESTIONS;
  const usingDemoAI = aiUsage.questionsAsked === 0;

  // Same list Admin → Users manages — Add/Remove there now shows up here
  // too, instead of a number nothing was ever connected to.
  const userCount = loadUsers().length;
  const usingDemoUsersCount = usingDemoUsers();

  const realActivity = loadActivity();
  const usingDemoActivity = realActivity.length === 0;
  const activity = (usingDemoActivity ? DEMO_ACTIVITY : realActivity).slice(0, 8);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex flex-col lg:flex-row">
      <AdminSidebar />

      <section className="flex-1 p-8 overflow-auto">
        <PageHeader
          badge={t.adminDashboardBadge}
          title={t.adminDashboardTitle}
          subtitle={t.adminDashboardSubtitle}
          homeLabel={t.commonHome}
          showHomeLink={false}
          right={
            <AppButton href="/admin/ministerial-report" variant="secondary" size="sm">
              📄 {t.adminReportButton}
            </AppButton>
          }
        />

        <InfoCard tone="amber" className="mb-8 py-3 text-sm font-semibold">
          📌 {t.adminDemoDisclaimer}
        </InfoCard>

        {/* 1. Dashboard overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <StatCard icon="📚" label={t.adminStatTotalBooks} value={totalBooks} />
          <StatCard icon="✅" label={t.adminStatPublished} value={publishedBooks} />
          <StatCard icon="📝" label={t.adminStatDraft} value={draftBooks} />
          <StatCard icon="👥" label={t.adminNavUsers} value={userCount} badge={usingDemoUsersCount ? t.commonDemo : undefined} />
          <StatCard icon="🤖" label={t.adminStatAiQuestions} value={aiQuestions} badge={usingDemoAI ? t.commonDemo : undefined} />
          <StatCard icon="🌐" label={t.adminNavLanguages} value={uniqueLanguages} />
          <StatCard icon="⬆️" label={t.adminNavUploadQueue} value={uploadQueueCount} />
          <StatCard icon="🕐" label={t.mySpaceRecentActivity} value={activity.length} />
        </div>

        {/* 3. Admin Activity */}
        <InfoCard className="mt-8">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-950">{t.mySpaceRecentActivity}</h3>
            {usingDemoActivity && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase text-amber-700">{t.commonDemo}</span>
            )}
          </div>
          <div className="mt-6 space-y-1">
            {activity.map((a, i) => (
              <div key={a.id} className={`flex items-center gap-3 py-3 ${i !== activity.length - 1 ? "border-b border-slate-100" : ""}`}>
                <span className="text-lg">{ACTIVITY_ICON[a.type] ?? "•"}</span>
                <span className="flex-1 text-slate-700">{a.message}</span>
                <span className="text-slate-400 text-sm flex-shrink-0">{timeAgo(a.timestamp)}</span>
              </div>
            ))}
          </div>
        </InfoCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          <InfoCard>
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-950">{t.adminAiSystemStatusHeading}</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase text-slate-500">{t.adminStaticBadge}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{t.adminAiSystemStatusNote}</p>
            <div className="mt-6 space-y-4">
              {[
                [t.adminAiProviderLabel, t.adminAiProviderValue],
                [t.adminPdfExtractionLabel, t.commonEnabled],
                [t.settingsMultilingualAi, t.commonEnabled],
                [t.adminVoiceReaderLabel, t.commonEnabled],
                [t.adminFallbackModeLabel, t.commonEnabled],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-100 pb-3">
                  <span className="text-slate-700">{label}</span>
                  <span className="font-bold text-green-600">{value}</span>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard>
            <h3 className="text-2xl font-black text-slate-950">{t.adminLanguageCoverageHeading}</h3>
            <div className="mt-6 space-y-4">
              {Array.from(new Set(displayBooks.map(b => b.language))).map(lang => {
                const count = displayBooks.filter(b => b.language === lang).length;
                const pct = Math.round((count / Math.max(1, totalBooks)) * 100);
                return (
                  <div key={lang}>
                    <div className="flex justify-between text-sm text-slate-700">
                      <p>{lang}</p>
                      <p>{t.adminLanguageCoverageStat.replace("{count}", String(count)).replace("{pct}", String(pct))}</p>
                    </div>
                    <div className="w-full bg-slate-200 h-3 rounded-full mt-2">
                      <div className="bg-amber-500 h-3 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </InfoCard>
        </div>
      </section>
    </main>
  );
}

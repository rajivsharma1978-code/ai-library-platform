"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { loadAIUsage, loadActivity, type AdminActivityEntry, type AIFeature } from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";

const DEMO_AI_QUESTIONS = 24;

export default function AdminAIUsagePage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [aiQuestions, setAiQuestions] = useState(0);
  const [lastUsedAt, setLastUsedAt] = useState<number | undefined>(undefined);
  const [usingDemo, setUsingDemo] = useState(false);
  const [aiActivity, setAiActivity] = useState<AdminActivityEntry[]>([]);
  const [featureCounts, setFeatureCounts] = useState<Partial<Record<AIFeature, number>> | null>(null);

  // Shown only until real per-feature usage exists — every AI action
  // (Explain, Summarize, Translate, Quiz, Flashcards, Revision) now calls
  // trackAIUsage(), which fills in ndl_ai_usage_stats.byFeature for real.
  const FEATURE_LABELS: Record<AIFeature, string> = {
    explain: t.aiActionExplain, summarize: t.aiActionSummarize, translate: t.aiActionTranslate,
    quiz: t.quizPageTitle, flashcards: t.commonFlashcards, revision: t.navRevision,
  };
  const DEMO_FEATURE_BREAKDOWN: { feature: string; pct: number }[] = [
    { feature: FEATURE_LABELS.explain, pct: 32 },
    { feature: FEATURE_LABELS.summarize, pct: 24 },
    { feature: FEATURE_LABELS.quiz, pct: 20 },
    { feature: FEATURE_LABELS.translate, pct: 14 },
    { feature: FEATURE_LABELS.flashcards, pct: 10 },
  ];

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t.mySpaceJustNow;
    if (mins < 60) return t.mySpaceMinAgo.replace("{n}", String(mins));
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t.mySpaceHourAgo.replace("{n}", String(hrs));
    return t.mySpaceDayAgo.replace("{n}", String(Math.floor(hrs / 24)));
  }

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") {
      router.push("/admin-login");
      return;
    }
    setCheckedAccess(true);
    const usage = loadAIUsage();
    setUsingDemo(usage.questionsAsked === 0);
    setAiQuestions(usage.questionsAsked > 0 ? usage.questionsAsked : DEMO_AI_QUESTIONS);
    setLastUsedAt(usage.lastUsedAt);
    setAiActivity(loadActivity().filter(a => a.type === "ai"));

    const byFeature = usage.byFeature || {};
    const totalFeatureCount = (Object.values(byFeature) as number[]).reduce((a, b) => a + (b || 0), 0);
    if (totalFeatureCount > 0) {
      setFeatureCounts(byFeature);
    }
    setMounted(true);
  }, [router]);

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
        <p className="text-sm font-semibold text-slate-400">{t.adminCheckingAccess}</p>
      </main>
    );
  }

  const usingDemoFeatures = featureCounts === null;
  let featureBreakdown = DEMO_FEATURE_BREAKDOWN;
  if (featureCounts) {
    const totalFeatureCount = (Object.values(featureCounts) as number[]).reduce((a, b) => a + (b || 0), 0);
    featureBreakdown = (Object.entries(featureCounts) as [AIFeature, number][])
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([feature, count]) => ({ feature: FEATURE_LABELS[feature], pct: Math.round((count / totalFeatureCount) * 100) }));
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex flex-col lg:flex-row">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <PageHeader
          badge={t.adminAiUsageBadge}
          title={t.adminNavAiUsage}
          subtitle={t.adminAiUsageSubtitle}
          homeLabel={t.commonHome}
          showHomeLink={false}
        />

        <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
          📌 {t.adminDemoDisclaimer}
        </InfoCard>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t.adminAiStatTotalQuestions} value={aiQuestions} badge={usingDemo ? t.commonDemo : undefined} />
          <StatCard label={t.adminAiStatLastUsed} value={lastUsedAt ? timeAgo(lastUsedAt) : t.adminAiStatNoActivity} valueClassName="text-lg text-slate-950" />
          <StatCard label={t.adminAiStatSuccessRate} value="98%" valueClassName="text-green-600" badge={t.commonDemo} />
          <StatCard label={t.adminAiStatAvgResponseTime} value="1.4s" badge={t.commonDemo} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
          <InfoCard>
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-950">{t.adminAiByFeatureHeading}</h3>
              {usingDemoFeatures && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase text-amber-700">{t.commonDemo}</span>
              )}
            </div>
            <div className="mt-6 space-y-4">
              {featureBreakdown.map(f => (
                <div key={f.feature}>
                  <div className="flex justify-between text-sm text-slate-700"><p>{f.feature}</p><p>{f.pct}%</p></div>
                  <div className="w-full bg-slate-200 h-3 rounded-full mt-2">
                    <div className="bg-amber-500 h-3 rounded-full" style={{ width: `${f.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard>
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-slate-950">{t.adminAiSystemStatusHeading}</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase text-slate-500">{t.adminStaticBadge}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{t.adminAiSystemStatusNote}</p>
            <div className="mt-6 space-y-4">
              {[
                [t.adminAiProviderLabel, t.adminAiProviderValue],
                [t.adminAiResponseLanguageSupportLabel, t.adminAiResponseLanguageSupportValue],
                [t.adminVoiceReaderLabel, t.commonEnabled],
                [t.adminFallbackModeLabel, t.commonEnabled],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-100 pb-3">
                  <span className="text-slate-700">{label}</span><span className="font-bold text-green-600">{value}</span>
                </div>
              ))}
            </div>
          </InfoCard>
        </div>

        <InfoCard className="mt-8">
          <h3 className="text-2xl font-black text-slate-950">{t.mySpaceRecentActivity}</h3>
          {aiActivity.length === 0 ? (
            <p className="mt-4 text-slate-500">{t.adminAiEmptyActivity}</p>
          ) : (
            <div className="mt-6 space-y-1">
              {aiActivity.map((a, i) => (
                <div key={a.id} className={`flex items-center gap-3 py-3 ${i !== aiActivity.length - 1 ? "border-b border-slate-100" : ""}`}>
                  <span className="text-lg">🤖</span>
                  <span className="flex-1 text-slate-700">{a.message}</span>
                  <span className="text-slate-400 text-sm flex-shrink-0">{timeAgo(a.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </InfoCard>
      </section>
    </main>
  );
}

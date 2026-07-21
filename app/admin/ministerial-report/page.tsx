"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UI_TEXT, LANGUAGE_NAMES } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// ══════════════════════════════════════════════════════════════════════
// Ministerial Report — /admin/ministerial-report
// ──────────────────────────────────────────────────────────────────────
// A demo-only executive briefing page: an "official impact report" look
// (navy masthead, ivory page, restrained saffron accent, serif display
// type) rather than another operational analytics dashboard. Every
// number on this page is illustrative — see METRICS/etc. below and the
// always-visible DEMO DATA disclosure in the masthead.
//
// Admin-only: same localStorage guard every other /admin/* page uses
// (see app/admin/page.tsx). Deliberately NOT added to AdminSidebar's
// nav — the Dashboard header button is the one, uncrowded entry point
// (see app/admin/page.tsx's PageHeader `right` slot).
// ══════════════════════════════════════════════════════════════════════

// ── Illustrative demo data — language-independent, so labels (from
// UI_TEXT) can be swapped per-language while every number below stays
// identical across languages, per the brief. ──────────────────────────
const METRICS = {
  registeredLearners: "18.4 Lakh+",
  urbanReachPct: 58,
  ruralReachPct: 42,
  avgEngagementTime: "27 min",
  digitalBooks: "62,000+",
  languagesSupported: "12",
  readingSessions: "4.2 Crore+",
  aiTutorInteractions: "96 Lakh+",
  summariesGenerated: "21 Lakh+",
  translationsGenerated: "8.7 Lakh+",
  readAloudSessions: "3.1 Lakh+",
  accessibilityFeatureUsage: "1.4 Lakh+",
  completionRatePct: 71,
  retentionPct: 64,
  satisfactionScore: "4.6 / 5",
};

// Language names always render in their own native script (same
// convention the language switcher elsewhere in the app uses) rather
// than being translated per current UI language.
const LANGUAGE_DISTRIBUTION = [
  { code: "hi" as const, pct: 34 },
  { code: "en" as const, pct: 22 },
  { code: "ta" as const, pct: 11 },
  { code: "bn" as const, pct: 9 },
  { code: "te" as const, pct: 8 },
  { code: "mr" as const, pct: 7 },
];

export default function MinisterialReportPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") {
      router.push("/admin-login");
      return;
    }
    setCheckedAccess(true);
    setMounted(true);
  }, [router]);

  // Date VALUE (not just the label) follows the current UI language too —
  // toLocaleDateString needs an explicit BCP-47 locale, since `undefined`
  // falls back to the browser's own locale regardless of the app's
  // selected language.
  const LOCALE_BY_LANGUAGE: Record<typeof language, string> = {
    en: "en-IN", hi: "hi-IN", ta: "ta-IN", bn: "bn-IN", te: "te-IN", mr: "mr-IN",
  };
  const [generatedDate] = useState(() => new Date());
  const generatedOn = generatedDate.toLocaleDateString(LOCALE_BY_LANGUAGE[language], { year: "numeric", month: "long", day: "numeric" });

  const topSubjects = [
    { label: t.adminReportSubjectScience, value: 100 },
    { label: t.adminReportSubjectHistory, value: 86 },
    { label: t.adminReportSubjectMathematics, value: 78 },
    { label: t.adminReportSubjectLanguageLiterature, value: 71 },
    { label: t.adminReportSubjectComputerScience, value: 64 },
  ];

  const accessibilityFeatures = [
    { label: t.adminReportAccessibilityFeatureScreenReader, value: 100 },
    { label: t.adminReportAccessibilityFeatureVoiceNav, value: 82 },
    { label: t.adminReportAccessibilityFeatureHighContrast, value: 74 },
    { label: t.adminReportAccessibilityFeatureDyslexia, value: 61 },
  ];

  const stateAdoption = [
    { label: t.adminReportStateUp, value: 92 },
    { label: t.adminReportStateMaharashtra, value: 88 },
    { label: t.adminReportStateTamilNadu, value: 85 },
    { label: t.adminReportStateKarnataka, value: 81 },
    { label: t.adminReportStateWestBengal, value: 77 },
    { label: t.adminReportStateRajasthan, value: 74 },
  ];

  const recommendations = [
    t.adminReportRecommendation1,
    t.adminReportRecommendation2,
    t.adminReportRecommendation3,
    t.adminReportRecommendation4,
  ];

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAF6EC]">
        <p className="text-sm font-semibold text-slate-400">{t.adminCheckingAccess}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAF6EC] pb-16">
      {/* ── Toolbar — hidden in print ─────────────────────────────────── */}
      <div className="mr-print-hide sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
        <Link
          href="/admin"
          className="ndl-press inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
        >
          ← {t.adminReportBackToDashboard}
        </Link>
        <button
          onClick={() => window.print()}
          className="ndl-press inline-flex items-center gap-1.5 rounded-full bg-[#0b1f3a] px-4 py-2 text-xs font-bold text-white hover:bg-[#14325c]"
        >
          🖨️ {t.adminReportPrint}
        </button>
      </div>

      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-8">
        {/* ── Masthead ───────────────────────────────────────────────── */}
        <header className="mr-avoid-break overflow-hidden rounded-2xl bg-[#0b1f3a] px-6 py-8 text-white shadow-[0_20px_50px_rgba(11,31,58,0.25)] sm:px-10 sm:py-10">
          <div className="mb-5 h-[3px] w-16 bg-[#C1650A]" aria-hidden="true" />
          <p className="font-outfit text-[11px] font-bold uppercase tracking-[0.28em] text-[#e9b98a]">
            {t.adminReportOrgName} · {t.adminReportBadge}
          </p>
          <h1 className="mt-3 font-cormorant text-4xl font-bold leading-tight sm:text-5xl">
            {t.adminReportTitle}
          </h1>
          <p className="mt-2 font-outfit text-sm text-slate-300">{t.adminReportPreparedFor}</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-white/15 pt-5 font-outfit text-xs text-slate-300">
            <span>
              <span className="text-slate-400">{t.adminReportPeriodLabel}: </span>
              <span className="font-semibold text-white">{t.adminReportPeriodValue}</span>
            </span>
            <span>
              <span className="text-slate-400">{t.adminReportGeneratedLabel}: </span>
              <span className="font-semibold text-white">{generatedOn}</span>
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#C1650A] bg-[#C1650A]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#f3a86a]">
              ⚠ {t.adminReportDemoBadge}
            </span>
          </div>
        </header>

        {/* ── Disclosure — always visible, including in print ──────────── */}
        <p className="mr-avoid-break mt-4 rounded-xl border border-[#C1650A]/40 bg-[#C1650A]/[0.06] px-5 py-3 font-outfit text-xs leading-relaxed text-[#7a3f08]">
          {t.adminReportDisclosure}
        </p>

        {/* ── 1. Executive Summary ─────────────────────────────────────── */}
        <Section eyebrow="01" title={t.adminReportSectionExecutiveSummary}>
          <p className="font-outfit text-[15px] leading-relaxed text-slate-700">{t.adminReportExecutiveSummaryBody}</p>
        </Section>

        {/* ── 2. National Reach ────────────────────────────────────────── */}
        <Section eyebrow="02" title={t.adminReportSectionNationalReach}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label={t.adminReportMetricRegisteredLearners} value={METRICS.registeredLearners} />
            <Metric label={t.adminReportMetricUrbanReach} value={`${METRICS.urbanReachPct}%`} />
            <Metric label={t.adminReportMetricRuralReach} value={`${METRICS.ruralReachPct}%`} />
            <Metric label={t.adminReportMetricEngagementTime} value={METRICS.avgEngagementTime} />
          </div>
          <div
            className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={`${t.adminReportMetricUrbanReach} ${METRICS.urbanReachPct}%, ${t.adminReportMetricRuralReach} ${METRICS.ruralReachPct}%`}
          >
            <div className="h-full bg-[#0b1f3a]" style={{ width: `${METRICS.urbanReachPct}%` }} />
            <div className="h-full bg-[#C1650A]" style={{ width: `${METRICS.ruralReachPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between font-outfit text-[11px] font-semibold text-slate-500">
            <span>🔵 {t.adminReportMetricUrbanReach}</span>
            <span>🟠 {t.adminReportMetricRuralReach}</span>
          </div>
        </Section>

        {/* ── 3. Knowledge and Content Access ──────────────────────────── */}
        <Section eyebrow="03" title={t.adminReportSectionContentAccess}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric label={t.adminReportMetricDigitalBooks} value={METRICS.digitalBooks} />
            <Metric label={t.adminReportMetricLanguages} value={METRICS.languagesSupported} />
            <Metric label={t.adminReportMetricReadingSessions} value={METRICS.readingSessions} />
          </div>
        </Section>

        {/* ── 4. Language Inclusion ─────────────────────────────────────── */}
        <Section eyebrow="04" title={t.adminReportSectionLanguageInclusion}>
          <p className="mb-4 font-outfit text-[15px] leading-relaxed text-slate-700">{t.adminReportLanguageInclusionBody}</p>
          <RankedBars items={LANGUAGE_DISTRIBUTION.map(l => ({ label: LANGUAGE_NAMES[l.code], value: l.pct, display: `${l.pct}%` }))} max={34} />
        </Section>

        {/* ── 5. AI Learning Engagement ────────────────────────────────── */}
        <Section eyebrow="05" title={t.adminReportSectionAiEngagement}>
          <p className="mb-4 font-outfit text-[15px] leading-relaxed text-slate-700">{t.adminReportAiEngagementBody}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric label={t.adminReportMetricAiInteractions} value={METRICS.aiTutorInteractions} />
            <Metric label={t.adminReportMetricSummaries} value={METRICS.summariesGenerated} />
            <Metric label={t.adminReportMetricTranslations} value={METRICS.translationsGenerated} />
          </div>
        </Section>

        {/* ── 6. Accessibility Impact ──────────────────────────────────── */}
        <Section eyebrow="06" title={t.adminReportSectionAccessibilityImpact}>
          <p className="mb-4 font-outfit text-[15px] leading-relaxed text-slate-700">{t.adminReportAccessibilityImpactBody}</p>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Metric label={t.adminReportMetricReadAloud} value={METRICS.readAloudSessions} />
            <Metric label={t.adminReportMetricAccessibilityUsage} value={METRICS.accessibilityFeatureUsage} />
          </div>
          <RankedBars items={accessibilityFeatures.map(f => ({ label: f.label, value: f.value, display: `${f.value}` }))} max={100} />
        </Section>

        {/* ── 7. Most-Accessed Subjects ────────────────────────────────── */}
        <Section eyebrow="07" title={t.adminReportSectionTopSubjects}>
          <RankedBars items={topSubjects.map(s => ({ label: s.label, value: s.value, display: `${s.value}` }))} max={100} />
        </Section>

        {/* ── 8. State-wise Adoption Preview ───────────────────────────── */}
        <Section eyebrow="08" title={t.adminReportSectionStateAdoption}>
          <div className="mr-avoid-break overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[420px] border-collapse font-outfit text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3">{t.adminReportStateTableState}</th>
                  <th scope="col" className="px-4 py-3">{t.adminReportStateTableAdoption}</th>
                </tr>
              </thead>
              <tbody>
                {stateAdoption.map((s, i) => (
                  <tr key={s.label} className={i !== stateAdoption.length - 1 ? "border-b border-slate-100" : ""}>
                    <td className="px-4 py-3 font-semibold text-slate-800">{s.label}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-[#0b1f3a]" style={{ width: `${s.value}%` }} />
                        </div>
                        <span className="w-9 flex-shrink-0 font-bold tabular-nums text-slate-700">{s.value}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── 9. Learner Outcomes ──────────────────────────────────────── */}
        <Section eyebrow="09" title={t.adminReportSectionLearnerOutcomes}>
          <p className="mb-4 font-outfit text-[15px] leading-relaxed text-slate-700">{t.adminReportLearnerOutcomesBody}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric label={t.adminReportOutcomeCompletion} value={`${METRICS.completionRatePct}%`} />
            <Metric label={t.adminReportOutcomeRetention} value={`${METRICS.retentionPct}%`} />
            <Metric label={t.adminReportOutcomeSatisfaction} value={METRICS.satisfactionScore} />
          </div>
        </Section>

        {/* ── 10. Strategic Recommendations ────────────────────────────── */}
        <Section eyebrow="10" title={t.adminReportSectionRecommendations}>
          <ol className="space-y-3">
            {recommendations.map((r, i) => (
              <li key={i} className="flex gap-3 font-outfit text-[15px] leading-relaxed text-slate-700">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#0b1f3a] font-outfit text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </Section>

        {/* ── Footer disclosure repeat — always visible, print-safe ─────── */}
        <p className="mr-avoid-break mt-8 border-t border-slate-200 pt-5 text-center font-outfit text-[11px] text-slate-400">
          {t.adminReportDemoBadge} — {t.adminReportDisclosure}
        </p>
      </div>

      {/* ── Print styles ────────────────────────────────────────────────
          Hides the sticky toolbar, forces a white print background, and
          keeps sections/cards/the table from splitting across a page
          break where practical. Title, date, and the DEMO DATA
          disclosure are ordinary page content, so they print by default
          — nothing special needed to keep them visible. */}
      <style>{`
        .mr-avoid-break { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          .mr-print-hide { display: none !important; }
          main { background: #fff !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </main>
  );
}

// ── Section — eyebrow label + cormorant heading + bordered ivory card,
// the report's one repeated structural unit. ──────────────────────────
function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mr-avoid-break mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-6 sm:px-8 sm:py-7">
      <p className="font-outfit text-[11px] font-bold uppercase tracking-[0.24em] text-[#C1650A]">{eyebrow}</p>
      <h2 className="mt-1 font-cormorant text-2xl font-bold text-[#0b1f3a] sm:text-[28px]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ── Metric — a single KPI tile. ────────────────────────────────────────
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-[#FAF6EC] px-4 py-4">
      <p className="font-outfit text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-outfit text-2xl font-bold tabular-nums text-[#0b1f3a]">{value}</p>
    </div>
  );
}

// ── RankedBars — a labelled list with a proportional bar per row, used
// for language distribution, accessibility feature usage, and top
// subjects. Every bar has a readable text value alongside it (no
// visual-only encoding). ────────────────────────────────────────────────
function RankedBars({ items, max }: { items: { label: string; value: number; display: string }[]; max: number }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between font-outfit text-sm text-slate-700">
            <span className="font-semibold">{item.label}</span>
            <span className="tabular-nums text-slate-500">{item.display}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-[#0b1f3a]"
              style={{ width: `${Math.min(100, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

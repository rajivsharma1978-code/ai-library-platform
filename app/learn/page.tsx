"use client";

import Link from "next/link";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import PageHeader from "@/components/ui/PageHeader";
import InfoCard from "@/components/ui/InfoCard";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";

// ── /learn — Phase B1 navigation foundation only ────────────────────────
// This is deliberately a thin placeholder, not the real Learn workspace.
// The full redesign (Continue Learning, Highlights, Study Plan, AI Tutor
// activity, etc — see the approved mobile architecture) is Phase G's job.
// Right now this route exists purely so the "Learn" bottom-nav tab has
// somewhere real to land, with simple links into the six learner tools
// that already exist and already work.
type LearnLinkKey = "myBooksTitle" | "navNotes" | "navRevision" | "commonFlashcards" | "quizPageTitle" | "navAnalytics";

const LEARN_LINKS: { icon: string; href: string; labelKey: LearnLinkKey }[] = [
  { icon: "📖", href: "/my-books", labelKey: "myBooksTitle" },
  { icon: "📝", href: "/notes", labelKey: "navNotes" },
  { icon: "🔄", href: "/revision", labelKey: "navRevision" },
  { icon: "🎴", href: "/flashcards", labelKey: "commonFlashcards" },
  { icon: "❓", href: "/quiz", labelKey: "quizPageTitle" },
  { icon: "📊", href: "/analytics", labelKey: "navAnalytics" },
];

export default function LearnPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader title={t.navLearn} subtitle={t.learnPageSubtitle} homeLabel={t.commonHome} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEARN_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="block">
              <InfoCard className="flex min-h-[44px] items-center gap-4 transition hover:shadow-lg">
                <span className="text-3xl" aria-hidden="true">{link.icon}</span>
                <span className="text-base font-bold text-slate-900">{t[link.labelKey]}</span>
              </InfoCard>
            </Link>
          ))}
        </div>
      </div>
      <AccessibilityToolbar />
    </main>
  );
}

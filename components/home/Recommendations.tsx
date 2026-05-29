"use client";

import { motion } from "framer-motion";
import { RECOMMENDATIONS } from "./data";

const LEARNING_PATHS = [
  {
    title: "Public Policy Analyst Track",
    modules: 8,
    duration: "6 weeks",
    level: "Intermediate",
  },
  {
    title: "Climate Governance Essentials",
    modules: 6,
    duration: "4 weeks",
    level: "Beginner",
  },
  {
    title: "Digital Governance Research Path",
    modules: 10,
    duration: "8 weeks",
    level: "Advanced",
  },
];

const READING_HISTORY = [
  { title: "Constitutional Foundations", lastRead: "Yesterday", progress: 72 },
  { title: "Data Ethics for Public Servants", lastRead: "2 days ago", progress: 45 },
  { title: "Indian Economic Survey", lastRead: "Last week", progress: 88 },
];

const PROGRESS_CARDS = [
  { label: "Weekly reading goal", value: "5/7 chapters", trend: "+18%" },
  { label: "Research consistency", value: "12 day streak", trend: "+4 days" },
  { label: "Comprehension score", value: "91%", trend: "+6%" },
];

const AI_SUGGESTIONS = [
  "Revise Chapter 4 before starting Climate Governance path.",
  "You may benefit from a quick quiz on metadata standards.",
  "Schedule a 20-minute AI tutor session for constitutional law.",
];

export function Recommendations() {
  return (
    <section
      id="recommendations"
      className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      aria-labelledby="rec-heading"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-8 sm:p-10"
      >
        <motion.div
          className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-ndl-navy/10 px-3 py-1 text-xs font-semibold text-ndl-navy">
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-ndl-gold"
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                aria-hidden
              />
              Personalized for you
            </span>
            <h2
              id="rec-heading"
              className="mt-3 text-2xl font-bold text-ndl-navy sm:text-3xl"
            >
              AI recommendations
            </h2>
            <p className="mt-2 max-w-xl text-slate-600">
              Discover titles tailored to your reading history, research
              interests, and learning goals.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-ndl-navy px-5 py-2.5 text-sm font-semibold text-ndl-navy transition hover:bg-ndl-navy hover:text-white"
          >
            Refresh suggestions
          </button>
        </motion.div>

        <ul className="mt-10 divide-y divide-slate-200">
          {RECOMMENDATIONS.map((item, i) => (
            <motion.li
              key={item.title}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              <article className="flex flex-col gap-4 py-5 transition hover:bg-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-6">
                <div className="flex gap-4">
                  <motion.div
                    className="hidden h-16 w-12 shrink-0 rounded-md bg-gradient-to-br from-ndl-navy to-ndl-navy-light sm:block"
                    whileHover={{ scale: 1.05 }}
                    aria-hidden
                  />
                  <div>
                    <h3 className="font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{item.reason}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:shrink-0">
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {item.match}
                  </span>
                  <button
                    type="button"
                    className="rounded-lg bg-ndl-gold px-4 py-2 text-sm font-semibold text-ndl-navy transition hover:bg-ndl-gold-light"
                  >
                    Add to shelf
                  </button>
                </div>
              </article>
            </motion.li>
          ))}
        </ul>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold text-ndl-navy">Learning paths</h3>
            <ul className="mt-4 space-y-3">
              {LEARNING_PATHS.map((path) => (
                <li
                  key={path.title}
                  className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700"
                >
                  <p className="font-semibold text-slate-900">{path.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {path.modules} modules · {path.duration} · {path.level}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold text-ndl-navy">Reading history</h3>
            <ul className="mt-4 space-y-3">
              {READING_HISTORY.map((item) => (
                <li key={item.title} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <span className="text-xs text-slate-500">{item.lastRead}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-ndl-navy to-ndl-gold"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold text-ndl-navy">Progress cards</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {PROGRESS_CARDS.map((card) => (
                <article key={card.label} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{card.label}</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-700">{card.trend}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold text-ndl-navy">AI suggestion cards</h3>
            <div className="mt-4 space-y-3">
              {AI_SUGGESTIONS.map((suggestion, index) => (
                <article
                  key={suggestion}
                  className="rounded-lg border border-ndl-gold/40 bg-amber-50/60 p-3 text-sm text-slate-700"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-ndl-gold">
                    Suggestion {index + 1}
                  </p>
                  <p className="mt-1">{suggestion}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

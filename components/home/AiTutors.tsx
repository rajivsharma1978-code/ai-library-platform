"use client";

import { motion } from "framer-motion";
import { AI_TUTORS } from "./data";

export function AiTutors() {
  return (
    <section
      id="tutors"
      className="bg-ndl-surface py-20"
      aria-labelledby="tutors-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-ndl-gold">
            Intelligent learning
          </p>
          <h2
            id="tutors-heading"
            className="mt-1 text-2xl font-bold text-ndl-navy sm:text-3xl"
          >
            AI tutor cards
          </h2>
          <p className="mt-3 text-slate-600">
            Personalized tutoring across subjects — available 24/7 in multiple
            languages.
          </p>
        </motion.div>

        <motion.div
          className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.08 } },
          }}
        >
          {AI_TUTORS.map((tutor) => (
            <motion.article
              key={tutor.subject}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              whileHover={{ y: -4 }}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-lg"
            >
              <div
                className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-ndl-navy/5 transition group-hover:scale-150"
                aria-hidden
              />
              <span
                className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-ndl-navy text-xl text-white"
                aria-hidden
              >
                {tutor.icon}
              </span>
              <h3 className="relative mt-4 text-lg font-semibold text-ndl-navy">
                {tutor.subject}
              </h3>
              <p className="relative mt-2 text-sm leading-relaxed text-slate-600">
                {tutor.description}
              </p>
              <p className="relative mt-3 text-xs font-medium text-slate-400">
                {tutor.sessions}
              </p>
              <button
                type="button"
                className="relative mt-5 w-full rounded-lg bg-ndl-navy py-2.5 text-sm font-semibold text-white transition hover:bg-ndl-navy-light"
              >
                Start session
              </button>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

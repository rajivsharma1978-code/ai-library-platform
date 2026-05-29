"use client";

import { motion } from "framer-motion";
import { STATS } from "./data";

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

export function StatsDashboard() {
  return (
    <section
      id="stats"
      className="relative -mt-8 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
      aria-labelledby="stats-heading"
    >
      <h2 id="stats-heading" className="sr-only">
        Library statistics
      </h2>
      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
      >
        {STATS.map((stat, i) => (
          <motion.article
            key={stat.label}
            variants={item}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className="group rounded-xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5"
          >
            <span className="text-2xl" aria-hidden>
              {stat.icon}
            </span>
            <p className="mt-3 text-3xl font-bold tracking-tight text-ndl-navy">
              {stat.value}
            </p>
            <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-ndl-navy to-ndl-gold"
                initial={{ width: 0 }}
                whileInView={{ width: `${65 + i * 8}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
              />
            </div>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}

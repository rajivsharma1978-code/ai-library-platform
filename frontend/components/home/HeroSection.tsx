"use client";

import { motion } from "framer-motion";
import { AiSearchBar } from "./AiSearchBar";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease: "easeOut" as const },
  }),
};

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-ndl-navy via-[#0f2d52] to-[#14325c] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 25%, white 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-ndl-gold/10 blur-3xl"
        animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.7, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-blue-400/10 blur-3xl"
        animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <motion.p
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-ndl-gold"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-ndl-gold" aria-hidden />
          Digital Public Infrastructure
        </motion.p>
        <motion.h1
          custom={0.1}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
        >
          AI-Powered National Digital Library
        </motion.h1>
        <motion.p
          custom={0.2}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-6 max-w-2xl text-lg text-slate-200 sm:text-xl"
        >
          Learn, Discover and Research with AI
        </motion.p>

        <motion.div
          custom={0.3}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-10 flex flex-wrap gap-3"
        >
          <a
            href="#catalog"
            className="inline-flex items-center rounded-xl bg-ndl-gold px-6 py-3 text-sm font-semibold text-ndl-navy transition hover:bg-ndl-gold-light active:scale-[0.98]"
          >
            Explore catalog
          </a>
          <a
            href="#tutors"
            className="inline-flex items-center rounded-xl border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Start AI tutor
          </a>
        </motion.div>

        <motion.div
          custom={0.4}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-12"
        >
          <AiSearchBar />
        </motion.div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// Exactly four large, clear feature cards — no dense icon grid, no
// secondary "companion" banner repeating a subset of the same features.
// One card, one capability, generous breathing room.
export function AiTutors() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const FEATURES = [
    { emoji: "🤖", title: t.navAiTutor, desc: t.aiF1Desc, href: "/reader", icon: "bg-blue-50" },
    { emoji: "📝", title: t.settingsSmartNotes, desc: t.aiF2Desc, href: "/notes", icon: "bg-green-50" },
    { emoji: "❓", title: t.aiF3Title, desc: t.aiF3Desc, href: "/quiz", icon: "bg-purple-50" },
    { emoji: "🎙️", title: t.aiFeatureVoiceTitle, desc: t.aiF4Desc, href: "/reader", icon: "bg-orange-50" },
  ];

  return (
    <section id="tutors" className="bg-white px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="text-center">
          <h2 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">{t.aiKicker}</h2>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] text-gray-500 sm:text-[15px]">{t.aiFeaturesSub}</p>
        </motion.div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-14 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.07 }}>
              <Link href={f.href}
                className="group flex h-full flex-col rounded-3xl p-6 transition-all active:scale-[0.98] hover:bg-orange-50/60 sm:p-7">
                <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl ${f.icon} text-3xl`}>{f.emoji}</div>
                <p className="mt-5 text-[16px] font-bold text-gray-900">{f.title}</p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-gray-500">{f.desc}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

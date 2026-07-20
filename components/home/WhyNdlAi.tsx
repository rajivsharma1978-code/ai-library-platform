"use client";

import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// Calm, full-width closing statement — three value propositions, no
// bordered dashboard panels, no icon grid. Sits directly before the
// footer as the page's final, confident note.
export function WhyNdlAi() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const VALUES = [
    { emoji: "🌐", title: t.statSubLanguages, desc: t.whyNdl1Desc },
    { emoji: "📖", title: t.whyNdl2Title, desc: t.whyNdl2Desc },
    { emoji: "🎯", title: t.whyNdl3Title, desc: t.whyNdl3Desc },
  ];

  return (
    <section className="bg-[#fff8ed] px-4 py-16 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="text-center">
          <h2 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">{t.whyNdlHeading}</h2>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] text-gray-500 sm:text-[15px]">{t.whyNdlSub}</p>
        </motion.div>

        <div className="mt-10 grid grid-cols-1 gap-10 sm:mt-14 sm:grid-cols-3 sm:gap-8">
          {VALUES.map((v, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm">
                {v.emoji}
              </div>
              <p className="mt-5 text-[17px] font-bold text-gray-900">{v.title}</p>
              <p className="mx-auto mt-2 max-w-xs text-[13.5px] leading-relaxed text-gray-600">{v.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export function StatsDashboard() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const stats = [
    { val: t.stat1Val, label: t.stat1Label },
    { val: t.stat2Val, label: t.stat2Label },
    { val: t.stat3Val, label: t.stat3Label },
    { val: t.stat4Val, label: t.stat4Label },
  ];

  return (
    <section className="border-b border-orange-100 bg-[#FFFAF5]">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 divide-x divide-y divide-orange-100 lg:grid-cols-4 lg:divide-y-0">
          {stats.map((stat, i) => (
            <motion.div key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="px-8 py-7">
              <p className="text-4xl font-light text-[#C85A00]"
                style={{ fontFamily: "var(--font-cormorant), serif" }}>{stat.val}</p>
              <p className="mt-1.5 text-[10px] uppercase tracking-[2px] text-stone-400">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

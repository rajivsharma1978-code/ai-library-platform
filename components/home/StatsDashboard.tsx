"use client";

import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export function StatsDashboard() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const STATS = [
    { emoji:"📚", val: t.stat1Val, label: t.stat1Label, sub: t.statSubBooks,      color:"bg-orange-50" },
    { emoji:"👥", val: t.stat2Val, label: t.stat2Label, sub: t.statSubUsers,      color:"bg-teal-50"   },
    { emoji:"🤖", val: t.stat3Val, label: t.stat3Label, sub: t.statSubSessions,   color:"bg-purple-50" },
    { emoji:"🌐", val: t.stat4Val, label: t.stat4Label, sub: t.statSubLanguages,  color:"bg-blue-50"   },
    { emoji:"⭐", val:"96%",        label: t.statSatisfactionLabel, sub: t.statSatisfactionSub, color:"bg-yellow-50" },
    { emoji:"🕐", val:"24×7",       label: t.navAiTutor,            sub: t.statAiTutorSub,       color:"bg-red-50"    },
  ];

  return (
    <section className="bg-white border-y border-gray-100 py-6 sm:py-8">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {STATS.map((s,i)=>(
            <motion.div key={s.label}
              initial={{opacity:0,y:14}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
              transition={{duration:0.35,delay:i*0.06}}
              className="flex flex-col items-center text-center p-3 rounded-2xl hover:bg-gray-50 transition-colors cursor-default sm:p-4">
              <div className={`w-11 h-11 rounded-2xl ${s.color} flex items-center justify-center text-xl mb-2.5 sm:w-12 sm:h-12 sm:text-2xl sm:mb-3`}>{s.emoji}</div>
              <div className="text-[19px] font-extrabold text-gray-900 leading-none sm:text-[22px]">{s.val}</div>
              <div className="mt-1 text-[12.5px] font-semibold text-gray-800 sm:text-[13px]">{s.label}</div>
              <div className="mt-0.5 text-[11px] text-gray-400">{s.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

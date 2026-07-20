"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export function AiTutors() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  // Companion banner now highlights only the two capabilities that AREN'T
  // already covered by the FEATURES grid below (Explain Like I'm 10 / Voice
  // Mode), instead of repeating 4 of the same 6 items twice on one screen.
  const COMPANION_ACTIONS = [
    ["💡", t.aiActionExplainLikeTen, "/reader"],
    ["🎙️", t.aiActionVoiceMode, "/reader"],
  ];

  // Exactly the 4 real, distinct AI capabilities this platform has copy
  // for — previously this array had 6 entries, but the 5th and 6th silently
  // reused an earlier title+desc pair (a content bug, not a design choice),
  // so the grid quietly showed two pairs of near-duplicate tiles.
  const FEATURES = [
    { emoji:"🤖", title: t.aiF1Title, desc: t.aiF1Desc, href:"/reader",   border:"border-blue-100",   icon:"bg-blue-50"   },
    { emoji:"📝", title: t.aiF2Title, desc: t.aiF2Desc, href:"/notes",    border:"border-green-100",  icon:"bg-green-50"  },
    { emoji:"❓", title: t.aiF3Title, desc: t.aiF3Desc, href:"/quiz",     border:"border-purple-100", icon:"bg-purple-50" },
    { emoji:"🌐", title: t.aiF4Title, desc: t.aiF4Desc, href:"/reader",   border:"border-orange-100", icon:"bg-orange-50" },
  ];

  return (
    <section id="tutors" className="bg-white border-b border-gray-100 py-9 sm:py-12">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">

        <motion.h2 initial={{opacity:0,y:10}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
          className="text-center text-[18px] font-extrabold text-gray-900 mb-6 sm:text-[20px] sm:mb-8">
          {t.aiKicker}
        </motion.h2>

        <div className="grid grid-cols-2 gap-3 mb-6 sm:gap-4 sm:mb-8 lg:grid-cols-4">
          {FEATURES.map((f,i)=>(
            <motion.div key={i}
              initial={{opacity:0,y:18}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
              transition={{duration:0.35,delay:i*0.06}}>
              <Link href={f.href}
                className={`group flex h-full flex-col rounded-2xl border ${f.border} bg-white p-4 shadow-sm transition-all active:scale-[0.98] hover:shadow-md hover:-translate-y-1 hover:border-orange-200`}>
                <div className={`w-11 h-11 rounded-xl ${f.icon} flex items-center justify-center text-xl mb-3 flex-shrink-0`}>{f.emoji}</div>
                <p className="text-[13.5px] font-bold text-gray-900 leading-tight">{f.title}</p>
                <p className="mt-1.5 text-[11.5px] text-gray-500 leading-relaxed flex-1">{f.desc}</p>
                {/* Always visible, not hover-only — a hover-gated affordance
                    never appears for touch users, who are most of this
                    platform's traffic. */}
                <div className="mt-2 flex items-center text-[11px] font-semibold text-orange-500 transition-opacity">
                  {t.aiStartSession.replace(" →","")} <span className="ml-0.5">›</span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* AI Companion banner */}
        <motion.div initial={{opacity:0,y:16}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:0.2}}
          className="flex flex-col sm:flex-row items-center gap-6 rounded-2xl border border-orange-100 bg-[#FFF8F2] px-8 py-6">
          <div className="flex-shrink-0 w-[90px] h-[90px] rounded-3xl bg-orange-100 flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center">
              <span className="text-4xl">🤖</span>
            </div>
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-[18px] font-extrabold text-gray-900">{t.aiCompanionTitle}</h3>
            <p className="mt-1.5 text-[13.5px] text-gray-500 leading-relaxed">{t.aiCompanionDesc}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 flex-shrink-0">
            {COMPANION_ACTIONS.map(([emoji, label, href]) => (
              <Link key={String(label)} href={href}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 text-[12.5px] font-semibold text-gray-700 shadow-sm transition active:scale-95 hover:border-orange-300 hover:text-orange-500 hover:bg-orange-50">
                <span>{emoji}</span><span>{label}</span>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
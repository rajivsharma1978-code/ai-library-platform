"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export function AiTutors() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const COMPANION_ACTIONS = [
    ["📖", t.aiF1Title,  "/reader"],
    ["📝", t.aiF2Title,  "/notes"],
    ["❓", t.aiF3Title,  "/quiz"],
    ["🌐", t.aiF4Title,  "/reader"],
    ["💡", "Explain Like I'm 10", "/reader"],
    ["🎙️", "Voice Mode", "/reader"],
  ];

  const FEATURES = [
    { emoji:"🤖", title: t.aiF1Title, desc: t.aiF1Desc, href:"/reader",   border:"border-blue-100",   icon:"bg-blue-50"   },
    { emoji:"📝", title: t.aiF2Title, desc: t.aiF2Desc, href:"/notes",    border:"border-green-100",  icon:"bg-green-50"  },
    { emoji:"❓", title: t.aiF3Title, desc: t.aiF3Desc, href:"/quiz",     border:"border-purple-100", icon:"bg-purple-50" },
    { emoji:"🌐", title: t.aiF4Title, desc: t.aiF4Desc, href:"/reader",   border:"border-orange-100", icon:"bg-orange-50" },
    { emoji:"🎙️", title: t.aiF4Title, desc: t.aiF1Desc, href:"/reader",   border:"border-pink-100",   icon:"bg-pink-50"   },
    { emoji:"📖", title: t.aiF3Title, desc: t.aiF2Desc, href:"/revision", border:"border-amber-100",  icon:"bg-amber-50"  },
  ];

  return (
    <section id="tutors" className="bg-white border-b border-gray-100 py-12">
      <div className="mx-auto max-w-[1200px] px-6">

        <motion.h2 initial={{opacity:0,y:10}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
          className="text-center text-[20px] font-extrabold text-gray-900 mb-8">
          {t.aiKicker}
        </motion.h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {FEATURES.map((f,i)=>(
            <motion.div key={i}
              initial={{opacity:0,y:18}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
              transition={{duration:0.35,delay:i*0.06}}>
              <Link href={f.href}
                className={`group flex flex-col h-full rounded-2xl border ${f.border} bg-white p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 hover:border-orange-200`}>
                <div className={`w-11 h-11 rounded-xl ${f.icon} flex items-center justify-center text-xl mb-3 flex-shrink-0`}>{f.emoji}</div>
                <p className="text-[13.5px] font-bold text-gray-900 leading-tight">{f.title}</p>
                <p className="mt-1.5 text-[11.5px] text-gray-500 leading-relaxed flex-1">{f.desc}</p>
                <div className="mt-2 flex items-center text-[11px] font-semibold text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 flex-shrink-0">
            {COMPANION_ACTIONS.map(([emoji, label, href]) => (
              <Link key={String(label)} href={href}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-semibold text-gray-700 shadow-sm transition hover:border-orange-300 hover:text-orange-500 hover:bg-orange-50">
                <span>{emoji}</span><span>{label}</span>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
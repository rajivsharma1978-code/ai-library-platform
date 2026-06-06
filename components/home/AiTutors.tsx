"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export function AiTutors() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const features = [
    { num: "01", title: t.aiF1Title, desc: t.aiF1Desc },
    { num: "02", title: t.aiF2Title, desc: t.aiF2Desc },
    { num: "03", title: t.aiF3Title, desc: t.aiF3Desc },
    { num: "04", title: t.aiF4Title, desc: t.aiF4Desc },
  ];

  const languages = ["English", "हिंदी", "தமிழ்", "বাংলা", "తెలుగు", "मराठी", "ਪੰਜਾਬੀ", "ಕನ್ನಡ", "ગુજરાતી", "اردو"];
  const activeLanguages = 6;

  return (
    <section id="tutors" className="border-b border-orange-100 bg-[#FFF5E8] py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2">
          {/* Left */}
          <div>
            <p className="mb-3 text-[9px] uppercase tracking-[2.5px] text-[#C85A00]">{t.aiKicker}</p>
            <h2 className="text-4xl font-light leading-tight text-stone-900"
              style={{ fontFamily: "var(--font-cormorant), serif" }}>
              {t.aiTitle1}<br />
              <em className="italic text-[#C85A00]">{t.aiTitle2}</em>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-stone-500">{t.aiDesc}</p>

            <div className="mt-10 divide-y divide-orange-100">
              {features.map(f => (
                <div key={f.num} className="flex gap-5 py-5">
                  <span className="w-7 flex-shrink-0 text-xl font-light text-orange-200"
                    style={{ fontFamily: "var(--font-cormorant), serif" }}>{f.num}</span>
                  <div>
                    <p className="text-sm font-medium text-stone-700">{f.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-stone-400">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link href="/reader"
              className="mt-8 inline-block rounded-sm bg-[#C85A00] px-8 py-3 text-[10px] uppercase tracking-widest text-white transition hover:bg-[#a84800]">
              {t.aiStartSession}
            </Link>
          </div>

          {/* Right — chat demo */}
          <div>
            <div className="rounded-sm border border-orange-200 overflow-hidden shadow-sm">
              <div className="border-b border-orange-100 bg-white px-5 py-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#C85A00]" />
                <p className="text-[10px] uppercase tracking-wider text-stone-400">
                  {t.aiDemoLabel} —{" "}
                  <Link href="/book/Machine%20Learning"
                    className="text-[#C85A00] italic hover:text-[#a84800] transition"
                    style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "13px" }}>
                    Machine Learning · Chapter 3
                  </Link>
                </p>
              </div>
              <div className="bg-[#FFFAF5] p-5 space-y-3">
                {[
                  { role: "user", text: "मुझे supervised learning समझाओ — हिंदी में" },
                  { role: "ai", text: "Supervised Learning में model को labeled data से train किया जाता है — जैसे उदाहरणों से सीखते हैं। Input-Output pairs दिए जाते हैं और model सीखता है।" },
                  { role: "user", text: "Create a 5-question quiz on this chapter" },
                  { role: "ai", text: "Quiz ready — Chapter 3. Q1: What distinguishes supervised from unsupervised learning?" },
                ].map((msg, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    className={`max-w-[92%] rounded-sm px-4 py-3 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "ml-auto bg-orange-100 text-orange-800"
                        : "bg-white text-stone-500 border border-orange-100"}`}>
                    {msg.text}
                    {i === 3 && <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-[#C85A00] align-middle" />}
                  </motion.div>
                ))}
              </div>
              <div className="border-t border-orange-100 bg-white px-5 py-3 flex justify-between items-center">
                <p className="text-[9px] uppercase tracking-wider text-stone-400">Powered by AI</p>
                <Link href="/book/Machine%20Learning"
                  className="text-[9px] uppercase tracking-wider text-[#C85A00] hover:text-[#a84800] transition">
                  Open Book →
                </Link>
              </div>
            </div>

            {/* Language pills */}
            <div className="mt-6">
              <p className="mb-3 text-[9px] uppercase tracking-[2px] text-stone-400">{t.availableIn}</p>
              <div className="flex flex-wrap gap-2">
                {languages.map((lang, i) => (
                  <span key={lang}
                    className={`rounded-sm border px-3 py-1 text-[11px] ${
                      i < activeLanguages
                        ? "border-orange-300 bg-orange-50 text-[#C85A00]"
                        : "border-stone-200 text-stone-400"}`}>
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

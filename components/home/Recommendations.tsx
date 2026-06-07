"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ALL_BOOKS } from "./data";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const COVER_URLS: Record<string,string> = {
  "Artificial Intelligence":"https://covers.openlibrary.org/b/id/10523338-M.jpg",
  "Machine Learning":"https://covers.openlibrary.org/b/id/8231856-M.jpg",
  "Deep Learning":"https://covers.openlibrary.org/b/id/10720543-M.jpg",
  "Python Basics":"https://covers.openlibrary.org/b/id/9108915-M.jpg",
  "Cyber Security":"https://covers.openlibrary.org/b/id/8775165-M.jpg",
};

const TESTIMONIALS = [
  { initials:"AS", color:"bg-orange-500",
    quote:"NDL AI has completely changed the way I study. The AI tutor is amazing!",
    name:"Ananya Singh", role:"UPSC Aspirant" },
  { initials:"RV", color:"bg-blue-500",
    quote:"I can now learn in my mother tongue and understand concepts better.",
    name:"Rohit Verma", role:"College Student" },
  { initials:"NP", color:"bg-green-500",
    quote:"The best digital learning platform I have ever used.",
    name:"Neha Patel", role:"School Teacher" },
];

const READING_PROGRESS = [
  { title:"Artificial Intelligence", progress:72, lastRead:"Yesterday" },
  { title:"Machine Learning",        progress:45, lastRead:"2 days ago" },
  { title:"Python Basics",           progress:88, lastRead:"Last week" },
];

export function Recommendations() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  return (
    <section id="recommendations" className="bg-white border-b border-gray-100">

      {/* Testimonials */}
      <div className="py-12 border-b border-gray-100">
        <div className="mx-auto max-w-[1200px] px-6">
          <h2 className="text-[20px] font-extrabold text-gray-900 mb-8">What Learners Say</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t,i)=>(
              <motion.div key={t.name}
                initial={{opacity:0,y:16}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
                transition={{duration:0.4,delay:i*0.08}}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <p className="text-[14px] text-gray-700 leading-relaxed italic mb-5">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${t.color} flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0`}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-gray-900">{t.name}</p>
                    <p className="text-[11px] text-gray-400">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          {/* Pagination dots */}
          <div className="flex justify-center gap-1.5 mt-7">
            <div className="w-5 h-2 rounded-full bg-orange-500"/>
            <div className="w-2 h-2 rounded-full bg-gray-200"/>
            <div className="w-2 h-2 rounded-full bg-gray-200"/>
          </div>
        </div>
      </div>

      {/* Continue Reading */}
      <div className="py-12">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[20px] font-extrabold text-gray-900">Continue Reading</h2>
            <Link href="/my-library" className="text-[13px] font-semibold text-orange-500 hover:text-orange-600">View all →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {READING_PROGRESS.map((item,i)=>{
              const book = ALL_BOOKS.find(b=>b.title===item.title);
              return (
                <motion.div key={item.title}
                  initial={{opacity:0,y:10}} whileInView={{opacity:1,y:0}} viewport={{once:true}}
                  transition={{delay:i*0.07}}>
                  <Link href={`/book/${encodeURIComponent(item.title)}`}
                    className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-orange-200 transition-all">
                    <div className="flex-shrink-0 w-12 h-16 rounded-xl overflow-hidden shadow bg-gray-100">
                      <img src={COVER_URLS[item.title]} alt={item.title}
                        className="w-full h-full object-cover"
                        onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-gray-900 truncate group-hover:text-orange-500 transition-colors">{item.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{book?.author}</p>
                      <div className="mt-2">
                        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                          <span>{item.lastRead}</span><span>{item.progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full" style={{width:`${item.progress}%`}}/>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

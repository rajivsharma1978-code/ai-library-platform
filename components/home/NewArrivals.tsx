"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion } from "framer-motion";
import { ALL_BOOKS } from "./data";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const COVER_URLS: Record<string,string> = {
  "Artificial Intelligence":"https://covers.openlibrary.org/b/id/10523338-M.jpg",
  "Machine Learning":"https://covers.openlibrary.org/b/id/8231856-M.jpg",
  "Data Science":"https://covers.openlibrary.org/b/id/240726-M.jpg",
  "Deep Learning":"https://covers.openlibrary.org/b/id/10720543-M.jpg",
  "Quantum Computing":"https://covers.openlibrary.org/b/id/8235116-M.jpg",
  "Cyber Security":"https://covers.openlibrary.org/b/id/8775165-M.jpg",
  "Python Basics":"https://covers.openlibrary.org/b/id/9108915-M.jpg",
  "Robotics":"https://covers.openlibrary.org/b/id/5546156-M.jpg",
  "Cloud Architecture":"https://covers.openlibrary.org/b/id/8091016-M.jpg",
};

const CAT_COLORS: Record<string,string> = {
  Technology:"bg-blue-100 text-blue-700",
  Research:"bg-purple-100 text-purple-700",
  Governance:"bg-green-100 text-green-700",
};

export function NewArrivals() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir:"left"|"right") => scrollRef.current?.scrollBy({left:dir==="right"?300:-300,behavior:"smooth"});

  return (
    <section id="new-arrivals" className="bg-white border-b border-gray-100 py-10">
      <div className="mx-auto max-w-[1200px] px-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[20px] font-extrabold text-gray-900">Recommended for You</h2>
            <p className="mt-0.5 text-[13px] text-gray-400">Based on your interests and learning journey</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/library" className="text-[13px] font-semibold text-orange-500 hover:text-orange-600 mr-2">View all</Link>
            <button onClick={()=>scroll("left")}
              className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:text-orange-500 transition-all shadow-sm text-[16px]">‹</button>
            <button onClick={()=>scroll("right")}
              className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:text-orange-500 transition-all shadow-sm text-[16px]">›</button>
          </div>
        </div>

        {/* Horizontal scroll */}
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2"
          style={{scrollbarWidth:"none",msOverflowStyle:"none"}}>
          {ALL_BOOKS.map((book,i)=>(
            <motion.div key={book.title}
              initial={{opacity:0,x:10}} whileInView={{opacity:1,x:0}} viewport={{once:true}}
              transition={{duration:0.3,delay:i*0.05}}
              className="flex-shrink-0 w-[200px]">
              <Link href={`/book/${encodeURIComponent(book.title)}`}
                className="group flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-orange-200 hover:-translate-y-0.5">
                {/* Cover */}
                <div className="w-[48px] h-[64px] flex-shrink-0 rounded-xl overflow-hidden shadow bg-gray-100">
                  <img src={COVER_URLS[book.title]??"https://covers.openlibrary.org/b/id/8235116-M.jpg"}
                    alt={book.title} className="w-full h-full object-cover"
                    onError={e=>{ const el=e.target as HTMLImageElement; el.style.display="none"; el.parentElement!.style.background=book.coverBg; }}/>
                </div>
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-900 line-clamp-2 leading-tight group-hover:text-orange-500 transition-colors">{book.title}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400 truncate">{book.author}</p>
                  <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${CAT_COLORS[book.category]??"bg-gray-100 text-gray-600"}`}>
                    {book.category}
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

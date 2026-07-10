"use client";

import Link from "next/link";
import { usePublicCatalog } from "@/lib/catalog";
import RealBookCover from "./RealBookCover";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export default function DirectorCollection() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const isEn = t.navLibrary === "Library";
  const books = usePublicCatalog();

  return (
    <section className="bg-[#fff8ed] px-6 py-16">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-amber-200 bg-gradient-to-br from-white via-amber-50 to-orange-100 p-8 shadow-xl">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-700">
              {isEn ? "Director Demo Collection" : "डायरेक्टर डेमो संग्रह"}
            </p>

            <h2 className="mt-3 text-4xl font-black text-slate-950">
              {isEn ? "Featured Books for NDL AI Experience" : "एनडीएल एआई अनुभव के लिए विशेष पुस्तकें"}
            </h2>

            <p className="mt-3 max-w-3xl text-slate-600">
              {isEn
                ? "Demonstrating how real National Digital Library content can become an AI-powered reading, learning, translation, revision, and assessment experience."
                : "यह दिखाते हुए कि राष्ट्रीय डिजिटल पुस्तकालय की वास्तविक सामग्री कैसे एक एआई-संचालित पठन, शिक्षण, अनुवाद, पुनरीक्षण और मूल्यांकन अनुभव बन सकती है।"}
            </p>
          </div>

          <Link
            href="/reader-premium"
            className="hidden rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-lg hover:bg-slate-800 md:inline-block"
          >
            {isEn ? "Open Premium Reader →" : "प्रीमियम रीडर खोलें →"}
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/reader-premium?book=${book.id}`}
              className="group grid gap-6 rounded-[2rem] border border-amber-200 bg-white p-6 shadow-lg transition hover:-translate-y-1 hover:shadow-2xl md:grid-cols-[180px_1fr]"
            >
              <div className="relative mx-auto h-64 w-44 overflow-hidden rounded-r-3xl rounded-l-lg shadow-2xl">
                <RealBookCover book={book} className="h-full w-full" />
              </div>

              <div className="flex flex-col justify-center">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
                  {book.language}
                </p>

                <h3 className="mt-2 text-2xl font-black text-slate-950">
                  {book.title}
                </h3>

                <p className="mt-2 text-sm font-semibold text-slate-500">
                  {book.author}
                </p>

                <p className="mt-4 text-sm leading-7 text-slate-600">
                  {book.description}
                </p>

                <div className="mt-6 inline-flex w-fit rounded-full bg-amber-500 px-5 py-3 text-sm font-black text-white shadow">
                  {isEn ? "Click to open AI book experience →" : "एआई बुक अनुभव खोलने के लिए क्लिक करें →"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

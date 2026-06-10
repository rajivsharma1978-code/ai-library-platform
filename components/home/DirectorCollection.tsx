"use client";

import Link from "next/link";
import { directorBooks } from "@/lib/directorBooks";

export default function DirectorCollection() {
  return (
    <section className="bg-[#fff8ed] px-6 py-16">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-amber-200 bg-gradient-to-br from-white via-amber-50 to-orange-100 p-8 shadow-xl">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-700">
              Director Demo Collection
            </p>

            <h2 className="mt-3 text-4xl font-black text-slate-950">
              Featured Books for NDL AI Experience
            </h2>

            <p className="mt-3 max-w-3xl text-slate-600">
              Demonstrating how real National Digital Library content can become
              an AI-powered reading, learning, translation, revision, and
              assessment experience.
            </p>
          </div>

          <Link
            href="/reader-premium"
            className="hidden rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-lg hover:bg-slate-800 md:inline-block"
          >
            Open Premium Reader →
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {directorBooks.map((book) => (
            <Link
              key={book.id}
              href={`/reader-premium?book=${encodeURIComponent(book.id)}`}
              className="group grid gap-6 rounded-[2rem] border border-amber-200 bg-white p-6 shadow-lg transition hover:-translate-y-1 hover:shadow-2xl md:grid-cols-[180px_1fr]"
            >
              <div className="relative mx-auto h-64 w-44 rounded-r-3xl rounded-l-lg bg-gradient-to-br from-slate-900 via-blue-900 to-slate-950 p-5 text-white shadow-2xl">
                <div className="absolute inset-y-0 left-4 w-1 rounded-full bg-white/15" />

                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">
                      NDL AI
                    </p>

                    <h3 className="mt-8 text-xl font-black leading-tight">
                      {book.title}
                    </h3>
                  </div>

                  <p className="text-xs text-blue-100">{book.author}</p>
                </div>
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
                  Click to open AI book experience →
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const mockBooks = [
  { id: 1, title: "Artificial Intelligence: A Modern Approach", author: "Stuart Russell", language: "English", status: "Published", format: "PDF", pages: 1132, uploaded: "2024-01-15" },
  { id: 2, title: "Machine Learning with Python", author: "Sebastian Raschka", language: "English", status: "Published", format: "EPUB", pages: 774, uploaded: "2024-02-03" },
  { id: 3, title: "भारतीय इतिहास", author: "रामचंद्र गुहा", language: "Hindi", status: "Pending", format: "PDF", pages: 890, uploaded: "2024-03-12" },
  { id: 4, title: "Cyber Security Essentials", author: "James Graham", language: "English", status: "Under Review", format: "PDF", pages: 450, uploaded: "2024-03-20" },
  { id: 5, title: "தமிழ் இலக்கியம்", author: "கு. அழகிரிசாமி", language: "Tamil", status: "Published", format: "PDF", pages: 620, uploaded: "2024-04-05" },
  { id: 6, title: "Deep Learning Fundamentals", author: "Ian Goodfellow", language: "English", status: "Published", format: "PDF", pages: 800, uploaded: "2024-04-18" },
  { id: 7, title: "বাংলা সাহিত্য সংকলন", author: "রবীন্দ্রনাথ ঠাকুর", language: "Bengali", status: "Pending", format: "EPUB", pages: 340, uploaded: "2024-05-01" },
  { id: 8, title: "Data Structures and Algorithms", author: "Thomas H. Cormen", language: "English", status: "Published", format: "PDF", pages: 1292, uploaded: "2024-05-10" },
];

const statusColors: Record<string, string> = {
  Published: "bg-green-100 text-green-700",
  Pending: "bg-yellow-100 text-yellow-700",
  "Under Review": "bg-blue-100 text-blue-700",
};

export default function BookManagementPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterLanguage, setFilterLanguage] = useState("All");
  const [books, setBooks] = useState(mockBooks);

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") {
      router.push("/admin-login");
    }
  }, [router]);

  const filtered = books.filter((b) => {
    const matchSearch = b.title.toLowerCase().includes(search.toLowerCase()) || b.author.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "All" || b.status === filterStatus;
    const matchLang = filterLanguage === "All" || b.language === filterLanguage;
    return matchSearch && matchStatus && matchLang;
  });

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />

      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · {t.featuredBooks}</p>
          <h2 className="text-4xl font-bold mt-2">{t.featuredBooks}</h2>
          <p className="mt-3 text-blue-100">{t.footerLibraryCatalog}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          {[
            ["12,540", t.stat1Label,   "text-blue-600"],
            [books.filter(b => b.status === "Published").length.toString(),  t.badgeNew === "New" ? "Published"     : "प्रकाशित",    "text-green-600"],
            [books.filter(b => b.status === "Pending").length.toString(),    t.badgeNew === "New" ? "Pending Review": "समीक्षा बाकी", "text-yellow-600"],
            [books.filter(b => b.status === "Under Review").length.toString(),t.badgeNew === "New" ? "Under Review" : "समीक्षाधीन",  "text-blue-500"],
          ].map(([val, label, color]) => (
            <div key={label} className="bg-white rounded-2xl p-5 shadow">
              <p className={`text-3xl font-bold ${color}`}>{val}</p>
              <p className="text-slate-500 text-sm mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-5 shadow mt-6 flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder={t.heroSearchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm focus:border-blue-400"
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm">
            {["All", "Published", "Pending", "Under Review"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={filterLanguage} onChange={(e) => setFilterLanguage(e.target.value)}
            className="border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm">
            {["All", "English", "Hindi", "Tamil", "Bengali", "Telugu", "Marathi"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <button className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition">
            + {t.uploadPdf}
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-3xl shadow mt-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[
                  t.catalogTitle,
                  t.badgeNew === "New" ? "Author"   : "लेखक",
                  t.navLanguages,
                  t.badgeNew === "New" ? "Format"   : "प्रारूप",
                  t.pages,
                  t.badgeNew === "New" ? "Status"   : "स्थिति",
                  t.badgeNew === "New" ? "Uploaded" : "अपलोड किया",
                  t.badgeNew === "New" ? "Actions"  : "क्रियाएं",
                ].map((h) => (
                  <th key={h} className="text-left px-6 py-4 font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((book) => (
                <tr key={book.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-medium text-slate-800 max-w-[220px]">
                    <p className="truncate">{book.title}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{book.author}</td>
                  <td className="px-6 py-4 text-slate-600">{book.language}</td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-lg text-xs font-medium">{book.format}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{book.pages.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[book.status]}`}>
                      {book.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{book.uploaded}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button className="text-blue-600 hover:underline text-xs">
                        {t.readBtn}
                      </button>
                      <button className="text-red-500 hover:underline text-xs">
                        {t.badgeNew === "New" ? "Delete" : "हटाएं"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-slate-400 py-12">{t.searchNoResults}</p>
          )}
        </div>
      </section>
    </main>
  );
}
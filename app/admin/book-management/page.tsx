"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import {
  loadBookOverrides, saveBookOverrides, logActivity, buildDisplayBooks, newId,
  type AdminBookOverride, type DisplayBook, type BookStatus,
} from "@/components/admin/adminData";
import type { PageNumberingConfig } from "@/lib/pageNumbering";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import SearchBar from "@/components/ui/SearchBar";
import AppButton from "@/components/ui/AppButton";

const statusColors: Record<BookStatus, string> = {
  Published: "bg-green-100 text-green-700",
  Draft: "bg-slate-200 text-slate-600",
  Pending: "bg-yellow-100 text-yellow-700",
  "Under Review": "bg-blue-100 text-blue-700",
};

const LANGUAGE_OPTIONS = ["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu"];
const STATUS_OPTIONS: BookStatus[] = ["Published", "Draft", "Pending", "Under Review"];

type FormFields = {
  title: string; author: string; language: string; category: string;
  status: BookStatus; format: string; pages: string;
  coverFileName: string; pdfFileName: string;
  /** Simple page-numbering config (lib/pageNumbering.ts, "offset" model
   *  only — demo scope). frontMatterCount = how many PDF pages come
   *  before the printed "1"; pageLabels = optional front-matter labels,
   *  one "pdfPage: Label" per line (e.g. "1: Cover"). Both blank means
   *  "no mapping", same as a book that never set this at all. */
  frontMatterCount: string;
  pageLabels: string;
};
const EMPTY_FORM: FormFields = {
  title: "", author: "", language: "English", category: "General",
  status: "Draft", format: "PDF", pages: "", coverFileName: "", pdfFileName: "",
  frontMatterCount: "", pageLabels: "",
};

/** "1: Cover\n2: Title Page" -> {1: "Cover", 2: "Title Page"}. Blank/
 *  unparseable lines are silently skipped — this is a demo textarea, not
 *  a strict format. */
function parsePageLabels(text: string): Record<number, string> {
  const labels: Record<number, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(\d+)\s*[:.\-]\s*(.+?)\s*$/);
    if (m) labels[Number(m[1])] = m[2];
  }
  return labels;
}
function formatPageLabels(labels?: Record<number, string>): string {
  if (!labels) return "";
  return Object.entries(labels).map(([pdfPage, label]) => `${pdfPage}: ${label}`).join("\n");
}
/** Builds the config from the form's two simple fields, or undefined if
 *  the admin left both blank — omitting the key lets a catalog book's own
 *  static pageNumbering (if any) keep applying (see getPublicCatalog()'s
 *  `o.pageNumbering ?? b.pageNumbering` merge), instead of an empty
 *  override silently erasing it. */
function buildPageNumbering(form: FormFields): PageNumberingConfig | undefined {
  const frontMatterCount = parseInt(form.frontMatterCount, 10);
  const hasFrontMatter = !isNaN(frontMatterCount) && frontMatterCount > 0;
  const labels = parsePageLabels(form.pageLabels);
  const hasLabels = Object.keys(labels).length > 0;
  if (!hasFrontMatter && !hasLabels) return undefined;
  return {
    type: "offset",
    startPdfPage: hasFrontMatter ? frontMatterCount + 1 : 1,
    startBookPage: 1,
    ...(hasLabels ? { labels } : {}),
  };
}

function upsertOverride(overrides: AdminBookOverride[], id: string, patch: Partial<AdminBookOverride>, isNewCustom = false): AdminBookOverride[] {
  const now = Date.now();
  const idx = overrides.findIndex(o => o.id === id);
  if (idx === -1) {
    return [...overrides, { id, isCustom: isNewCustom, createdAt: now, updatedAt: now, ...patch }];
  }
  const next = [...overrides];
  next[idx] = { ...next[idx], ...patch, updatedAt: now };
  return next;
}

function BookManagementContent() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [books, setBooks] = useState<DisplayBook[]>([]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterLanguage, setFilterLanguage] = useState("All");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [formTargetId, setFormTargetId] = useState<string | null>(null);
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);

  function refresh() {
    const overrides = loadBookOverrides();
    setBooks(buildDisplayBooks(directorBooks as any[], overrides));
  }
 
  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") {
      router.push("/admin-login");
      return;
    }
    setCheckedAccess(true);
    refresh();
    setMounted(true);
    // Dashboard's "➕ Add Book" quick action links here with ?action=add
    if (searchParams.get("action") === "add") {
      openAddForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function openAddForm() {
    setFormMode("add");
    setFormTargetId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }
  function openEditForm(book: DisplayBook) {
    setFormMode("edit");
    setFormTargetId(book.id);
    const pn = book.pageNumbering;
    setForm({
      title: book.title, author: book.author, language: book.language, category: book.category,
      status: book.status, format: book.format, pages: String(book.pages || ""),
      coverFileName: book.coverFileName || "", pdfFileName: book.pdfFileName || "",
      frontMatterCount: pn?.startPdfPage && pn.startPdfPage > 1 ? String(pn.startPdfPage - 1) : "",
      pageLabels: formatPageLabels(pn?.labels),
    });
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setFormTargetId(null);
    setForm(EMPTY_FORM);
  }

  function submitForm() {
    if (!form.title.trim()) return;
    const overrides = loadBookOverrides();
    const patch: Partial<AdminBookOverride> = {
      title: form.title.trim(),
      author: form.author.trim(),
      language: form.language,
      category: form.category.trim() || "General",
      status: form.status,
      format: form.format.trim() || "PDF",
      pages: Number(form.pages) || 0,
      coverFileName: form.coverFileName || undefined,
      pdfFileName: form.pdfFileName || undefined,
      pageNumbering: buildPageNumbering(form),
    };

    if (formMode === "add") {
      const id = newId("custom");
      saveBookOverrides(upsertOverride(overrides, id, patch, true));
      logActivity("add", `"${patch.title}" added as a new ${form.status.toLowerCase()} book`);
    } else if (formTargetId) {
      saveBookOverrides(upsertOverride(overrides, formTargetId, patch));
      logActivity("edit", `"${patch.title}" metadata updated`);
    }

    refresh();
    closeForm();
  }

  function removeBook(book: DisplayBook) {
    if (!window.confirm(`Remove "${book.title}"? This is a demo action stored locally.`)) return;
    const overrides = loadBookOverrides();
    if (book.isCustom) {
      saveBookOverrides(overrides.filter(o => o.id !== book.id));
    } else {
      saveBookOverrides(upsertOverride(overrides, book.id, { removed: true }));
    }
    logActivity("delete", `"${book.title}" removed`);
    refresh();
  }

  const filtered = useMemo(() => books.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch = b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
    const matchStatus = filterStatus === "All" || b.status === filterStatus;
    const matchLang = filterLanguage === "All" || b.language === filterLanguage;
    return matchSearch && matchStatus && matchLang;
  }), [books, search, filterStatus, filterLanguage]);

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
        <p className="text-sm font-semibold text-slate-400">Checking admin access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex">
      <AdminSidebar />

      <section className="flex-1 p-8 overflow-auto">
        <PageHeader
          badge="Admin · Book Management"
          title="Book Management"
          subtitle="Add, edit, and manage every book in the National Digital Library catalog."
          homeLabel="Library"
        />

        <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </InfoCard>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Books" value={books.length} valueClassName="text-blue-600" />
          <StatCard label="Published" value={books.filter(b => b.status === "Published").length} valueClassName="text-green-600" />
          <StatCard label="Draft" value={books.filter(b => b.status === "Draft").length} valueClassName="text-slate-600" />
          <StatCard label="In Review" value={books.filter(b => b.status === "Pending" || b.status === "Under Review").length} valueClassName="text-yellow-600" />
        </div>

        {/* Filters */}
        <InfoCard className="mt-6 flex flex-wrap gap-4 items-center">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by title or author…" className="flex-1 min-w-[200px]" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm focus:ring-2 focus:ring-amber-400">
            {["All", ...STATUS_OPTIONS].map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={filterLanguage} onChange={(e) => setFilterLanguage(e.target.value)}
            className="border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm focus:ring-2 focus:ring-amber-400">
            {["All", ...LANGUAGE_OPTIONS].map((l) => <option key={l}>{l}</option>)}
          </select>
          <AppButton onClick={openAddForm} variant="accent">
            + Add Book
          </AppButton>
        </InfoCard>

        {/* Add/Edit form */}
        {formOpen && (
          <InfoCard className="mt-6 p-8">
            <h3 className="text-xl font-black text-slate-950">{formMode === "add" ? "Add New Book (Demo)" : "Edit Book Metadata (Demo)"}</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Title</span>
                <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Author</span>
                <input value={form.author} onChange={(e) => setForm(f => ({ ...f, author: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Language</span>
                <select value={form.language} onChange={(e) => setForm(f => ({ ...f, language: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400">
                  {LANGUAGE_OPTIONS.map(l => <option key={l}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Category</span>
                <input value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Science, History, Fiction"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Status</span>
                <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as BookStatus }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400">
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Pages</span>
                <input type="number" value={form.pages} onChange={(e) => setForm(f => ({ ...f, pages: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Front-matter pages (before printed page 1)</span>
                <input type="number" min={0} value={form.frontMatterCount}
                  onChange={(e) => setForm(f => ({ ...f, frontMatterCount: e.target.value }))}
                  placeholder="e.g. 6 — cover/title/contents/preface"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
                <p className="mt-1 text-[11px] text-slate-400">
                  Leave blank if this book has no separate printed page numbering — the PDF page number is shown as-is.
                </p>
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-500">Front-matter labels (optional, one per line: "PDF page: Label")</span>
                <textarea rows={3} value={form.pageLabels}
                  onChange={(e) => setForm(f => ({ ...f, pageLabels: e.target.value }))}
                  placeholder={"1: Cover\n2: Title Page\n3: Contents"}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent font-mono" />
              </label>

              {/* Upload cover/PDF UI mock — remembers the filename only,
                  nothing is actually uploaded anywhere. */}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Cover Image (mock upload)</span>
                <input type="file" accept="image/*"
                  onChange={(e) => setForm(f => ({ ...f, coverFileName: e.target.files?.[0]?.name || "" }))}
                  className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500" />
                {form.coverFileName && <p className="mt-1 text-xs text-slate-400">📎 {form.coverFileName}</p>}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">PDF File (mock upload)</span>
                <input type="file" accept="application/pdf"
                  onChange={(e) => setForm(f => ({ ...f, pdfFileName: e.target.files?.[0]?.name || "" }))}
                  className="w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500" />
                {form.pdfFileName && <p className="mt-1 text-xs text-slate-400">📎 {form.pdfFileName}</p>}
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <AppButton onClick={submitForm} disabled={!form.title.trim()} variant="accent">
                {formMode === "add" ? "Add Book" : "Save Changes"}
              </AppButton>
              <AppButton onClick={closeForm} variant="secondary">
                Cancel
              </AppButton>
            </div>
          </InfoCard>
        )}

        {/* Table */}
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 mt-6 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Title", "Author", "Language", "Category", "Format", "Pages", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-6 py-4 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((book) => (
                <tr key={book.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-6 py-4 font-medium text-slate-800 max-w-[220px]">
                    <p className="truncate">{book.title}{book.isCustom && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">custom</span>}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{book.author}</td>
                  <td className="px-6 py-4 text-slate-600">{book.language}</td>
                  <td className="px-6 py-4 text-slate-600">{book.category}</td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-lg text-xs font-medium">{book.format}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{book.pages ? book.pages.toLocaleString() : "—"}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[book.status]}`}>
                      {book.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      <button onClick={() => openEditForm(book)} className="text-blue-600 hover:underline text-xs font-semibold">
                        Edit
                      </button>
                      <button onClick={() => removeBook(book)} className="text-red-500 hover:underline text-xs font-semibold">
                        Delete
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
export default function BookManagementPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <BookManagementContent />
    </Suspense>
  );
}
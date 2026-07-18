"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

// `label` is resolved from UI_TEXT inside the component (see NAV_LABEL
// below) — this array only holds the language-independent icon/href.
const navItems: { icon: string; href: string }[] = [
  { icon: "📊", href: "/admin" },
  { icon: "📚", href: "/admin/book-management" },
  { icon: "⬆️", href: "/admin/upload-queue" },
  { icon: "🌐", href: "/admin/languages" },
  { icon: "👥", href: "/admin/users" },
  { icon: "🤖", href: "/admin/ai-usage" },
  { icon: "♿", href: "/admin/accessibility" },
  { icon: "🛡️", href: "/admin/moderation" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  // href-to-label lookup — every language resolves independently via
  // t.*, no English/Hindi conditional fallback. Reuses existing keys
  // where the wording already matches elsewhere in the app.
  const NAV_LABEL: Record<string, string> = {
    "/admin": t.adminNavDashboard,
    "/admin/book-management": t.adminNavBookManagement,
    "/admin/upload-queue": t.adminNavUploadQueue,
    "/admin/languages": t.adminNavLanguages,
    "/admin/users": t.adminNavUsers,
    "/admin/ai-usage": t.adminNavAiUsage,
    "/admin/accessibility": t.settingsAccessibility,
    "/admin/moderation": t.adminNavModeration,
  };

  return (
    <aside className="w-72 bg-slate-950 text-white p-6 min-h-screen flex flex-col">
      <div>
        <h1 className="text-3xl font-bold">{t.adminPanelTitle}</h1>
        <p className="text-slate-400 mt-2 text-sm">{t.adminPanelSubtitle}</p>
      </div>

      <nav className="mt-10 space-y-2 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-2xl p-4 transition-all duration-200 font-medium text-sm ${
                isActive
                  ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 font-bold"
                  : "bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white"
              }`}
            >
              {item.icon} {NAV_LABEL[item.href]}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 space-y-3 border-t border-slate-800">
        <Link href="/" className="block text-blue-400 font-semibold text-sm hover:text-blue-300 transition">
          ← {t.commonHome}
        </Link>
        <button
          onClick={() => {
            localStorage.removeItem("ndlAdminAccess");
            router.push("/admin-login");
          }}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
        >
          {t.adminLogout}
        </button>
      </div>
    </aside>
  );
}

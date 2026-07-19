"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
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

/** Admin console navigation — a persistent left sidebar at desktop widths
 * (unchanged visual design from before), and a compact trigger + on-demand
 * panel below `lg` so a full-width sidebar never eats a phone/tablet
 * viewport. Both surfaces share the same route list, active-route
 * matching, and translated labels — one source of truth, not two
 * competing nav systems. */
export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  const activeItem = navItems.find((item) => pathname === item.href);

  function logout() {
    localStorage.removeItem("ndlAdminAccess");
    router.push("/admin-login");
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <>
      {/* ── Desktop — persistent sidebar, same visual design as before ── */}
      <aside className="hidden lg:flex w-72 flex-shrink-0 min-h-screen flex-col bg-slate-950 p-6 text-white">
        <div>
          <h1 className="text-3xl font-bold">{t.adminPanelTitle}</h1>
          <p className="mt-2 text-sm text-slate-400">{t.adminPanelSubtitle}</p>
        </div>

        <nav className="mt-10 flex-1 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`block rounded-2xl p-4 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/30"
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.icon} {NAV_LABEL[item.href]}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3 border-t border-slate-800 pt-6">
          <Link href="/" className="block text-sm font-semibold text-blue-400 transition hover:text-blue-300">
            ← {t.adminViewPublicSite}
          </Link>
          <button
            onClick={logout}
            className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {t.adminLogout}
          </button>
        </div>
      </aside>

      {/* ── Tablet / mobile — compact trigger + on-demand panel ─────────
          Same route list/labels/active-state as the desktop sidebar
          above; below `lg` the full sidebar is never rendered at all
          (not just visually hidden), so it can't eat a phone-width
          viewport. */}
      <div className="w-full flex-shrink-0 bg-slate-950 px-4 py-3 text-white lg:hidden">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? t.adminMobileMenuClose : t.adminMobileMenuOpen}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-xl bg-slate-900 px-4 py-3"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
            <span aria-hidden="true">🛠️</span>
            <span className="flex-shrink-0">{t.adminConsoleLabel}</span>
            {activeItem && <span className="truncate text-amber-400">· {NAV_LABEL[activeItem.href]}</span>}
          </span>
          <span aria-hidden="true" className={`flex-shrink-0 text-xs text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>

        {open && (
          <div
            id={menuId}
            ref={panelRef}
            role="menu"
            aria-label={t.adminConsoleLabel}
            className="mt-2 rounded-2xl bg-slate-900 p-2 shadow-xl"
          >
            <div className="grid grid-cols-2 gap-1.5">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    aria-current={isActive ? "page" : undefined}
                    onNavigate={() => setOpen(false)}
                    className={`rounded-xl px-3 py-2.5 text-center text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-amber-500 font-bold text-slate-950"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    <span aria-hidden="true" className="mb-1 block text-base leading-none">{item.icon}</span>
                    <span className="leading-tight">{NAV_LABEL[item.href]}</span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-2 space-y-1.5 border-t border-slate-800 pt-2">
              <Link
                href="/"
                role="menuitem"
                onNavigate={() => setOpen(false)}
                className="block rounded-xl px-3 py-2 text-center text-xs font-semibold text-blue-400 hover:bg-slate-800"
              >
                ← {t.adminViewPublicSite}
              </Link>
              <button
                onClick={() => { setOpen(false); logout(); }}
                role="menuitem"
                className="w-full rounded-xl bg-slate-800 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-slate-700"
              >
                {t.adminLogout}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

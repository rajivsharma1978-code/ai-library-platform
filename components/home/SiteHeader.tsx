"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { UI_TEXT, LANGUAGE_NAMES, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { useEnabledLanguages } from "@/lib/languageSettings";

interface NDLUser { name: string; role: string; }

const ROLE_COLORS: Record<string, string> = {
  Student: "bg-blue-100 text-blue-700",
  Teacher: "bg-green-100 text-green-700",
  Researcher: "bg-purple-100 text-purple-700",
  "Senior Learner": "bg-amber-100 text-amber-700",
  Admin: "bg-red-100 text-red-700",
};

// `label` is resolved from UI_TEXT inside the component (see USER_NAV_LABEL
// below) — this array now only holds the language-independent icon/href.
const USER_NAV: { icon: string; href: string }[] = [
  { icon: "🧠 ", href: "/my-space" },
  { icon: "",     href: "/my-library" },
  { icon: "",     href: "/my-books" },
  { icon: "",     href: "/notes" },
  { icon: "",     href: "/revision" },
  { icon: "",     href: "/analytics" },
  { icon: "",     href: "/settings" },
];

export function SiteHeader() {
  const { language, setLanguage } = useLanguage();
  const enabledLanguages = useEnabledLanguages();
  const pathname = usePathname();
  const [user, setUser] = useState<NDLUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Mobile navigation drawer (below `md`) — replaces the hidden desktop
  // nav with a real, discoverable mobile entry point. Independent
  // accordion state for its two expandable sections (My Learning /
  // Language) so opening one doesn't require closing the other.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLearningOpen, setDrawerLearningOpen] = useState(false);
  const [drawerLanguageOpen, setDrawerLanguageOpen] = useState(false);
  const drawerMenuId = useId();
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const t = mounted ? UI_TEXT[language] : UI_TEXT.en;

  useEffect(() => {
    setMounted(true);

    const s = localStorage.getItem("ndlUser");
    if (s) {
      try {
        setUser(JSON.parse(s));
      } catch {}
    }
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        drawerTriggerRef.current?.focus();
      }
    }
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (drawerPanelRef.current?.contains(target) || drawerTriggerRef.current?.contains(target)) return;
      setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [drawerOpen]);

  const logout = () => {
    localStorage.removeItem("ndlUser");
    setUser(null);
    window.location.href = "/";
  };

  // USER_NAV's href-to-label lookup — every language resolves
  // independently via t.*, no English/Hindi conditional fallback.
  const USER_NAV_LABEL: Record<string, string> = {
    "/my-space": t.navMySpace,
    "/my-library": t.myLibraryTitle,
    "/my-books": t.myBooksTitle,
    "/notes": t.navNotes,
    "/revision": t.navRevision,
    "/analytics": t.navAnalytics,
    "/settings": t.aiTutorNavSettings,
  };

  // "My Learning" — every personal-learning page lives here now, keeping
  // the top-level bar down to exactly Home / Library / Explore / AI Tutor.
  const MY_LEARNING_NAV: [string, string][] = [
    [`🧠 ${t.navMySpace}`, "/my-space"],
    [t.myLibraryTitle, "/my-library"],
    [t.myBooksTitle, "/my-books"],
    [t.navNotes, "/notes"],
    [t.navRevision, "/revision"],
    [t.navAnalytics, "/analytics"],
  ];

  // Leftover utility tools that aren't part of the core "My Learning" set —
  // kept reachable without cluttering the top-level bar. No Admin Login
  // here: that's been removed from public navigation entirely (still
  // reachable by going directly to /admin-login).
  const MORE_NAV: [string, string][] = [
    [`📖 ${t.readerBadge}`, "/read"],
    [t.commonFlashcards, "/flashcards"],
    [t.quizPageTitle, "/quiz"],
    [t.aiTutorNavSettings, "/settings"],
  ];

  // Mobile drawer — primary destinations, exactly mirroring the desktop
  // top-level bar (Home / Library / Explore / AI Tutor).
  const DRAWER_PRIMARY_NAV: [string, string][] = [
    [t.commonHome, "/"],
    [t.navLibrary, "/library"],
    [t.navExplore, "/explore"],
    [t.navAiTutor, "/ai-tutor"],
  ];

  // Everything under "My Learning" in the drawer — the same six personal
  // destinations as the desktop dropdown, plus Flashcards/Quiz (desktop
  // keeps those under "More" instead, but a single "My Learning" section
  // is the clearer mobile grouping for all personal-study tools).
  const DRAWER_LEARNING_NAV: [string, string][] = [
    ...MY_LEARNING_NAV,
    [t.commonFlashcards, "/flashcards"],
    [t.quizPageTitle, "/quiz"],
  ];

  const isActivePath = (href: string) => href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-3 h-[60px] sm:px-6">

        {/* Logo — subtitle hidden below `sm` so the compact wordmark
            leaves room for the mobile nav trigger without crowding. */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0 sm:gap-2.5">
          <div className="w-8 h-8 rounded-full border-2 border-orange-500 flex items-center justify-center bg-orange-50 sm:w-9 sm:h-9">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" className="sm:w-[18px] sm:h-[18px]">
              <circle cx="12" cy="12" r="8" stroke="#f97316" strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="3" fill="#f97316"/>
              <line x1="12" y1="4" x2="12" y2="20" stroke="#f97316" strokeWidth="1.2" opacity="0.5"/>
              <line x1="4" y1="12" x2="20" y2="12" stroke="#f97316" strokeWidth="1.2" opacity="0.5"/>
            </svg>
          </div>
          <div>
            <div className="text-[14px] font-bold text-gray-900 leading-none sm:text-[15px]">NDL AI</div>
            <div className="hidden text-[10px] text-gray-400 leading-tight mt-0.5 sm:block">
              {t.siteName}<br/>{t.government}
            </div>
          </div>
        </Link>

        {/* Nav — tightened spacing (gap-0.5 / px-2.5) so 4 top-level items
            + 2 dropdowns breathe rather than sprawl. Every trigger shares
            the same inline-flex + items-center + hover:text-orange-500
            treatment for a consistent hover/alignment rhythm. */}
        <nav className="hidden lg:flex items-center gap-0.5">
          <Link href="/" className="inline-flex items-center px-2.5 py-1.5 text-[13.5px] font-semibold text-orange-500 border-b-2 border-orange-500">
            {t.commonHome}
          </Link>
          {([
            [t.navLibrary, "/library"],
            [t.navExplore, "/explore"],
            [t.navAiTutor, "/ai-tutor"],
          ] as [string, string][]).map(([l, h]) => (
            <Link key={h} href={h}
              className="inline-flex items-center px-2.5 py-1.5 text-[13.5px] font-medium text-gray-700 hover:text-orange-500 transition-colors">
              {l}
            </Link>
          ))}

          {/* My Learning dropdown */}
          <div className="relative">
            <button onClick={() => { setLearningOpen(!learningOpen); setMoreOpen(false); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[13.5px] font-medium text-gray-700 hover:text-orange-500 transition-colors">
              {t.navMyLearning} <span className="text-[10px] mt-0.5">▾</span>
            </button>
            {learningOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 w-48 z-50">
                {MY_LEARNING_NAV.map(([l, h]) => (
                  <Link key={h} href={h} onNavigate={() => setLearningOpen(false)}
                    className="block px-4 py-2 text-[13px] text-gray-600 hover:bg-orange-50 hover:text-orange-500 transition-colors">
                    {l}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* More dropdown — utility tools only, Admin Login removed */}
          <div className="relative">
            <button onClick={() => { setMoreOpen(!moreOpen); setLearningOpen(false); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[13.5px] font-medium text-gray-700 hover:text-orange-500 transition-colors">
              {t.moreLabel} <span className="text-[10px] mt-0.5">▾</span>
            </button>
            {moreOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 w-44 z-50">
                {MORE_NAV.map(([l, h]) => (
                  <Link key={h} href={h} onNavigate={() => setMoreOpen(false)}
                    className="block px-4 py-2 text-[13px] text-gray-600 hover:bg-orange-50 hover:text-orange-500 transition-colors">
                    {l}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Right */}
        <div className="flex items-center gap-1 sm:gap-2.5">
          {/* Mobile nav trigger — the only way to reach Home/Library/
              Explore/AI Tutor/My Learning/Language/Settings below `md`,
              since the desktop <nav> above is hidden there. */}
          <button
            ref={drawerTriggerRef}
            type="button"
            aria-expanded={drawerOpen}
            aria-controls={drawerMenuId}
            aria-label={drawerOpen ? t.mobileNavCloseMenu : t.mobileNavOpenMenu}
            onClick={() => setDrawerOpen(o => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 hover:text-orange-500 transition-colors lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>
            </svg>
          </button>

          <button aria-label={t.commonSearch} className="flex h-10 w-10 items-center justify-center text-gray-500 hover:text-orange-500 transition-colors">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>

          {/* Language selector — gated to `lg`, matching the desktop nav
              and the hamburger's own `lg:hidden` cutoff. The full desktop
              header (4 nav items + 2 dropdowns + logo + search + language +
              sign-in) doesn't actually fit at `md` (768px) once you account
              for the scrollbar gutter — tablet portrait would overflow by
              ~15-100px. Below `lg` (1024px) the mobile drawer covers nav
              and language, same as it does on phones. */}
          <div className="relative hidden lg:block">
            <select value={language} onChange={e => setLanguage(e.target.value as Language)}
              className="appearance-none pl-7 pr-6 py-1.5 text-[12.5px] font-medium text-gray-700 bg-transparent border-0 outline-none cursor-pointer">
              {(Object.entries(LANGUAGE_NAMES) as [Language, string][])
                .filter(([c]) => enabledLanguages.includes(c))
                .map(([c, n]) => (
                  <option key={c} value={c}>{n}</option>
                ))}
            </select>
            <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-base">🇮🇳</span>
            <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">▾</span>
          </div>

          {user ? (
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5 hover:bg-orange-100 transition-colors">
                <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white text-[11px] font-bold">
                  {user.name[0]}
                </div>
                <span className="text-[12.5px] font-semibold text-gray-800 hidden sm:block">{user.name}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full hidden sm:block ${ROLE_COLORS[user.role] ?? ""}`}>
                  {user.role}
                </span>
                <span className="text-[10px] text-gray-400">▾</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50">
                  <div className="bg-orange-50 px-4 py-3 border-b border-orange-100">
                    <div className="text-[13px] font-bold text-gray-900">{user.name}</div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role] ?? ""}`}>
                      {user.role}
                    </span>
                  </div>
                  <div className="py-1">
                    {USER_NAV.map(n => (
                      <Link key={n.href} href={n.href} onNavigate={() => setMenuOpen(false)}
                        className="block px-4 py-2.5 text-[13px] text-gray-600 hover:bg-orange-50 hover:text-orange-500">
                        {n.icon}{USER_NAV_LABEL[n.href]}
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 px-4 py-2">
                    {user.role === "Admin" && (
                      <Link href="/admin" onNavigate={() => setMenuOpen(false)}
                        className="block py-1.5 text-[12px] font-semibold text-orange-500">
                        {t.adminDashboard} →
                      </Link>
                    )}
                    <button onClick={logout}
                      className="w-full text-left py-1.5 text-[12px] text-red-500 hover:text-red-700">
                      {t.signOut}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link href="/sign-in"
              className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl shadow-sm transition-all hover:shadow-md">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              {t.signIn}
            </Link>
          )}
        </div>
      </div>

      {/* Logged-in workspace bar */}
      {user && (
        <div className="border-t border-orange-100 bg-orange-50/60">
          <div className="mx-auto max-w-[1200px] px-6 flex items-center gap-1 py-1.5 overflow-x-auto">
            <span className="text-[11px] font-semibold text-orange-400 uppercase tracking-wider mr-2 whitespace-nowrap">
              {t.workspaceLabel}:
            </span>
            {USER_NAV.map(n => (
              <Link key={n.href} href={n.href}
                className="whitespace-nowrap px-3 py-1 text-[12px] font-medium text-gray-600 rounded-lg hover:bg-white hover:text-orange-500 hover:shadow-sm transition-all">
                {n.icon}{USER_NAV_LABEL[n.href]}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Mobile navigation drawer — the primary nav surface below `md`.
          Always mounted (not conditionally rendered) so the slide-in/out
          transition plays in both directions instead of just popping. */}
      <div
        className={`fixed inset-0 z-[70] lg:hidden transition-opacity duration-300 motion-reduce:transition-none ${
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
        <div
          id={drawerMenuId}
          ref={drawerPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label={t.navMyLearning}
          className={`absolute inset-y-0 left-0 flex h-full w-[85%] max-w-[340px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full border-2 border-orange-500 bg-orange-50 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                  <circle cx="12" cy="12" r="8" stroke="#f97316" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="3" fill="#f97316"/>
                </svg>
              </div>
              <span className="text-[15px] font-bold text-gray-900">NDL AI</span>
            </div>
            <button
              type="button"
              aria-label={t.mobileNavCloseMenu}
              onClick={() => setDrawerOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Scrollable nav content */}
          <nav aria-label={t.navMyLearning} className="flex-1 overflow-y-auto px-3 py-3">
            <ul className="space-y-0.5">
              {DRAWER_PRIMARY_NAV.map(([label, href]) => {
                const active = isActivePath(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onNavigate={() => setDrawerOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[48px] items-center rounded-xl px-4 text-[15px] font-semibold transition-colors ${
                        active ? "bg-orange-50 text-orange-600" : "text-gray-800 hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="my-2 border-t border-gray-100" />

            {/* My Learning — accordion */}
            <button
              type="button"
              aria-expanded={drawerLearningOpen}
              onClick={() => setDrawerLearningOpen(o => !o)}
              className="flex min-h-[48px] w-full items-center justify-between rounded-xl px-4 text-[15px] font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
            >
              {t.navMyLearning}
              <span aria-hidden="true" className={`text-xs text-gray-400 transition-transform ${drawerLearningOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {drawerLearningOpen && (
              <ul className="grid grid-cols-2 gap-1.5 px-2 pb-2 pt-1">
                {DRAWER_LEARNING_NAV.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onNavigate={() => setDrawerOpen(false)}
                      className="flex min-h-[44px] items-center justify-center rounded-xl bg-slate-50 px-2 text-center text-[13px] font-semibold text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="my-2 border-t border-gray-100" />

            {/* Language — accordion */}
            <button
              type="button"
              aria-expanded={drawerLanguageOpen}
              onClick={() => setDrawerLanguageOpen(o => !o)}
              className="flex min-h-[48px] w-full items-center justify-between rounded-xl px-4 text-[15px] font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">🇮🇳 {t.language}</span>
              <span aria-hidden="true" className={`text-xs text-gray-400 transition-transform ${drawerLanguageOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {drawerLanguageOpen && (
              <div className="grid grid-cols-2 gap-1.5 px-2 pb-2 pt-1">
                {(Object.entries(LANGUAGE_NAMES) as [Language, string][])
                  .filter(([c]) => enabledLanguages.includes(c))
                  .map(([code, name]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => { setLanguage(code); setDrawerLanguageOpen(false); }}
                      aria-current={language === code ? "true" : undefined}
                      className={`min-h-[44px] rounded-xl px-2 text-[13px] font-semibold transition-colors ${
                        language === code ? "bg-orange-500 text-white" : "bg-slate-50 text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
              </div>
            )}

            <div className="my-2 border-t border-gray-100" />

            <Link
              href="/settings"
              onNavigate={() => setDrawerOpen(false)}
              aria-current={isActivePath("/settings") ? "page" : undefined}
              className={`flex min-h-[48px] items-center rounded-xl px-4 text-[15px] font-semibold transition-colors ${
                isActivePath("/settings") ? "bg-orange-50 text-orange-600" : "text-gray-800 hover:bg-gray-50"
              }`}
            >
              {t.aiTutorNavSettings}
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

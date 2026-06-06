"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UI_TEXT, LANGUAGE_NAMES, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

interface NDLUser {
  name: string;
  role: string;
}

const ROLE_COLORS: Record<string, string> = {
  Student:       "bg-blue-50 text-blue-700 border-blue-200",
  Teacher:       "bg-green-50 text-green-700 border-green-200",
  Researcher:    "bg-purple-50 text-purple-700 border-purple-200",
  "Senior Learner": "bg-amber-50 text-amber-700 border-amber-200",
  Admin:         "bg-red-50 text-red-700 border-red-200",
};

const USER_NAV: { label: string; href: string; roles: string[] }[] = [
  { label: "My Library",  href: "/my-library",  roles: ["Student", "Teacher", "Researcher", "Senior Learner", "Admin"] },
  { label: "Quiz",        href: "/quiz",         roles: ["Student", "Teacher", "Researcher", "Senior Learner"] },
  { label: "Flashcards",  href: "/flashcards",   roles: ["Student", "Teacher", "Researcher", "Senior Learner"] },
  { label: "Notes",       href: "/notes",        roles: ["Student", "Teacher", "Researcher", "Senior Learner", "Admin"] },
  { label: "Analytics",   href: "/analytics",    roles: ["Student", "Teacher", "Researcher", "Senior Learner", "Admin"] },
  { label: "Settings",    href: "/settings",     roles: ["Student", "Teacher", "Researcher", "Senior Learner", "Admin"] },
];

export function SiteHeader() {
  const { language, setLanguage } = useLanguage();
  const t = UI_TEXT[language];
  const [user, setUser] = useState<NDLUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("ndlUser");
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
  }, []);

  const logout = () => {
    localStorage.removeItem("ndlUser");
    setUser(null);
    window.location.href = "/";
  };

  const userNav = user
    ? USER_NAV.filter(n => n.roles.includes(user.role))
    : [];

  return (
    <header className="sticky top-0 z-50 border-b border-orange-100 bg-[#FFFAF5]/95 backdrop-blur-md shadow-sm">
      {/* Saffron top band */}
      <div className="bg-[#C85A00] py-1 px-6 text-center text-[10px] uppercase tracking-[2.5px] text-orange-100 overflow-hidden whitespace-nowrap text-ellipsis">
        {t.heroBand}
      </div>

      {/* Main nav row */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 flex-shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#C85A00]">
            <svg viewBox="0 0 28 28" fill="none" width="22" height="22">
              <circle cx="14" cy="14" r="11" stroke="#C85A00" strokeWidth="1.5"/>
              <circle cx="14" cy="14" r="4" fill="#C85A00"/>
              <line x1="14" y1="3" x2="14" y2="25" stroke="#C85A00" strokeWidth="1" opacity="0.5"/>
              <line x1="3" y1="14" x2="25" y2="14" stroke="#C85A00" strokeWidth="1" opacity="0.5"/>
              <line x1="6" y1="6" x2="22" y2="22" stroke="#C85A00" strokeWidth="1" opacity="0.4"/>
              <line x1="22" y1="6" x2="6" y2="22" stroke="#C85A00" strokeWidth="1" opacity="0.4"/>
            </svg>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-stone-900 tracking-wide"
              style={{ fontFamily: "var(--font-cormorant), serif" }}>
              {t.siteName}
            </p>
            <p className="text-[9px] uppercase tracking-widest text-stone-400">{t.government}</p>
          </div>
        </Link>

        {/* Main nav links */}
        <nav className="hidden items-center gap-6 md:flex">
          {([
            [t.navLibrary,  "/library"],
            [t.navResearch, "/explore"],
            [t.navAiTutor,  "/reader"],
            ["Read PDF",    "/read"],
          ] as [string, string][]).map(([label, href]) => (
            <Link key={href} href={href}
              className="text-[11px] uppercase tracking-widest text-stone-500 transition hover:text-[#C85A00]">
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Language selector */}
          <div className="relative hidden sm:block">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="appearance-none rounded border border-orange-200 bg-orange-50 pl-3 pr-7 py-2 text-[11px] text-[#C85A00] outline-none cursor-pointer hover:bg-orange-100 transition"
              aria-label="Select language">
              {(Object.entries(LANGUAGE_NAMES) as [Language, string][]).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#C85A00] text-xs">▾</span>
          </div>

          {user ? (
            /* Logged-in user chip */
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 rounded border border-orange-200 bg-orange-50 px-3 py-2 transition hover:bg-orange-100">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#C85A00] text-[11px] font-semibold text-white flex-shrink-0">
                  {user.name.charAt(0)}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-[11px] font-medium text-stone-800 leading-tight">{user.name}</p>
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium ${ROLE_COLORS[user.role] ?? "bg-stone-50 text-stone-600 border-stone-200"}`}>
                    {user.role}
                  </span>
                </div>
                <span className="text-stone-400 text-xs ml-1">▾</span>
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 rounded border border-orange-100 bg-white shadow-xl z-50">
                  <div className="border-b border-orange-50 px-4 py-3">
                    <p className="text-xs font-medium text-stone-700">{user.name}</p>
                    <p className={`mt-1 inline-block text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border font-medium ${ROLE_COLORS[user.role] ?? "bg-stone-50 text-stone-600 border-stone-200"}`}>
                      {user.role}
                    </p>
                  </div>
                  <div className="py-1">
                    {userNav.map(item => (
                      <Link key={item.href} href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-600 transition hover:bg-orange-50 hover:text-[#C85A00]">
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-orange-50 px-4 py-2">
                    <Link href="/settings" onClick={() => setMenuOpen(false)}
                      className="block py-2 text-[11px] uppercase tracking-wider text-stone-400 transition hover:text-stone-600">
                      Settings
                    </Link>
                    {user.role === "Admin" && (
                      <Link href="/admin" onClick={() => setMenuOpen(false)}
                        className="block py-2 text-[11px] uppercase tracking-wider text-[#C85A00] transition hover:text-[#a84800]">
                        Admin Dashboard
                      </Link>
                    )}
                    <button onClick={logout}
                      className="w-full text-left py-2 text-[11px] uppercase tracking-wider text-red-500 transition hover:text-red-700">
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/sign-in"
                className="hidden rounded border border-stone-300 px-4 py-2 text-[11px] uppercase tracking-wider text-stone-600 transition hover:bg-stone-100 sm:block">
                {t.signIn}
              </Link>
              <Link href="/sign-in"
                className="rounded bg-[#C85A00] px-5 py-2 text-[11px] uppercase tracking-wider text-white transition hover:bg-[#a84800]">
                {t.register}
              </Link>
            </>
          )}

          <Link href="/admin-login"
            className="hidden rounded border border-orange-300 bg-orange-50 px-4 py-2 text-[11px] uppercase tracking-wider text-[#C85A00] transition hover:bg-orange-100 lg:block">
            {t.admin}
          </Link>
        </div>
      </div>

      {/* Logged-in secondary nav bar */}
      {user && (
        <div className="border-t border-orange-100 bg-orange-50/60">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6 py-1.5 lg:px-8">
            <span className="mr-3 text-[9px] uppercase tracking-widest text-stone-400 whitespace-nowrap flex-shrink-0">
              Your workspace:
            </span>
            {userNav.map(item => (
              <Link key={item.href} href={item.href}
                className="whitespace-nowrap rounded-sm px-3 py-1.5 text-[10px] uppercase tracking-wider text-stone-500 transition hover:bg-orange-100 hover:text-[#C85A00] flex-shrink-0">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

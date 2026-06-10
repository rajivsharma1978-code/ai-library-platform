"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UI_TEXT, LANGUAGE_NAMES, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

interface NDLUser { name: string; role: string; }

const ROLE_COLORS: Record<string, string> = {
  Student: "bg-blue-100 text-blue-700",
  Teacher: "bg-green-100 text-green-700",
  Researcher: "bg-purple-100 text-purple-700",
  "Senior Learner": "bg-amber-100 text-amber-700",
  Admin: "bg-red-100 text-red-700",
};

const USER_NAV = [
  { label: "My Library", href: "/my-library" },
  { label: "Quiz",       href: "/quiz" },
  { label: "Flashcards", href: "/flashcards" },
  { label: "Notes",      href: "/notes" },
  { label: "Analytics",  href: "/analytics" },
  { label: "Settings",   href: "/settings" },
];

export function SiteHeader() {
  const { language, setLanguage } = useLanguage();
  const [user, setUser] = useState<NDLUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
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

  const logout = () => {
    localStorage.removeItem("ndlUser");
    setUser(null);
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 h-[60px]">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-full border-2 border-orange-500 flex items-center justify-center bg-orange-50">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <circle cx="12" cy="12" r="8" stroke="#f97316" strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="3" fill="#f97316"/>
              <line x1="12" y1="4" x2="12" y2="20" stroke="#f97316" strokeWidth="1.2" opacity="0.5"/>
              <line x1="4" y1="12" x2="20" y2="12" stroke="#f97316" strokeWidth="1.2" opacity="0.5"/>
            </svg>
          </div>
          <div>
            <div className="text-[15px] font-bold text-gray-900 leading-none">NDL AI</div>
            <div className="text-[10px] text-gray-400 leading-tight mt-0.5">
              {t.siteName}<br/>{t.government}
            </div>
          </div>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1">
          <Link href="/" className="px-3 py-1 text-[13.5px] font-semibold text-orange-500 border-b-2 border-orange-500">
            Home
          </Link>
          {([
            [t.navLibrary,   "/library"],
            [t.navAiTutor,   "/reader"],
            ["Explore",      "/explore"],
            [t.navLibrary.includes("Library") ? "My Space" : "मेरा स्थान", "/my-library"],
            ["Analytics",    "/analytics"],
          ] as [string, string][]).map(([l, h]) => (
            <Link key={h} href={h}
              className="px-3 py-1 text-[13.5px] font-medium text-gray-700 hover:text-orange-500 transition-colors">
              {l}
            </Link>
          ))}
          <div className="relative">
            <button onClick={() => setMoreOpen(!moreOpen)}
              className="flex items-center gap-1 px-3 py-1 text-[13.5px] font-medium text-gray-700 hover:text-orange-500">
              More <span className="text-[10px] mt-0.5">▾</span>
            </button>
            {moreOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 w-44 z-50">
                {[
                  ["Read PDF",    "/read"],
                  [t.navLibrary.includes("Library") ? "Notes" : "नोट्स", "/notes"],
                  ["Flashcards",  "/flashcards"],
                  ["Revision",    "/revision"],
                  ["Settings",    "/settings"],
                  [t.adminLogin,  "/admin-login"],
                ].map(([l, h]) => (
                  <Link key={h} href={h} onClick={() => setMoreOpen(false)}
                    className="block px-4 py-2 text-[13px] text-gray-600 hover:bg-orange-50 hover:text-orange-500">
                    {l}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Right */}
        <div className="flex items-center gap-2.5">
          <button className="p-1.5 text-gray-500 hover:text-orange-500 transition-colors">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>

          {/* Language selector */}
          <div className="relative hidden sm:block">
            <select value={language} onChange={e => setLanguage(e.target.value as Language)}
              className="appearance-none pl-7 pr-6 py-1.5 text-[12.5px] font-medium text-gray-700 bg-transparent border-0 outline-none cursor-pointer">
              {(Object.entries(LANGUAGE_NAMES) as [Language, string][]).map(([c, n]) => (
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
                      <Link key={n.href} href={n.href} onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2.5 text-[13px] text-gray-600 hover:bg-orange-50 hover:text-orange-500">
                        {n.label}
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 px-4 py-2">
                    {user.role === "Admin" && (
                      <Link href="/admin" onClick={() => setMenuOpen(false)}
                        className="block py-1.5 text-[12px] font-semibold text-orange-500">
                        Admin Dashboard →
                      </Link>
                    )}
                    <button onClick={logout}
                      className="w-full text-left py-1.5 text-[12px] text-red-500 hover:text-red-700">
                      {t.signIn.includes("Sign") ? "Sign Out" : "साइन आउट"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/sign-in"
                className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 py-2 rounded-xl shadow-sm transition-all hover:shadow-md">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                {t.signIn}
              </Link>
              <Link href="/admin-login"
                className="hidden lg:flex items-center gap-1.5 border border-orange-300 text-orange-600 hover:bg-orange-50 text-[12px] font-semibold px-3 py-2 rounded-xl transition-all">
                {t.adminLogin}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Logged-in workspace bar */}
      {user && (
        <div className="border-t border-orange-100 bg-orange-50/60">
          <div className="mx-auto max-w-[1200px] px-6 flex items-center gap-1 py-1.5 overflow-x-auto">
            <span className="text-[11px] font-semibold text-orange-400 uppercase tracking-wider mr-2 whitespace-nowrap">
              Workspace:
            </span>
            {USER_NAV.map(n => (
              <Link key={n.href} href={n.href}
                className="whitespace-nowrap px-3 py-1 text-[12px] font-medium text-gray-600 rounded-lg hover:bg-white hover:text-orange-500 hover:shadow-sm transition-all">
                {n.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export default function AdminLoginPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (username === "demo" && password === "demo123") {
      localStorage.setItem("ndlAdminAccess", "granted");
      router.push("/admin");
    } else {
      setError(t.adminLoginError);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#0f172a_55%,#020617_100%)] flex flex-col items-center justify-center px-4 py-10 sm:p-8">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-slate-200 transition">
          ← {t.commonHome}
        </Link>

        <div className="mt-6 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full border-2 border-amber-500 flex items-center justify-center bg-slate-900 flex-shrink-0">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
              <circle cx="12" cy="12" r="8" stroke="#f59e0b" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="3" fill="#f59e0b" />
              <line x1="12" y1="4" x2="12" y2="20" stroke="#f59e0b" strokeWidth="1.2" opacity="0.5" />
              <line x1="4" y1="12" x2="20" y2="12" stroke="#f59e0b" strokeWidth="1.2" opacity="0.5" />
            </svg>
          </div>
          <p className="mt-3 text-lg font-black text-white">NDL AI</p>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
            {t.adminLoginPortalLabel}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-amber-500/30">
              {t.commonDemo}
            </span>
            <span className="text-[11px] text-slate-400">{t.government}</span>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.35)] ring-1 ring-black/5 p-6 sm:p-10">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-950">
            {t.adminLoginTitle}
          </h1>

          <p className="text-slate-600 mt-3">
            {t.adminLoginSubtitle}
          </p>

          <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
            <span aria-hidden="true">🔒</span>
            <span>{t.adminLoginAccessNote}</span>
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="admin-username" className="sr-only">{t.adminLoginUsernameLabel}</label>
              <input
                id="admin-username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder={t.adminLoginUsernameLabel}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="sr-only">{t.adminLoginPasswordLabel}</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder={t.adminLoginPasswordLabel}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            <div aria-live="assertive">
              {error && (
                <p className="text-red-600 text-sm">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-2xl font-bold shadow-md shadow-orange-500/25 transition"
            >
              {t.adminLoginButton}
            </button>
          </form>

          <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm">
            <p className="font-semibold text-amber-900">
              {t.adminLoginDemoCredentialsLabel}
            </p>

            <p className="mt-2 text-amber-800">
              {t.adminLoginDemoIdLabel} demo
            </p>

            <p className="text-amber-800">
              {t.adminLoginDemoPasswordLabel} demo123
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

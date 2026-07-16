"use client";

import { useState } from "react";
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

  function handleLogin() {
    if (username === "demo" && password === "demo123") {
      localStorage.setItem("ndlAdminAccess", "granted");
      router.push("/admin");
    } else {
      setError(t.adminLoginError);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex items-center justify-center p-8">
      <div className="bg-white rounded-[2rem] shadow-[0_20px_60px_rgba(75,45,12,0.12)] ring-1 ring-black/5 p-10 w-full max-w-md">
        <p className="uppercase tracking-widest text-sm font-bold text-amber-700">
          NDL AI
        </p>

        <h1 className="text-4xl font-black mt-3 text-slate-950">
          {t.adminLoginTitle}
        </h1>

        <p className="text-slate-600 mt-3">
          {t.adminLoginSubtitle}
        </p>

        <div className="mt-8 space-y-5">
          <div>
            <label htmlFor="admin-username" className="sr-only">{t.adminLoginUsernameLabel}</label>
            <input
              id="admin-username"
              type="text"
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
              type="password"
              placeholder={t.adminLoginPasswordLabel}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">
              {error}
            </p>
          )}

          <button
            onClick={handleLogin}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-2xl font-bold shadow-md shadow-orange-500/25 transition"
          >
            {t.adminLoginButton}
          </button>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm">
          <p className="font-semibold text-blue-900">
            {t.adminLoginDemoCredentialsLabel}
          </p>

          <p className="mt-2 text-blue-700">
            {t.adminLoginDemoIdLabel} demo
          </p>

          <p className="text-blue-700">
            {t.adminLoginDemoPasswordLabel} demo123
          </p>
        </div>
      </div>
    </main>
  );
}

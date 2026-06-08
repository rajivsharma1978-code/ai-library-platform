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
      setError("Invalid admin credentials");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-8">
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md">
        <p className="uppercase tracking-widest text-sm text-blue-600">
          NDL AI
        </p>

        <h1 className="text-4xl font-bold mt-3 text-slate-900">
          Admin Login
        </h1>

        <p className="text-slate-500 mt-3">
          Protected administrator access for the national digital library.
        </p>

        <div className="mt-8 space-y-5">
          <input
            type="text"
            placeholder="Admin ID"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border rounded-2xl px-5 py-4 outline-none"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-2xl px-5 py-4 outline-none"
          />

          {error && (
            <p className="text-red-600 text-sm">
              {error}
            </p>
          )}

          <button
            onClick={handleLogin}
            className="w-full bg-black text-white py-4 rounded-2xl font-semibold"
          >
            Login to Admin Dashboard
          </button>
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm">
          <p className="font-semibold text-blue-900">
            Demo Credentials
          </p>

          <p className="mt-2 text-blue-700">
            ID: demo
          </p>

          <p className="text-blue-700">
            Password: demo123
          </p>
        </div>
      </div>
    </main>
  );
}
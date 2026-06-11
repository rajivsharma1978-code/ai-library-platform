"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const demoUsers: Record<string, { password: string; role: string; name: string }> = {
  student:    { password: "student123",    role: "Student",       name: "Demo Student"  },
  teacher:    { password: "teacher123",    role: "Teacher",       name: "Demo Teacher"  },
  researcher: { password: "researcher123", role: "Researcher",    name: "Demo Researcher" },
  senior:     { password: "senior123",     role: "Senior Learner",name: "Senior Learner" },
  demo:       { password: "demo123",       role: "Admin",         name: "Admin User"    },
};

export default function SignInPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function signIn() {
    const user = demoUsers[userId.toLowerCase()];
    if (!user || user.password !== password) {
      setError(t.chatError);
      return;
    }
    if (user.role === "Admin") {
      router.push("/admin-login");
      return;
    }
    localStorage.setItem("ndlUser", JSON.stringify({
      name: user.name,
      role: user.role,
      signedIn: true,
    }));
    router.push("/");
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-8">
      <div className="bg-white rounded-3xl p-10 shadow-2xl w-full max-w-xl">
        <Link href="/" className="text-blue-600 font-semibold">
          ← {t.navLibrary}
        </Link>

        <h1 className="text-4xl font-bold mt-8">{t.signIn} — NDL AI</h1>

        <p className="text-slate-500 mt-3">
          {t.chatSubtitle}
        </p>

        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder={t.searchPlaceholder.includes("Search") ? "User ID" : "उपयोगकर्ता आईडी"}
          className="w-full border rounded-2xl px-5 py-4 mt-8"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.searchPlaceholder.includes("Search") ? "Password" : "पासवर्ड"}
          className="w-full border rounded-2xl px-5 py-4 mt-4"
        />

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

        <button
          onClick={signIn}
          className="w-full bg-black text-white py-4 rounded-2xl mt-6 font-semibold"
        >
          {t.signIn}
        </button>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm">
          <p className="font-bold text-blue-900">Demo Credentials</p>
          <p className="mt-2">Student: student / student123</p>
          <p>Teacher: teacher / teacher123</p>
          <p>Researcher: researcher / researcher123</p>
          <p>Senior Learner: senior / senior123</p>
          <p>Admin: demo / demo123</p>
        </div>
      </div>
    </main>
  );
}
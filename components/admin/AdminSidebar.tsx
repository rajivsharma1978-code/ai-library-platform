"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  { label: "📊 Dashboard", href: "/admin" },
  { label: "📚 Book Management", href: "/admin/book-management" },
  { label: "⬆️ Upload Queue", href: "/admin/upload-queue" },
  { label: "🌐 Languages", href: "/admin/languages" },
  { label: "👥 Users", href: "/admin/users" },
  { label: "📈 Analytics", href: "/analytics" },
  { label: "🤖 AI Usage", href: "/admin/ai-usage" },
  { label: "♿ Accessibility", href: "/admin/accessibility" },
  { label: "🛡️ Moderation", href: "/admin/moderation" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="w-72 bg-slate-950 text-white p-6 min-h-screen flex flex-col">
      <div>
        <h1 className="text-3xl font-bold">NDL AI Admin</h1>
        <p className="text-slate-400 mt-2 text-sm">National library control center</p>
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
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 space-y-3 border-t border-slate-800">
        <Link href="/" className="block text-blue-400 font-semibold text-sm hover:text-blue-300 transition">
          ← Back to Library
        </Link>
        <button
          onClick={() => {
            localStorage.removeItem("ndlAdminAccess");
            router.push("/admin-login");
          }}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}

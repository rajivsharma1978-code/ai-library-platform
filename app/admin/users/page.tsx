"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import {
  loadUsers, saveUsers, usingDemoUsers, logActivity, newId,
  type AdminUser, type UserRole,
} from "@/components/admin/adminData";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import SearchBar from "@/components/ui/SearchBar";
import AppButton from "@/components/ui/AppButton";

const ROLE_OPTIONS: UserRole[] = ["Student", "Teacher", "Researcher", "Senior Learner", "Admin"];
const ROLE_COLORS: Record<UserRole, string> = {
  Student: "bg-blue-100 text-blue-700",
  Teacher: "bg-green-100 text-green-700",
  Researcher: "bg-slate-200 text-slate-700",
  "Senior Learner": "bg-amber-100 text-amber-700",
  Admin: "bg-red-100 text-red-700",
};

function timeAgo(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function AdminUsersPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usingDemo, setUsingDemo] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  function refresh() {
    setUsers(loadUsers());
    setUsingDemo(usingDemoUsers());
  }

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") {
      router.push("/admin-login");
      return;
    }
    setCheckedAccess(true);
    refresh();
    setMounted(true);
  }, [router]);

  function toggleStatus(user: AdminUser) {
    const next = users.map(u => u.id === user.id ? { ...u, status: (u.status === "Active" ? "Suspended" : "Active") as AdminUser["status"] } : u);
    saveUsers(next);
    logActivity("edit", `${user.name} was ${user.status === "Active" ? "suspended" : "reactivated"}`);
    refresh();
  }

  function addDemoUser() {
    const n = users.length + 1;
    const user: AdminUser = {
      id: newId("user"), name: `Demo User ${n}`, email: `demo.user${n}@example.com`,
      role: "Student", status: "Active", joinedAt: Date.now(),
    };
    saveUsers([user, ...users]);
    logActivity("add", `${user.name} added`);
    refresh();
  }

  function removeUser(user: AdminUser) {
    if (!window.confirm(`Remove ${user.name}? This is a demo action stored locally.`)) return;
    saveUsers(users.filter(u => u.id !== user.id));
    logActivity("delete", `${user.name} removed`);
    refresh();
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = roleFilter === "All" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  if (!mounted || !checkedAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)]">
        <p className="text-sm font-semibold text-slate-400">Checking admin access…</p>
      </main>
    );
  }

  const active = users.filter(u => u.status === "Active").length;
  const suspended = users.filter(u => u.status === "Suspended").length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <PageHeader
          badge="Admin · Users"
          title="Manage Users"
          subtitle="View, suspend, and manage learner and educator accounts."
          homeLabel={t.commonHome}
        />

        <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
          📌 Demo admin actions are stored locally for this prototype — nothing here touches a real backend.
        </InfoCard>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={users.length} />
          <StatCard label="Active" value={active} valueClassName="text-green-600" />
          <StatCard label="Suspended" value={suspended} valueClassName="text-red-500" />
          <StatCard label="Roles Represented" value={new Set(users.map(u => u.role)).size} badge={usingDemo ? "demo" : undefined} />
        </div>

        <InfoCard className="mt-6 flex flex-wrap gap-4 items-center">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name or email…" className="flex-1 min-w-[200px]" />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm focus:ring-2 focus:ring-amber-400">
            {["All", ...ROLE_OPTIONS].map(r => <option key={r}>{r}</option>)}
          </select>
          <AppButton onClick={addDemoUser} variant="accent">
            + Add Demo User
          </AppButton>
        </InfoCard>

        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 mt-6 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{["Name", "Email", "Role", "Status", "Joined", "Actions"].map(h => (
                <th key={h} className="text-left px-6 py-4 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-800">{u.name}</td>
                  <td className="px-6 py-4 text-slate-600">{u.email}</td>
                  <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role]}`}>{u.role}</span></td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${u.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{timeAgo(u.joinedAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      <button onClick={() => toggleStatus(u)} className="text-blue-600 hover:underline text-xs font-semibold">
                        {u.status === "Active" ? "Suspend" : "Reactivate"}
                      </button>
                      <button onClick={() => removeUser(u)} className="text-red-500 hover:underline text-xs font-semibold">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-center text-slate-400 py-12">No users match your filters.</p>}
        </div>
      </section>
    </main>
  );
}

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

type UIText = { [K in keyof typeof UI_TEXT["en"]]: string };

// Fixed role set compared directly against stored user records — the
// values themselves (used for filtering, storage, and as object keys)
// stay untranslated; only their on-screen text goes through
// roleLabel()/ROLE_LABELS below.
const ROLE_OPTIONS: UserRole[] = ["Student", "Teacher", "Researcher", "Senior Learner", "Admin"];
const ROLE_COLORS: Record<UserRole, string> = {
  Student: "bg-blue-100 text-blue-700",
  Teacher: "bg-green-100 text-green-700",
  Researcher: "bg-slate-200 text-slate-700",
  "Senior Learner": "bg-amber-100 text-amber-700",
  Admin: "bg-red-100 text-red-700",
};

function timeAgo(ts: number, t: UIText): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days < 1) return t.revisionToday;
  return t.mySpaceDayAgo.replace("{n}", String(days));
}

export default function AdminUsersPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const router = useRouter();

  const ROLE_LABELS: Record<UserRole, string> = {
    Student: t.adminUsersRoleStudent, Teacher: t.adminUsersRoleTeacher, Researcher: t.adminUsersRoleResearcher,
    "Senior Learner": t.adminUsersRoleSeniorLearner, Admin: t.adminUsersRoleAdmin,
  };
  const STATUS_LABELS: Record<AdminUser["status"], string> = {
    Active: t.adminUsersStatActive, Suspended: t.adminUsersStatSuspended,
  };

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
    if (!window.confirm(t.adminUsersRemoveConfirm.replace("{name}", user.name))) return;
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
        <p className="text-sm font-semibold text-slate-400">{t.adminCheckingAccess}</p>
      </main>
    );
  }

  const active = users.filter(u => u.status === "Active").length;
  const suspended = users.filter(u => u.status === "Suspended").length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] flex flex-col lg:flex-row">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <PageHeader
          badge={t.adminUsersBadge}
          title={t.adminUsersTitle}
          subtitle={t.adminUsersSubtitle}
          homeLabel={t.commonHome}
          showHomeLink={false}
        />

        <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
          📌 {t.adminDemoDisclaimer}
        </InfoCard>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t.adminUsersStatTotal} value={users.length} />
          <StatCard label={t.adminUsersStatActive} value={active} valueClassName="text-green-600" />
          <StatCard label={t.adminUsersStatSuspended} value={suspended} valueClassName="text-red-500" />
          <StatCard label={t.adminUsersStatRoles} value={new Set(users.map(u => u.role)).size} badge={usingDemo ? t.commonDemo : undefined} />
        </div>

        <InfoCard className="mt-6 flex flex-wrap gap-4 items-center">
          <SearchBar value={search} onChange={setSearch} placeholder={t.adminUsersSearchPlaceholder} className="flex-1 min-w-[200px]" />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm focus:ring-2 focus:ring-amber-400">
            <option value="All">{t.commonAll}</option>
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <AppButton onClick={addDemoUser} variant="accent">
            + {t.adminUsersAddDemoUser}
          </AppButton>
        </InfoCard>

        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 mt-6 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{[t.adminUsersTableName, t.adminUsersTableEmail, t.adminUsersTableRole, t.adminBmFieldStatus, t.adminUsersTableJoined, t.adminBmTableActions].map(h => (
                <th key={h} className="text-left px-6 py-4 font-semibold text-slate-600 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-800">{u.name}</td>
                  <td className="px-6 py-4 text-slate-600">{u.email}</td>
                  <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role] ?? u.role}</span></td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${u.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {STATUS_LABELS[u.status] ?? u.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{timeAgo(u.joinedAt, t)}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      <button onClick={() => toggleStatus(u)} className="text-blue-600 hover:underline text-xs font-semibold">
                        {u.status === "Active" ? t.adminUsersSuspend : t.adminUsersReactivate}
                      </button>
                      <button onClick={() => removeUser(u)} className="text-red-500 hover:underline text-xs font-semibold">{t.adminUsersRemove}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-center text-slate-400 py-12">{t.adminUsersEmpty}</p>}
        </div>
      </section>
    </main>
  );
}

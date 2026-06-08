"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const mockUsers = [
  { id: 1, name: "Arjun Sharma", email: "arjun.sharma@email.com", role: "Student", language: "Hindi", booksRead: 34, joinedAt: "2024-01-10", lastActive: "Today", status: "Active" },
  { id: 2, name: "Priya Nair", email: "priya.nair@email.com", role: "Researcher", language: "English", booksRead: 128, joinedAt: "2023-11-22", lastActive: "Today", status: "Active" },
  { id: 3, name: "Ravi Kumar", email: "ravi.kumar@email.com", role: "Student", language: "Tamil", booksRead: 12, joinedAt: "2024-03-05", lastActive: "Yesterday", status: "Active" },
  { id: 4, name: "Meena Patel", email: "meena.patel@email.com", role: "Teacher", language: "Gujarati", booksRead: 67, joinedAt: "2023-09-14", lastActive: "2 days ago", status: "Active" },
  { id: 5, name: "Sundar Das", email: "sundar.das@email.com", role: "Student", language: "Bengali", booksRead: 8, joinedAt: "2024-04-18", lastActive: "1 week ago", status: "Inactive" },
  { id: 6, name: "Anita Reddy", email: "anita.reddy@email.com", role: "Librarian", language: "Telugu", booksRead: 210, joinedAt: "2023-06-01", lastActive: "Today", status: "Active" },
  { id: 7, name: "Karan Singh", email: "karan.singh@email.com", role: "Student", language: "Punjabi", booksRead: 5, joinedAt: "2024-05-30", lastActive: "3 days ago", status: "Active" },
  { id: 8, name: "Fatima Shaikh", email: "fatima.shaikh@email.com", role: "Researcher", language: "Urdu", booksRead: 91, joinedAt: "2024-02-11", lastActive: "Today", status: "Suspended" },
];

const roleColors: Record<string, string> = {
  Student: "bg-blue-100 text-blue-700",
  Researcher: "bg-purple-100 text-purple-700",
  Teacher: "bg-green-100 text-green-700",
  Librarian: "bg-amber-100 text-amber-700",
};

const statusColors: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  Inactive: "bg-slate-100 text-slate-500",
  Suspended: "bg-red-100 text-red-600",
};

export default function UsersPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

  useEffect(() => {
    if (localStorage.getItem("ndlAdminAccess") !== "granted") router.push("/admin-login");
  }, [router]);

  const filtered = mockUsers.filter((u) => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "All" || u.role === filterRole;
    const matchStatus = filterStatus === "All" || u.status === filterStatus;
    return matchSearch && matchRole && matchStatus;
  });

  return (
    <main className="min-h-screen bg-slate-100 flex">
      <AdminSidebar />
      <section className="flex-1 p-8 overflow-auto">
        <div className="bg-gradient-to-r from-rose-700 to-pink-700 text-white rounded-3xl p-10 shadow-2xl">
          <p className="uppercase tracking-widest text-sm opacity-80">Admin · Users</p>
          <h2 className="text-4xl font-bold mt-2">User Management</h2>
          <p className="mt-3 text-rose-100">Monitor and manage all registered users of the national digital library.</p>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6">
          {[
            ["8.2M", "Total Users", "text-slate-800"],
            [mockUsers.filter(u => u.status === "Active").length, "Active (shown)", "text-green-600"],
            [mockUsers.filter(u => u.role === "Student").length, "Students", "text-blue-600"],
            [mockUsers.filter(u => u.status === "Suspended").length, "Suspended", "text-red-600"],
          ].map(([val, label, color]) => (
            <div key={String(label)} className="bg-white rounded-2xl p-5 shadow text-center">
              <p className={`text-3xl font-bold ${color}`}>{val}</p>
              <p className="text-slate-500 text-sm mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow mt-6 flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm focus:border-blue-400"
          />
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm">
            {["All", "Student", "Researcher", "Teacher", "Librarian"].map(r => <option key={r}>{r}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-slate-200 rounded-xl px-4 py-2.5 outline-none text-sm">
            {["All", "Active", "Inactive", "Suspended"].map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition">
            + Invite User
          </button>
        </div>

        <div className="bg-white rounded-3xl shadow mt-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["User", "Role", "Language", "Books Read", "Joined", "Last Active", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left px-6 py-4 font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{user.name}</p>
                        <p className="text-xs text-slate-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${roleColors[user.role]}`}>{user.role}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{user.language}</td>
                  <td className="px-6 py-4 font-semibold text-slate-700">{user.booksRead}</td>
                  <td className="px-6 py-4 text-slate-500">{user.joinedAt}</td>
                  <td className="px-6 py-4 text-slate-500">{user.lastActive}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[user.status]}`}>{user.status}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button className="text-blue-600 hover:underline text-xs">View</button>
                      {user.status !== "Suspended" ? (
                        <button className="text-red-500 hover:underline text-xs">Suspend</button>
                      ) : (
                        <button className="text-green-600 hover:underline text-xs">Reinstate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-slate-400 py-12">No users match your filters.</p>
          )}
        </div>
      </section>
    </main>
  );
}

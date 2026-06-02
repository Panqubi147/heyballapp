"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

const items = [
  { href: "/", label: "Dashboard" },
  { href: "/editor", label: "Kreator" },
  { href: "/exercises", label: "Ćwiczenia" },
  { href: "/programs", label: "Treningi" },
  { href: "/stats", label: "Statystyki" },
  { href: "/mental", label: "Mental" },
];

export function Header() {
  const { user, role, loading, logout } = useAuth();

  return (
    <header className="bg-slate-800 text-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3 text-sm font-semibold">
        <div className="mr-4 text-lg font-bold">Heyball Coach</div>

        {items.map((item) => (
  <Link
    key={item.href}
    href={item.href}
    className="rounded px-3 py-2 hover:bg-slate-700"
  >
    {item.label}
  </Link>
))}

{/* 🔥 PANEL TRENERA */}
{role === "coach" && (
  <Link
    href="/coach"
    className="rounded px-3 py-2 hover:bg-slate-700 bg-orange-600"
  >
    Panel trenera
  </Link>
)}

        {/* 🔥 NOWA CZĘŚĆ – AUTH */}
        <div className="ml-auto flex items-center gap-3">
          {loading ? (
            <span className="text-slate-300">Ładowanie...</span>
          ) : user ? (
            <>
              <span className="hidden max-w-[200px] truncate text-slate-300 md:inline">
                {user.email}
              </span>

              <button
                onClick={logout}
                className="rounded bg-slate-700 px-3 py-2 hover:bg-slate-600"
              >
                Wyloguj
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded bg-orange-600 px-3 py-2 hover:bg-orange-500"
            >
              Zaloguj
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
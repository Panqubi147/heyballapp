"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";

export function LoginRequired({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <p>Sprawdzanie logowania...</p>;
  }

  if (!user) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-bold">Zaloguj się</h1>
        <p className="mt-2 text-slate-600">
          Musisz być zalogowany, żeby korzystać z ćwiczeń, treningów i statystyk.
        </p>

        <Link
          href="/login"
          className="mt-6 inline-block rounded bg-orange-600 px-6 py-3 font-bold text-white hover:bg-orange-500"
        >
          Przejdź do logowania
        </Link>
      </section>
    );
  }

  return <>{children}</>;
}

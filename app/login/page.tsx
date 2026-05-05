"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password.trim()) {
      alert("Wpisz email i hasło.");
      return;
    }

    if (password.length < 6) {
      alert("Hasło musi mieć minimum 6 znaków.");
      return;
    }

    if (mode === "register" && (!firstName.trim() || !lastName.trim())) {
      alert("Wpisz imię i nazwisko.");
      return;
    }

    setBusy(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register({
          email,
          password,
          firstName,
          lastName,
        });
      }

      router.push("/");
    } catch (error) {
      console.error(error);
      alert(
        mode === "login"
          ? "Nie udało się zalogować. Sprawdź email i hasło."
          : "Nie udało się utworzyć konta. Email może już istnieć."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-2xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold">
          {mode === "login" ? "Logowanie" : "Rejestracja"}
        </h1>

        <p className="mt-2 text-slate-600">
          Zaloguj się, żeby mieć własne ćwiczenia, treningi i statystyki.
        </p>

        <div className="mt-6 space-y-4">
          {mode === "register" && (
            <>
              <input
                className="w-full rounded border p-3"
                type="text"
                placeholder="Imię"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />

              <input
                className="w-full rounded border p-3"
                type="text"
                placeholder="Nazwisko"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </>
          )}

          <input
            className="w-full rounded border p-3"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <input
            className="w-full rounded border p-3"
            type="password"
            placeholder="Hasło"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded bg-orange-600 px-6 py-3 font-bold text-white hover:bg-orange-500 disabled:opacity-60"
          >
            {busy
              ? "Proszę czekać..."
              : mode === "login"
                ? "Zaloguj się"
                : "Utwórz konto"}
          </button>

          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="w-full rounded bg-slate-100 px-6 py-3 font-bold text-slate-800 hover:bg-slate-200"
          >
            {mode === "login"
              ? "Nie mam konta — rejestracja"
              : "Mam konto — logowanie"}
          </button>
        </div>
      </div>
    </section>
  );
}
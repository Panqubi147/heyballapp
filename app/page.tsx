"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds?: number;
};

type TrainingSession = {
  id: string;
  userId?: string;
  programId: string;
  programName?: string;
  status?: "inProgress" | "completed" | "abandoned";
  updatedAt?: FirestoreTimestamp;
  finishedAt?: FirestoreTimestamp;
  sessionAveragePercentage?: number;
};

function formatDate(timestamp?: FirestoreTimestamp) {
  if (!timestamp?.seconds) return "-";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp.seconds * 1000));
}

export default function HomePage() {
  const { user, role } = useAuth();

  const [exerciseCount, setExerciseCount] = useState(0);
  const [globalExerciseCount, setGlobalExerciseCount] = useState(0);
  const [programCount, setProgramCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const ownExercisesSnapshot = await getDocs(
      query(collection(db, "exercises"), where("userId", "==", user.uid))
    );

    const globalExercisesSnapshot = await getDocs(
      query(collection(db, "exercises"), where("isGlobal", "==", true))
    );

    const programsSnapshot = await getDocs(
      query(collection(db, "trainingPrograms"), where("userId", "==", user.uid))
    );

    const sessionsSnapshot = await getDocs(
      query(collection(db, "trainingSessions"), where("userId", "==", user.uid))
    );

    const loadedSessions = sessionsSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as TrainingSession[];

    setExerciseCount(ownExercisesSnapshot.size + globalExercisesSnapshot.size);
    setGlobalExerciseCount(globalExercisesSnapshot.size);
    setProgramCount(programsSnapshot.size);
    setSessionCount(loadedSessions.length);
    setCompletedCount(
      loadedSessions.filter((session) => session.status === "completed").length
    );
    setSessions(loadedSessions);
    setLoading(false);
  }

  useEffect(() => {
    loadDashboard().catch((error) => {
      console.error(error);
      setLoading(false);
    });
  }, [user]);

  const inProgressSession = useMemo(() => {
    return sessions
      .filter((session) => session.status === "inProgress")
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))[0];
  }, [sessions]);

  const lastCompletedSession = useMemo(() => {
    return sessions
      .filter((session) => session.status === "completed")
      .sort(
        (a, b) =>
          (b.finishedAt?.seconds || b.updatedAt?.seconds || 0) -
          (a.finishedAt?.seconds || a.updatedAt?.seconds || 0)
      )[0];
  }, [sessions]);

  return (
    <LoginRequired>
      <section className="space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-black">Heyball Coach</h1>
              <p className="mt-2 text-slate-600">
                Twórz ćwiczenia, układaj treningi i śledź progres.
              </p>
            </div>

            {role === "coach" && (
              <Link
                href="/coach"
                className="rounded bg-orange-600 px-5 py-3 text-center font-bold text-white hover:bg-orange-500"
              >
                Panel trenera
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <p>Ładowanie dashboardu...</p>
        ) : (
          <>
            {inProgressSession && (
              <div className="rounded-2xl bg-orange-100 p-6 shadow">
                <h2 className="text-xl font-black text-orange-900">
                  Masz niedokończony trening
                </h2>
                <p className="mt-2 text-orange-800">
                  {inProgressSession.programName || "Trening w toku"}
                </p>

                <Link
                  href={`/practice/${inProgressSession.programId}`}
                  className="mt-4 inline-block rounded bg-orange-600 px-6 py-3 font-bold text-white hover:bg-orange-500"
                >
                  Kontynuuj trening
                </Link>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-5">
              <div className="rounded-2xl bg-white p-5 shadow">
                <p className="text-sm text-slate-500">Ćwiczenia</p>
                <p className="text-3xl font-black">{exerciseCount}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Globalne: {globalExerciseCount}
                </p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <p className="text-sm text-slate-500">Treningi</p>
                <p className="text-3xl font-black">{programCount}</p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <p className="text-sm text-slate-500">Sesje</p>
                <p className="text-3xl font-black">{sessionCount}</p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <p className="text-sm text-slate-500">Zakończone</p>
                <p className="text-3xl font-black">{completedCount}</p>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow">
                <p className="text-sm text-slate-500">Ostatni wynik</p>
                <p className="text-3xl font-black">
                  {lastCompletedSession?.sessionAveragePercentage !== undefined
                    ? `${lastCompletedSession.sessionAveragePercentage.toFixed(0)}%`
                    : "-"}
                </p>
              </div>
            </div>

            {lastCompletedSession && (
              <div className="rounded-2xl bg-white p-6 shadow">
                <h2 className="text-xl font-bold">Ostatnia zakończona sesja</h2>
                <p className="mt-2 text-slate-600">
                  {lastCompletedSession.programName || "Trening"} ·{" "}
                  {formatDate(lastCompletedSession.finishedAt || lastCompletedSession.updatedAt)}
                </p>
                <p className="mt-1 font-bold text-orange-700">
                  Wynik:{" "}
                  {lastCompletedSession.sessionAveragePercentage !== undefined
                    ? `${lastCompletedSession.sessionAveragePercentage.toFixed(1)}%`
                    : "-"}
                </p>
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Link
                href="/editor"
                className="rounded-2xl bg-white p-6 shadow transition hover:-translate-y-1 hover:shadow-lg"
              >
                <h2 className="text-xl font-black">Kreator ćwiczeń</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Dodaj bile, linie, opis i punktację.
                </p>
              </Link>

              <Link
                href="/exercises"
                className="rounded-2xl bg-white p-6 shadow transition hover:-translate-y-1 hover:shadow-lg"
              >
                <h2 className="text-xl font-black">Baza ćwiczeń</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Przeglądaj swoje i globalne ćwiczenia.
                </p>
              </Link>

              <Link
                href="/programs"
                className="rounded-2xl bg-white p-6 shadow transition hover:-translate-y-1 hover:shadow-lg"
              >
                <h2 className="text-xl font-black">Treningi</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Twórz treningi i zaczynaj sesje.
                </p>
              </Link>

              <Link
                href="/stats"
                className="rounded-2xl bg-white p-6 shadow transition hover:-translate-y-1 hover:shadow-lg"
              >
                <h2 className="text-xl font-black">Statystyki</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Sprawdź progres po sesjach i ćwiczeniach.
                </p>
              </Link>
            </div>
          </>
        )}
      </section>
    </LoginRequired>
  );
}
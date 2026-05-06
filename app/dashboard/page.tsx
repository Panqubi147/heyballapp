"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";

type FirestoreTimestamp = {
  seconds: number;
};

type TrainingSessionResult = {
  exerciseId: string;
  attempts: number[];
  average: number;
  best: number;
  maxScore: number;
  percentage: number;
};

type TrainingSessionDoc = {
  id: string;
  programName?: string;
  status?: "inProgress" | "completed" | "abandoned";
  finishedAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  sessionAveragePercentage?: number;
  results?: TrainingSessionResult[];
};

type ExerciseNameMap = Record<string, string>;

function formatDate(timestamp?: FirestoreTimestamp) {
  if (!timestamp?.seconds) return "-";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
  }).format(new Date(timestamp.seconds * 1000));
}

function getSessionAverage(session: TrainingSessionDoc) {
  if (typeof session.sessionAveragePercentage === "number") {
    return session.sessionAveragePercentage;
  }

  const attempted = (session.results || []).filter((result) => result.attempts.length > 0);
  if (attempted.length === 0) return 0;

  return attempted.reduce((sum, result) => sum + result.percentage, 0) / attempted.length;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default function DashboardPage() {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<TrainingSessionDoc[]>([]);
  const [exerciseNames, setExerciseNames] = useState<ExerciseNameMap>({});
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const sessionsSnapshot = await getDocs(
      query(collection(db, "trainingSessions"), where("userId", "==", user.uid))
    );

    const loadedSessions = sessionsSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as TrainingSessionDoc[];

    const exercisesSnapshot = await getDocs(
      query(collection(db, "exercises"), where("userId", "==", user.uid))
    );

    const names: ExerciseNameMap = {};

    exercisesSnapshot.docs.forEach((document) => {
      const data = document.data();
      names[document.id] = data.name || "Ćwiczenie";
    });

    setSessions(loadedSessions);
    setExerciseNames(names);
    setLoading(false);
  }

  useEffect(() => {
    loadDashboard().catch((error) => {
      console.error(error);
      setLoading(false);
    });
  }, [user]);

  const completedSessions = useMemo(() => {
    return sessions.filter((session) => session.status === "completed");
  }, [sessions]);

  const totalAttempts = useMemo(() => {
    return completedSessions.reduce((sum, session) => {
      return (
        sum +
        (session.results || []).reduce(
          (innerSum, result) => innerSum + result.attempts.length,
          0
        )
      );
    }, 0);
  }, [completedSessions]);

  const overallAverage = useMemo(() => {
    if (completedSessions.length === 0) return 0;

    return (
      completedSessions.reduce((sum, session) => sum + getSessionAverage(session), 0) /
      completedSessions.length
    );
  }, [completedSessions]);

  const bestSession = useMemo(() => {
    return completedSessions
      .map((session) => ({
        ...session,
        average: getSessionAverage(session),
      }))
      .sort((a, b) => b.average - a.average)[0];
  }, [completedSessions]);

  const lastSessions = useMemo(() => {
    return completedSessions
      .map((session) => ({
        ...session,
        average: getSessionAverage(session),
      }))
      .sort(
        (a, b) =>
          (a.finishedAt?.seconds || a.updatedAt?.seconds || 0) -
          (b.finishedAt?.seconds || b.updatedAt?.seconds || 0)
      )
      .slice(-10);
  }, [completedSessions]);

  const exerciseSummary = useMemo(() => {
    const summary: Record<
      string,
      {
        exerciseId: string;
        attempts: number;
        sessions: number;
        totalPercentage: number;
        best: number;
      }
    > = {};

    completedSessions.forEach((session) => {
      (session.results || []).forEach((result) => {
        if (result.attempts.length === 0) return;

        if (!summary[result.exerciseId]) {
          summary[result.exerciseId] = {
            exerciseId: result.exerciseId,
            attempts: 0,
            sessions: 0,
            totalPercentage: 0,
            best: 0,
          };
        }

        summary[result.exerciseId].attempts += result.attempts.length;
        summary[result.exerciseId].sessions += 1;
        summary[result.exerciseId].totalPercentage += result.percentage || 0;
        summary[result.exerciseId].best = Math.max(summary[result.exerciseId].best, result.best || 0);
      });
    });

    return Object.values(summary).map((item) => ({
      ...item,
      averagePercentage: item.sessions > 0 ? item.totalPercentage / item.sessions : 0,
    }));
  }, [completedSessions]);

  const topExercises = useMemo(() => {
    return [...exerciseSummary]
      .sort((a, b) => b.averagePercentage - a.averagePercentage)
      .slice(0, 3);
  }, [exerciseSummary]);

  const weakExercises = useMemo(() => {
    return [...exerciseSummary]
      .sort((a, b) => a.averagePercentage - b.averagePercentage)
      .slice(0, 3);
  }, [exerciseSummary]);

  return (
    <LoginRequired>
      {loading ? (
        <p>Ładowanie dashboardu...</p>
      ) : (
        <section className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow">
            <h1 className="text-3xl font-black">Dashboard zawodnika</h1>
            <p className="mt-2 text-slate-600">
              Szybki przegląd progresu, ostatnich sesji i najmocniejszych/najsłabszych ćwiczeń.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Zakończone sesje</p>
              <p className="text-3xl font-black">{completedSessions.length}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Średnia skuteczność</p>
              <p className="text-3xl font-black">{overallAverage.toFixed(1)}%</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Wszystkie próby</p>
              <p className="text-3xl font-black">{totalAttempts}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Najlepsza sesja</p>
              <p className="text-3xl font-black">
                {bestSession ? `${bestSession.average.toFixed(0)}%` : "-"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-xl font-bold">Progres ostatnich sesji</h2>
              <Link href="/stats" className="text-sm font-bold text-orange-700 underline">
                Pełne statystyki
              </Link>
            </div>

            {lastSessions.length === 0 ? (
              <p className="text-slate-600">Brak zakończonych sesji do wykresu.</p>
            ) : (
              <>
                <div className="flex h-64 items-end gap-3 rounded-xl bg-slate-50 p-4">
                  {lastSessions.map((session, index) => (
                    <div
                      key={`${session.id}-${index}`}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                    >
                      <div className="text-xs font-bold text-slate-700">
                        {session.average.toFixed(0)}%
                      </div>

                      <div
                        className="w-full rounded-t-lg bg-orange-600"
                        style={{
                          height: `${Math.max(4, clamp(session.average))}%`,
                        }}
                        title={`${session.programName || "Trening"}: ${session.average.toFixed(1)}%`}
                      />
                    </div>
                  ))}
                </div>

                <div
                  className="mt-2 grid gap-2 text-xs text-slate-500"
                  style={{
                    gridTemplateColumns: `repeat(${lastSessions.length}, minmax(0, 1fr))`,
                  }}
                >
                  {lastSessions.map((session, index) => (
                    <div
                      key={`${session.id}-label-${index}`}
                      className="truncate text-center"
                      title={formatDate(session.finishedAt || session.updatedAt)}
                    >
                      #{index + 1}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-bold">Najmocniejsze ćwiczenia</h2>

              {topExercises.length === 0 ? (
                <p className="text-slate-600">Brak danych.</p>
              ) : (
                <div className="space-y-3">
                  {topExercises.map((exercise, index) => (
                    <div key={exercise.exerciseId} className="rounded-xl bg-green-50 p-4">
                      <p className="font-black">
                        {index + 1}. {exerciseNames[exercise.exerciseId] || "Ćwiczenie"}
                      </p>
                      <p className="text-sm text-green-800">
                        Średnio: {exercise.averagePercentage.toFixed(1)}% · Próby:{" "}
                        {exercise.attempts}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-bold">Do poprawy</h2>

              {weakExercises.length === 0 ? (
                <p className="text-slate-600">Brak danych.</p>
              ) : (
                <div className="space-y-3">
                  {weakExercises.map((exercise, index) => (
                    <div key={exercise.exerciseId} className="rounded-xl bg-red-50 p-4">
                      <p className="font-black">
                        {index + 1}. {exerciseNames[exercise.exerciseId] || "Ćwiczenie"}
                      </p>
                      <p className="text-sm text-red-800">
                        Średnio: {exercise.averagePercentage.toFixed(1)}% · Próby:{" "}
                        {exercise.attempts}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </LoginRequired>
  );
}
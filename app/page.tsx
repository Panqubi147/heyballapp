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
  userId?: string;
  programId: string;
  programName?: string;
  status?: "inProgress" | "completed" | "abandoned";
  currentExerciseIndex?: number;
  startedAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  finishedAt?: FirestoreTimestamp;
  sessionAveragePercentage?: number;
  results?: TrainingSessionResult[];
};

type ExerciseDoc = {
  id: string;
  name: string;
  category?: string;
  difficulty?: number;
  isGlobal?: boolean;
};

const categoryLabels: Record<string, string> = {
  potting: "Wbijanie",
  jumps: "Skoki",
  safety: "Bezpieczne",
  technique: "Technika",
  break: "Rozbicia",
  doubles: "Duble",
  masse: "Masse",
  position: "Pozycjonowanie",
  "position-play": "Pozycja",
  "break-building": "Budowanie breaka",
};

const WEEKLY_GOAL = 3;

function formatDate(timestamp?: FirestoreTimestamp) {
  if (!timestamp?.seconds) return "-";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp.seconds * 1000));
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getSessionDate(session: TrainingSessionDoc) {
  const seconds =
    session.finishedAt?.seconds ||
    session.updatedAt?.seconds ||
    session.startedAt?.seconds;

  return seconds ? new Date(seconds * 1000) : null;
}

function getSessionAverage(session: TrainingSessionDoc) {
  if (typeof session.sessionAveragePercentage === "number") {
    return session.sessionAveragePercentage;
  }

  const attempted = (session.results || []).filter((result) => result.attempts.length > 0);
  if (attempted.length === 0) return 0;

  return attempted.reduce((sum, result) => sum + (result.percentage || 0), 0) / attempted.length;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diff);
  return start;
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Dzień dobry";
  if (hour < 18) return "Dobrego popołudnia";
  return "Dobry wieczór";
}

export default function HomePage() {
  const { user, role } = useAuth();

  const [sessions, setSessions] = useState<TrainingSessionDoc[]>([]);
  const [exercises, setExercises] = useState<ExerciseDoc[]>([]);
  const [programCount, setProgramCount] = useState(0);
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

    const ownExercisesSnapshot = await getDocs(
      query(collection(db, "exercises"), where("userId", "==", user.uid))
    );

    let globalExercises: ExerciseDoc[] = [];

    try {
      const globalExercisesSnapshot = await getDocs(
        query(collection(db, "exercises"), where("isGlobal", "==", true))
      );

      globalExercises = globalExercisesSnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })) as ExerciseDoc[];
    } catch (error) {
      console.error("Nie udało się pobrać globalnych ćwiczeń:", error);
    }

    const ownExercises = ownExercisesSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as ExerciseDoc[];

    const allExercises = [
      ...ownExercises,
      ...globalExercises.filter(
        (globalExercise) =>
          !ownExercises.some((ownExercise) => ownExercise.id === globalExercise.id)
      ),
    ];

    const programsSnapshot = await getDocs(
      query(collection(db, "trainingPrograms"), where("userId", "==", user.uid))
    );

    setSessions(loadedSessions);
    setExercises(allExercises);
    setProgramCount(programsSnapshot.size);
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

  const inProgressSession = useMemo(() => {
    return sessions
      .filter((session) => session.status === "inProgress")
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))[0];
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

  const exerciseNames = useMemo(() => {
    const names: Record<string, string> = {};

    exercises.forEach((exercise) => {
      names[exercise.id] = exercise.name;
    });

    return names;
  }, [exercises]);

  const categorySummary = useMemo(() => {
    const summary: Record<string, { category: string; total: number; count: number }> = {};

    completedSessions.forEach((session) => {
      (session.results || []).forEach((result) => {
        if (result.attempts.length === 0) return;

        const exercise = exercises.find((item) => item.id === result.exerciseId);
        const category = exercise?.category || "unknown";

        if (!summary[category]) {
          summary[category] = {
            category,
            total: 0,
            count: 0,
          };
        }

        summary[category].total += result.percentage || 0;
        summary[category].count += 1;
      });
    });

    return Object.values(summary)
      .map((item) => ({
        ...item,
        average: item.count > 0 ? item.total / item.count : 0,
      }))
      .sort((a, b) => b.average - a.average);
  }, [completedSessions, exercises]);

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

  const lastCompletedSession = useMemo(() => {
    return [...completedSessions].sort(
      (a, b) =>
        (b.finishedAt?.seconds || b.updatedAt?.seconds || 0) -
        (a.finishedAt?.seconds || a.updatedAt?.seconds || 0)
    )[0];
  }, [completedSessions]);

  const weeklyCompletedSessions = useMemo(() => {
    const weekStart = getWeekStart();

    return completedSessions.filter((session) => {
      const date = getSessionDate(session);
      return date && date >= weekStart;
    });
  }, [completedSessions]);

  const weeklyProgress = Math.min(100, (weeklyCompletedSessions.length / WEEKLY_GOAL) * 100);

  const heatmapDays = useMemo(() => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const counts: Record<string, number> = {};

    completedSessions.forEach((session) => {
      const date = getSessionDate(session);
      if (!date) return;

      const key = getDateKey(date);
      counts[key] = (counts[key] || 0) + 1;
    });

    for (let i = 27; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);

      const key = getDateKey(date);
      days.push({
        key,
        label: new Intl.DateTimeFormat("pl-PL", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }).format(date),
        count: counts[key] || 0,
      });
    }

    return days;
  }, [completedSessions]);

  const activityFeed = useMemo(() => {
    const items = completedSessions
      .map((session) => ({
        id: session.id,
        programId: session.programId,
        date: getSessionDate(session),
        title: `Ukończono trening "${session.programName || "Trening"}"`,
        subtitle: `Średnia skuteczność: ${getSessionAverage(session).toFixed(1)}%`,
      }))
      .filter((item) => item.date)
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
      .slice(0, 5);

    return items;
  }, [completedSessions]);

  const focusCategory = weakExercises[0]?.exerciseId
    ? exercises.find((exercise) => exercise.id === weakExercises[0].exerciseId)?.category
    : categorySummary[categorySummary.length - 1]?.category;

  return (
    <LoginRequired>
      {loading ? (
        <p>Ładowanie dashboardu...</p>
      ) : (
        <section className="space-y-6">
          <div className="rounded-2xl bg-slate-900 p-6 text-white shadow">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-orange-300">{getGreeting()} 👋</p>
                <h1 className="mt-1 text-3xl font-black">Gotowa na dzisiejszy trening?</h1>
                <p className="mt-2 max-w-2xl text-slate-300">
                  Śledź progres, kontynuuj sesje i pracuj nad kategoriami, które najbardziej
                  potrzebują powtórek.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/programs"
                  className="rounded bg-orange-600 px-5 py-3 text-center font-bold text-white hover:bg-orange-500"
                >
                  Zacznij trening
                </Link>

                {role === "coach" && (
                  <Link
                    href="/coach"
                    className="rounded bg-white px-5 py-3 text-center font-bold text-slate-900 hover:bg-slate-100"
                  >
                    Panel trenera
                  </Link>
                )}
              </div>
            </div>
          </div>

          {inProgressSession && (
            <div className="rounded-2xl bg-orange-100 p-6 shadow">
              <h2 className="text-xl font-black text-orange-900">
                Masz niedokończony trening
              </h2>
              <p className="mt-2 text-orange-800">
                {inProgressSession.programName || "Trening w toku"} · ostatnia aktualizacja:{" "}
                {formatDate(inProgressSession.updatedAt)}
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
  <p className="text-sm text-slate-500">Próby</p>
  <p className="text-3xl font-black">{totalAttempts}</p>
</div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Treningi</p>
              <p className="text-3xl font-black">{programCount}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Sesje</p>
              <p className="text-3xl font-black">{completedSessions.length}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Średnia</p>
              <p className="text-3xl font-black">{overallAverage.toFixed(0)}%</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Najlepsza</p>
              <p className="text-3xl font-black">
                {bestSession ? `${bestSession.average.toFixed(0)}%` : "-"}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="text-xl font-bold">Cel tygodnia</h2>
              <p className="mt-1 text-sm text-slate-500">
                Automatyczny cel: {WEEKLY_GOAL} zakończone treningi w tygodniu.
              </p>

              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="text-4xl font-black">
                    {weeklyCompletedSessions.length}/{WEEKLY_GOAL}
                  </p>
                  <p className="text-sm text-slate-600">treningi ukończone</p>
                </div>

                <Link
                  href="/programs"
                  className="rounded bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-500"
                >
                  Zrób trening
                </Link>
              </div>

              <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-orange-600"
                  style={{ width: `${weeklyProgress}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="text-xl font-bold">Dzisiejszy fokus</h2>

              {focusCategory ? (
                <>
                  <p className="mt-2 text-slate-600">
                    Na podstawie wyników warto dziś poćwiczyć:
                  </p>
                  <p className="mt-3 text-2xl font-black text-orange-700">
                    {categoryLabels[focusCategory] || focusCategory}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href="/exercises"
                      className="rounded bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                    >
                      Przejdź do ćwiczeń
                    </Link>
                    <Link
                      href="/programs"
                      className="rounded bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-500"
                    >
                      Stwórz trening
                    </Link>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-slate-600">
                  Zakończ kilka sesji, a aplikacja pokaże Ci priorytet treningowy.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="text-xl font-bold">Heatmap treningów</h2>
              <p className="mt-1 text-sm text-slate-500">
                Ostatnie 28 dni aktywności treningowej
              </p>

              <div className="mt-5 grid grid-cols-7 gap-2">
  {heatmapDays.map((day) => (
    <div
      key={day.key}
      title={`${day.label}: ${day.count} treningów`}
      className={`rounded-lg border p-2 text-center text-xs ${
        day.count === 0
          ? "bg-slate-100 text-slate-500"
          : day.count === 1
            ? "bg-orange-200 text-orange-900"
            : day.count === 2
              ? "bg-orange-400 text-white"
              : "bg-orange-600 text-white"
      }`}
    >
      <div className="font-bold">
        {new Date(day.key).toLocaleDateString("pl-PL", { weekday: "short" })}
      </div>

      <div>
        {new Date(day.key).toLocaleDateString("pl-PL", {
          day: "2-digit",
          month: "2-digit",
        })}
      </div>

      <div className="mt-1 text-[10px] font-bold">
        {day.count > 0 ? `${day.count}x` : "-"}
      </div>
    </div>
  ))}
</div>

              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <span>Mniej</span>
                <span className="h-3 w-3 rounded bg-slate-100" />
                <span className="h-3 w-3 rounded bg-orange-200" />
                <span className="h-3 w-3 rounded bg-orange-400" />
                <span className="h-3 w-3 rounded bg-orange-600" />
                <span>Więcej</span>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="text-xl font-bold">Ostatnie aktywności</h2>

              {activityFeed.length === 0 ? (
                <p className="mt-4 text-slate-600">Brak aktywności do pokazania.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {activityFeed.map((item) => (
  <div key={item.id} className="rounded-xl bg-slate-50 p-4">
    <p className="font-bold">{item.title}</p>

    <p className="text-sm text-slate-600">{item.subtitle}</p>

    <p className="mt-1 text-xs text-slate-400">
      {item.date
        ? new Intl.DateTimeFormat("pl-PL", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(item.date)
        : "-"}
    </p>

    <Link
      href={`/practice/${item.programId}`}
      className="mt-4 inline-block rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-500"
    >
      Powtórz trening
    </Link>
  </div>
))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold">Progres ostatnich sesji</h2>
                  <p className="text-sm text-slate-500">
                    Ostatnie 10 zakończonych treningów
                  </p>
                </div>

                <Link href="/stats" className="text-sm font-bold text-orange-700 underline">
                  Pełne statystyki
                </Link>
              </div>

              {lastSessions.length === 0 ? (
                <p className="text-slate-600">Brak zakończonych sesji do wykresu.</p>
              ) : (
                <>
                  <div className="flex h-72 items-end gap-3 rounded-xl bg-slate-50 p-4">
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
                    {lastSessions.map((_, index) => (
                      <div key={index} className="truncate text-center">
                        #{index + 1}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="text-xl font-bold">Profil umiejętności</h2>
              <p className="mt-1 text-sm text-slate-500">
                Średnia skuteczność według kategorii
              </p>

              {categorySummary.length === 0 ? (
                <p className="mt-4 text-slate-600">Brak danych kategorii.</p>
              ) : (
                <div className="mt-5 space-y-4">
                  {categorySummary.map((item) => (
                    <div key={item.category}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-bold">
                          {categoryLabels[item.category] || item.category}
                        </span>
                        <span>{item.average.toFixed(0)}%</span>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-orange-600"
                          style={{ width: `${clamp(item.average)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-bold">Szybkie akcje</h2>

              <div className="grid gap-3">
                <Link
                  href="/editor"
                  className="rounded-xl bg-slate-800 px-4 py-3 font-bold text-white hover:bg-slate-700"
                >
                  + Nowe ćwiczenie
                </Link>

                <Link
                  href="/programs"
                  className="rounded-xl bg-orange-600 px-4 py-3 font-bold text-white hover:bg-orange-500"
                >
                  Stwórz trening
                </Link>

                <Link
                  href="/exercises"
                  className="rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-800 hover:bg-slate-200"
                >
                  Baza ćwiczeń
                </Link>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-bold">Najmocniejsze</h2>

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

          {lastCompletedSession && (
            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="text-xl font-bold">Ostatnia zakończona sesja</h2>
              <p className="mt-2 text-slate-600">
                {lastCompletedSession.programName || "Trening"} ·{" "}
                {formatDate(lastCompletedSession.finishedAt || lastCompletedSession.updatedAt)}
              </p>
              <p className="mt-1 font-bold text-orange-700">
                Wynik: {getSessionAverage(lastCompletedSession).toFixed(1)}%
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Próby łącznie: {totalAttempts}
              </p>
            </div>
          )}

<Link
  href="/reflections"
  className="fixed bottom-6 right-6 z-50 rounded-full bg-orange-600 px-5 py-4 font-black text-white shadow-xl hover:bg-orange-500"
>
  💭 Przemyślenia
</Link>

        </section>
      )}
    </LoginRequired>
  );
}
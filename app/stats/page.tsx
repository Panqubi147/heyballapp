"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";

type TrainingSessionResult = {
  exerciseId: string;
  attempts: number[];
  average: number;
  best: number;
  maxScore: number;
  percentage: number;
};

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

type TrainingSessionDoc = {
  id: string;
  userId?: string;
  programId: string;
  programName?: string;
  status?: "inProgress" | "completed" | "abandoned";
  currentExerciseIndex?: number;
  startedAt?: FirestoreTimestamp;
  finishedAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
  sessionAveragePercentage?: number;
  results: TrainingSessionResult[];
};

type ExerciseNameMap = Record<string, string>;

type StatsTab = "sessions" | "exercises";
type ExerciseRange = "all" | "month" | "week";

function timestampToDate(timestamp?: FirestoreTimestamp) {
  if (!timestamp?.seconds) return null;
  return new Date(timestamp.seconds * 1000);
}

function formatDate(timestamp?: FirestoreTimestamp) {
  const date = timestampToDate(timestamp);
  if (!date) return "-";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getSessionAverage(session: TrainingSessionDoc) {
  if (typeof session.sessionAveragePercentage === "number") {
    return session.sessionAveragePercentage;
  }

  const attempted = session.results.filter((result) => result.attempts.length > 0);
  if (attempted.length === 0) return 0;

  return (
    attempted.reduce((sum, result) => sum + (result.percentage || 0), 0) /
    attempted.length
  );
}

function getRangeStart(range: ExerciseRange) {
  const now = new Date();

  if (range === "week") {
    const date = new Date(now);
    date.setDate(date.getDate() - 7);
    return date;
  }

  if (range === "month") {
    const date = new Date(now);
    date.setMonth(date.getMonth() - 1);
    return date;
  }

  return null;
}

function clampPercentage(value: number) {
  return Math.max(0, Math.min(100, value));
}

export default function StatsPage() {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<TrainingSessionDoc[]>([]);
  const [exerciseNames, setExerciseNames] = useState<ExerciseNameMap>({});
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<StatsTab>("sessions");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "inProgress" | "abandoned">("all");
  const [exerciseRange, setExerciseRange] = useState<ExerciseRange>("all");
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>("all");

  async function loadStats() {
    if (!user) {
      setLoading(false);
      return;
    }

    const sessionsSnapshot = await getDocs(
      query(
        collection(db, "trainingSessions"),
        where("userId", "==", user.uid)
      )
    );
    
    const loadedSessions = sessionsSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as TrainingSessionDoc[];
    
    loadedSessions.sort((a, b) => {
      const dateA = a.updatedAt?.seconds || 0;
      const dateB = b.updatedAt?.seconds || 0;
      return dateB - dateA;
    });

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
    loadStats().catch((error) => {
      console.error(error);
      setLoading(false);
    });
  }, [user]);

  const completedSessions = useMemo(() => {
    return sessions.filter((session) => session.status === "completed");
  }, [sessions]);

  const inProgressSessions = useMemo(() => {
    return sessions.filter((session) => session.status === "inProgress");
  }, [sessions]);

  const abandonedSessions = useMemo(() => {
    return sessions.filter((session) => session.status === "abandoned");
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    if (statusFilter === "all") return sessions;
    return sessions.filter((session) => session.status === statusFilter);
  }, [sessions, statusFilter]);

  const overallAverage = useMemo(() => {
    if (completedSessions.length === 0) return 0;

    return (
      completedSessions.reduce((sum, session) => sum + getSessionAverage(session), 0) /
      completedSessions.length
    );
  }, [completedSessions]);

  const totalAttempts = useMemo(() => {
    return sessions.reduce((sum, session) => {
      return (
        sum +
        session.results.reduce((innerSum, result) => innerSum + result.attempts.length, 0)
      );
    }, 0);
  }, [sessions]);

  const sessionProgress = useMemo(() => {
    return completedSessions
      .map((session) => ({
        id: session.id,
        label: formatDate(session.finishedAt || session.updatedAt || session.startedAt),
        value: getSessionAverage(session),
        programName: session.programName || "Trening",
      }))
      .reverse()
      .slice(-12);
  }, [completedSessions]);

  const exerciseOptions = useMemo(() => {
    const ids = new Set<string>();

    sessions.forEach((session) => {
      session.results.forEach((result) => ids.add(result.exerciseId));
    });

    return Array.from(ids).sort((a, b) => {
      const nameA = exerciseNames[a] || a;
      const nameB = exerciseNames[b] || b;
      return nameA.localeCompare(nameB, "pl");
    });
  }, [sessions, exerciseNames]);

  const exerciseSummary = useMemo(() => {
    const rangeStart = getRangeStart(exerciseRange);
    const summary: Record<
      string,
      {
        exerciseId: string;
        sessionsCount: number;
        attemptsCount: number;
        totalScore: number;
        totalMaxScore: number;
        best: number;
        bestPercentage: number;
        attempts: number[];
        sessionAverages: { date?: FirestoreTimestamp; percentage: number; average: number; attempts: number[] }[];
        lastDate?: FirestoreTimestamp;
      }
    > = {};

    sessions
      .filter((session) => session.status === "completed")
      .forEach((session) => {
        const sessionDate = timestampToDate(session.finishedAt || session.updatedAt || session.startedAt);

        if (rangeStart && sessionDate && sessionDate < rangeStart) return;
        if (rangeStart && !sessionDate) return;

        session.results.forEach((result) => {
          if (result.attempts.length === 0) return;

          if (selectedExerciseId !== "all" && result.exerciseId !== selectedExerciseId) {
            return;
          }

          if (!summary[result.exerciseId]) {
            summary[result.exerciseId] = {
              exerciseId: result.exerciseId,
              sessionsCount: 0,
              attemptsCount: 0,
              totalScore: 0,
              totalMaxScore: 0,
              best: 0,
              bestPercentage: 0,
              attempts: [],
              sessionAverages: [],
              lastDate: session.finishedAt || session.updatedAt || session.startedAt,
            };
          }

          const item = summary[result.exerciseId];
          const maxScore = result.maxScore || 1;

          item.sessionsCount += 1;
          item.attemptsCount += result.attempts.length;
          item.totalScore += result.attempts.reduce((sum, score) => sum + score, 0);
          item.totalMaxScore += result.attempts.length * maxScore;
          item.best = Math.max(item.best, result.best || 0);
          item.bestPercentage = Math.max(item.bestPercentage, ((result.best || 0) / maxScore) * 100);
          item.attempts.push(...result.attempts);
          item.sessionAverages.push({
            date: session.finishedAt || session.updatedAt || session.startedAt,
            percentage: result.percentage || 0,
            average: result.average || 0,
            attempts: result.attempts,
          });

          const currentLast = timestampToDate(item.lastDate);
          const nextLast = timestampToDate(session.finishedAt || session.updatedAt || session.startedAt);

          if (!currentLast || (nextLast && nextLast > currentLast)) {
            item.lastDate = session.finishedAt || session.updatedAt || session.startedAt;
          }
        });
      });

    return Object.values(summary)
      .map((item) => {
        const averageScore =
          item.attemptsCount > 0 ? item.totalScore / item.attemptsCount : 0;

        const averagePercentage =
          item.totalMaxScore > 0 ? (item.totalScore / item.totalMaxScore) * 100 : 0;

        const sortedProgress = item.sessionAverages
          .sort((a, b) => {
            const dateA = timestampToDate(a.date)?.getTime() || 0;
            const dateB = timestampToDate(b.date)?.getTime() || 0;
            return dateA - dateB;
          })
          .slice(-10);

        return {
          ...item,
          averageScore,
          averagePercentage,
          sortedProgress,
        };
      })
      .sort((a, b) => b.averagePercentage - a.averagePercentage);
  }, [sessions, exerciseRange, selectedExerciseId]);

  async function deleteSession(session: TrainingSessionDoc) {
    const confirmed = confirm("Usunąć tę sesję ze statystyk?");
    if (!confirmed) return;

    await deleteDoc(doc(db, "trainingSessions", session.id));
    setSessions((prev) => prev.filter((item) => item.id !== session.id));
  }

  return (
    <LoginRequired>
      {loading ? (
        <p>Ładowanie statystyk...</p>
      ) : (
        <section className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow">
            <h1 className="text-2xl font-bold">Statystyki</h1>
            <p className="mt-2 text-slate-600">
              Historia sesji, zbiorcze wyniki ćwiczeń oraz progres.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Wszystkie sesje</p>
              <p className="text-3xl font-black">{sessions.length}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Zakończone</p>
              <p className="text-3xl font-black">{completedSessions.length}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">W toku / porzucone</p>
              <p className="text-3xl font-black">{inProgressSessions.length} / {abandonedSessions.length}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Średnia skuteczność</p>
              <p className="text-3xl font-black">{overallAverage.toFixed(1)}%</p>
              <p className="mt-1 text-xs text-slate-500">Próby łącznie: {totalAttempts}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-2 shadow">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveTab("sessions")}
                className={`rounded-xl px-4 py-3 font-bold ${
                  activeTab === "sessions"
                    ? "bg-orange-600 text-white"
                    : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                }`}
              >
                Po sesjach
              </button>

              <button
                onClick={() => setActiveTab("exercises")}
                className={`rounded-xl px-4 py-3 font-bold ${
                  activeTab === "exercises"
                    ? "bg-orange-600 text-white"
                    : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                }`}
              >
                Po ćwiczeniach
              </button>
            </div>
          </div>

          {activeTab === "sessions" && (
            <>
              <div className="rounded-2xl bg-white p-6 shadow">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-xl font-bold">Progres sesji</h2>

                  <select
                    className="rounded border p-3"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as "all" | "completed" | "inProgress" | "abandoned")
                    }
                  >
                    <option value="all">Wszystkie</option>
                    <option value="completed">Tylko zakończone</option>
                    <option value="inProgress">Tylko w toku</option>
                    <option value="abandoned">Tylko porzucone</option>
                  </select>
                </div>

                {sessionProgress.length === 0 ? (
                  <p className="mt-4 text-slate-600">Brak zakończonych sesji do wykresu.</p>
                ) : (
                  <div className="mt-6">
                    <div className="flex h-64 items-end gap-3 rounded-xl bg-slate-50 p-4">
                      {sessionProgress.map((point, index) => (
                        <div key={`${point.id}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                          <div className="text-xs font-bold text-slate-700">
                            {point.value.toFixed(0)}%
                          </div>
                          <div
                            className="w-full rounded-t-lg bg-orange-600"
                            style={{ height: `${Math.max(4, clampPercentage(point.value))}%` }}
                            title={`${point.programName}: ${point.value.toFixed(1)}%`}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 grid gap-2 text-xs text-slate-500" style={{ gridTemplateColumns: `repeat(${sessionProgress.length}, minmax(0, 1fr))` }}>
                      {sessionProgress.map((point, index) => (
                        <div key={`${point.id}-label-${index}`} className="truncate text-center" title={point.label}>
                          #{index + 1}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {filteredSessions.length === 0 ? (
                <div className="rounded-2xl bg-white p-6 shadow">
                  Brak sesji do pokazania.
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredSessions.map((session) => {
                    const average = getSessionAverage(session);
                    const status = session.status || "inProgress";
                    const sessionAttempts = session.results.reduce(
                      (sum, result) => sum + result.attempts.length,
                      0
                    );

                    return (
                      <article key={session.id} className="rounded-2xl bg-white p-6 shadow">
                        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <h2 className="text-xl font-bold">
                              {session.programName || "Trening"}
                            </h2>

                            <p className="mt-1 text-sm text-slate-600">
                              Status:{" "}
                              <span
                                className={
                                  status === "completed"
                                    ? "font-bold text-green-700"
                                    : status === "abandoned"
                                      ? "font-bold text-slate-600"
                                      : "font-bold text-orange-700"
                                }
                              >
                                {status === "completed"
                                  ? "Zakończona"
                                  : status === "abandoned"
                                    ? "Porzucona"
                                    : "W toku"}
                              </span>
                              {" · "}
                              Start: {formatDate(session.startedAt)}
                              {" · "}
                              Aktualizacja: {formatDate(session.updatedAt)}
                            </p>

                            {session.finishedAt && (
                              <p className="mt-1 text-sm text-slate-600">
                                Zakończono: {formatDate(session.finishedAt)}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col gap-2 text-right">
                            <div className="rounded-xl bg-slate-100 px-4 py-3">
                              <p className="text-xs text-slate-500">Średnia sesji</p>
                              <p className="text-2xl font-black">{average.toFixed(1)}%</p>
                            </div>

                            <button
                              onClick={() => deleteSession(session)}
                              className="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500"
                            >
                              Usuń sesję
                            </button>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[700px] border-collapse text-left">
                            <thead>
                              <tr className="border-b bg-slate-50 text-sm">
                                <th className="p-3">Ćwiczenie</th>
                                <th className="p-3">Próby</th>
                                <th className="p-3">Średnia</th>
                                <th className="p-3">Best</th>
                                <th className="p-3">Max</th>
                                <th className="p-3">%</th>
                              </tr>
                            </thead>

                            <tbody>
                              {session.results.map((result, index) => (
                                <tr key={`${session.id}-${result.exerciseId}-${index}`} className="border-b">
                                  <td className="p-3 font-bold">
                                    {exerciseNames[result.exerciseId] || `Ćwiczenie ${index + 1}`}
                                  </td>

                                  <td className="p-3">
                                    {result.attempts.length > 0 ? result.attempts.join(", ") : "-"}
                                  </td>

                                  <td className="p-3">
                                    {result.attempts.length > 0 ? result.average.toFixed(1) : "-"}
                                  </td>

                                  <td className="p-3">
                                    {result.attempts.length > 0 ? result.best : "-"}
                                  </td>

                                  <td className="p-3">{result.maxScore}</td>

                                  <td className="p-3 font-bold">
                                    {result.attempts.length > 0
                                      ? `${result.percentage.toFixed(1)}%`
                                      : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <p className="mt-4 text-sm text-slate-500">
                          Liczba prób w sesji: {sessionAttempts}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === "exercises" && (
            <>
              <div className="rounded-2xl bg-white p-6 shadow">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-bold text-slate-700">
                      Zakres czasu
                    </label>
                    <select
                      className="w-full rounded border p-3"
                      value={exerciseRange}
                      onChange={(event) => setExerciseRange(event.target.value as ExerciseRange)}
                    >
                      <option value="all">All time</option>
                      <option value="month">Ostatni miesiąc</option>
                      <option value="week">Ostatni tydzień</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-bold text-slate-700">
                      Ćwiczenie
                    </label>
                    <select
                      className="w-full rounded border p-3"
                      value={selectedExerciseId}
                      onChange={(event) => setSelectedExerciseId(event.target.value)}
                    >
                      <option value="all">Wszystkie ćwiczenia</option>
                      {exerciseOptions.map((exerciseId) => (
                        <option key={exerciseId} value={exerciseId}>
                          {exerciseNames[exerciseId] || exerciseId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {exerciseSummary.length === 0 ? (
                <div className="rounded-2xl bg-white p-6 shadow">
                  Brak wyników ćwiczeń w wybranym zakresie.
                </div>
              ) : (
                <div className="grid gap-6">
                  {exerciseSummary.map((item) => (
                    <article key={item.exerciseId} className="rounded-2xl bg-white p-6 shadow">
                      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h2 className="text-xl font-bold">
                            {exerciseNames[item.exerciseId] || "Ćwiczenie"}
                          </h2>
                          <p className="mt-1 text-sm text-slate-600">
                            Ostatni wynik: {formatDate(item.lastDate)}
                          </p>
                        </div>

                        <div className="rounded-xl bg-orange-100 px-4 py-3 text-right">
                          <p className="text-xs text-orange-700">Średnia skuteczność</p>
                          <p className="text-2xl font-black text-orange-800">
                            {item.averagePercentage.toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-5">
                        <div className="rounded-xl bg-slate-100 p-4">
                          <p className="text-sm text-slate-500">Sesje</p>
                          <p className="text-2xl font-black">{item.sessionsCount}</p>
                        </div>

                        <div className="rounded-xl bg-slate-100 p-4">
                          <p className="text-sm text-slate-500">Próby</p>
                          <p className="text-2xl font-black">{item.attemptsCount}</p>
                        </div>

                        <div className="rounded-xl bg-slate-100 p-4">
                          <p className="text-sm text-slate-500">Średni wynik</p>
                          <p className="text-2xl font-black">{item.averageScore.toFixed(1)}</p>
                        </div>

                        <div className="rounded-xl bg-slate-100 p-4">
                          <p className="text-sm text-slate-500">Best</p>
                          <p className="text-2xl font-black">{item.best}</p>
                        </div>

                        <div className="rounded-xl bg-slate-100 p-4">
                          <p className="text-sm text-slate-500">Best %</p>
                          <p className="text-2xl font-black">{item.bestPercentage.toFixed(0)}%</p>
                        </div>
                      </div>

                      <div className="mt-6 rounded-xl bg-slate-50 p-4">
                        <p className="mb-3 text-sm font-bold text-slate-700">
                          Progres ostatnich sesji tego ćwiczenia
                        </p>

                        {item.sortedProgress.length === 0 ? (
                          <p className="text-sm text-slate-600">Brak danych do wykresu.</p>
                        ) : (
                          <>
                            <div className="flex h-52 items-end gap-3 rounded-xl bg-white p-4">
                              {item.sortedProgress.map((point, index) => (
                                <div key={`${item.exerciseId}-progress-${index}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                                  <div className="text-xs font-bold text-slate-700">
                                    {point.percentage.toFixed(0)}%
                                  </div>
                                  <div
                                    className="w-full rounded-t-lg bg-green-700"
                                    style={{ height: `${Math.max(4, clampPercentage(point.percentage))}%` }}
                                    title={`${formatDate(point.date)}: ${point.percentage.toFixed(1)}%`}
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="mt-2 grid gap-2 text-xs text-slate-500" style={{ gridTemplateColumns: `repeat(${item.sortedProgress.length}, minmax(0, 1fr))` }}>
                              {item.sortedProgress.map((_, index) => (
                                <div key={`${item.exerciseId}-label-${index}`} className="truncate text-center">
                                  #{index + 1}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="mt-4 rounded-xl bg-slate-50 p-4">
                        <p className="mb-2 text-sm font-bold text-slate-700">
                          Wszystkie próby w zakresie:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {item.attempts.map((attempt, index) => (
                            <span
                              key={`${item.exerciseId}-${index}`}
                              className="rounded bg-white px-3 py-2 text-sm font-bold shadow-sm"
                            >
                              {attempt}
                            </span>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </LoginRequired>
  );
}


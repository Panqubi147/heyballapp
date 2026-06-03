"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { Exercise, TrainingProgram } from "@/types";
import { PoolTable } from "@/components/PoolTable";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";

type SessionResult = {
  exerciseId: string;
  attempts: number[];
  average: number;
  best: number;
  maxScore: number;
  percentage: number;
};

type TrainingSessionDoc = {
  id: string;
  userId: string;
  programId: string;
  programName?: string;
  status?: "inProgress" | "completed" | "abandoned";
  currentExerciseIndex?: number;
  startedAt?: unknown;
  updatedAt?: unknown;
  finishedAt?: unknown;
  results?: SessionResult[];
  sessionAveragePercentage?: number;
};

type ResumeChoice = "checking" | "choose" | "practice";

function getExerciseMaxScore(exercise: Exercise) {
  if (exercise.scoreMode === "manual") {
    return exercise.maxScore && exercise.maxScore > 0 ? exercise.maxScore : 10;
  }

  return Math.max(1, exercise.balls.filter((ball) => ball.number !== 0).length);
}

function calculateResult(exercise: Exercise, attempts: number[]): SessionResult {
  const maxScore = getExerciseMaxScore(exercise);
  const average =
    attempts.length > 0
      ? attempts.reduce((sum, score) => sum + score, 0) / attempts.length
      : 0;

  const best = attempts.length > 0 ? Math.max(...attempts) : 0;
  const percentage = maxScore > 0 ? (average / maxScore) * 100 : 0;

  return {
    exerciseId: exercise.id!,
    attempts,
    average,
    best,
    maxScore,
    percentage,
  };
}

function getAttemptsFromSession(session: TrainingSessionDoc) {
  const attempts: Record<string, number[]> = {};

  (session.results || []).forEach((result) => {
    attempts[result.exerciseId] = result.attempts || [];
  });

  return attempts;
}

export default function PracticePage({ params }: { params: { programId: string } }) {
  const { user } = useAuth();
  const didInitialize = useRef(false);

  const [program, setProgram] = useState<TrainingProgram | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attemptsByExercise, setAttemptsByExercise] = useState<Record<string, number[]>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [finished, setFinished] = useState(false);

  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishComment, setFinishComment] = useState("");
  const [finishingSession, setFinishingSession] = useState(false);

  const [resumeChoice, setResumeChoice] = useState<ResumeChoice>("checking");
  const [existingSession, setExistingSession] = useState<TrainingSessionDoc | null>(null);

  const currentExercise = exercises[currentIndex];

  const currentAttempts = currentExercise?.id
    ? attemptsByExercise[currentExercise.id] || []
    : [];

  const allResults = useMemo(() => {
    return exercises.map((exercise) =>
      calculateResult(exercise, attemptsByExercise[exercise.id!] || [])
    );
  }, [exercises, attemptsByExercise]);

  const sessionAveragePercentage = useMemo(() => {
    const attemptedResults = allResults.filter((result) => result.attempts.length > 0);

    if (attemptedResults.length === 0) return 0;

    return (
      attemptedResults.reduce((sum, result) => sum + result.percentage, 0) /
      attemptedResults.length
    );
  }, [allResults]);

  async function loadProgramAndExercises() {
    if (!user) return null;

    const programSnapshot = await getDoc(doc(db, "trainingPrograms", params.programId));

    if (!programSnapshot.exists()) {
      alert("Nie znaleziono treningu.");
      setLoading(false);
      return null;
    }

    const loadedProgram = {
      id: programSnapshot.id,
      ...programSnapshot.data(),
    } as TrainingProgram;

    if (loadedProgram.userId !== user.uid) {
      alert("Nie masz dostępu do tego treningu.");
      setLoading(false);
      return null;
    }

    const ownExercisesSnapshot = await getDocs(
      query(collection(db, "exercises"), where("userId", "==", user.uid))
    );

    let globalExercises: Exercise[] = [];

    try {
      const globalExercisesSnapshot = await getDocs(
        query(collection(db, "exercises"), where("isGlobal", "==", true))
      );

      globalExercises = globalExercisesSnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })) as Exercise[];
    } catch (error) {
      console.error("Nie udało się pobrać globalnych ćwiczeń:", error);
    }

    const ownExercises = ownExercisesSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as Exercise[];

    const allExercises = [
      ...ownExercises,
      ...globalExercises.filter(
        (globalExercise) =>
          !ownExercises.some((ownExercise) => ownExercise.id === globalExercise.id)
      ),
    ];

    const orderedExercises = loadedProgram.exerciseIds
      .map((id) => allExercises.find((exercise) => exercise.id === id))
      .filter(Boolean) as Exercise[];

    setProgram(loadedProgram);
    setExercises(orderedExercises);

    return { loadedProgram, orderedExercises };
  }

  async function findExistingSession() {
    if (!user) return null;

    const sessionSnapshot = await getDocs(
      query(
        collection(db, "trainingSessions"),
        where("userId", "==", user.uid),
        where("programId", "==", params.programId),
        where("status", "==", "inProgress")
      )
    );

    if (sessionSnapshot.empty) return null;

    const sessions = sessionSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as TrainingSessionDoc[];

    return sessions[0];
  }

  async function startNewSession(loadedProgram = program, orderedExercises = exercises) {
    if (!user) return;
    if (!loadedProgram || orderedExercises.length === 0) return;

    const newSession = await addDoc(collection(db, "trainingSessions"), {
      userId: user.uid,
      programId: params.programId,
      programName: loadedProgram.name,
      status: "inProgress",
      currentExerciseIndex: 0,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      results: orderedExercises.map((exercise) => calculateResult(exercise, [])),
    });

    setSessionId(newSession.id);
    setCurrentIndex(0);
    setAttemptsByExercise({});
    setResumeChoice("practice");
    setLoading(false);
  }

  async function continueExistingSession(session: TrainingSessionDoc) {
    setSessionId(session.id);
    setCurrentIndex(session.currentExerciseIndex || 0);
    setAttemptsByExercise(getAttemptsFromSession(session));
    setResumeChoice("practice");
    setLoading(false);

    await updateDoc(doc(db, "trainingSessions", session.id), {
      updatedAt: serverTimestamp(),
    });
  }

  async function discardAndStartNewSession() {
    if (existingSession?.id) {
      await updateDoc(doc(db, "trainingSessions", existingSession.id), {
        status: "abandoned",
        updatedAt: serverTimestamp(),
      });
    }

    await startNewSession();
  }

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    if (didInitialize.current) return;
    didInitialize.current = true;

    async function initializePractice() {
      try {
        const loaded = await loadProgramAndExercises();
        if (!loaded) return;

        const session = await findExistingSession();

        if (session) {
          setExistingSession(session);
          setResumeChoice("choose");
          setLoading(false);
          return;
        }

        await startNewSession(loaded.loadedProgram, loaded.orderedExercises);
      } catch (error) {
        console.error(error);
        alert("Błąd ładowania treningu.");
        setLoading(false);
      }
    }

    initializePractice();
  }, [params.programId, user]);

  async function saveLiveSession(nextAttempts: Record<string, number[]>, nextIndex = currentIndex) {
    if (!sessionId) return;

    const results = exercises.map((exercise) =>
      calculateResult(exercise, nextAttempts[exercise.id!] || [])
    );

    await updateDoc(doc(db, "trainingSessions", sessionId), {
      currentExerciseIndex: nextIndex,
      results,
      updatedAt: serverTimestamp(),
    });
  }

  async function addAttempt(score: number) {
    if (!currentExercise?.id) return;

    setSavingAttempt(true);

    const nextAttempts = {
      ...attemptsByExercise,
      [currentExercise.id]: [...currentAttempts, score],
    };

    setAttemptsByExercise(nextAttempts);

    try {
      await saveLiveSession(nextAttempts);
    } catch (error) {
      console.error(error);
      alert("Wynik został dodany na ekranie, ale nie udało się go zapisać online.");
    } finally {
      setSavingAttempt(false);
    }
  }

  async function removeLastAttempt() {
    if (!currentExercise?.id || currentAttempts.length === 0) return;

    const nextAttempts = {
      ...attemptsByExercise,
      [currentExercise.id]: currentAttempts.slice(0, -1),
    };

    setAttemptsByExercise(nextAttempts);

    try {
      await saveLiveSession(nextAttempts);
    } catch (error) {
      console.error(error);
      alert("Nie udało się zapisać usunięcia ostatniej próby.");
    }
  }

  async function goToExercise(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= exercises.length) return;

    setCurrentIndex(nextIndex);

    try {
      await saveLiveSession(attemptsByExercise, nextIndex);
    } catch (error) {
      console.error(error);
    }
  }

  function finishSession() {
    if (!sessionId || !user) return;
    setShowFinishModal(true);
  }

  async function completeSession(saveComment: boolean) {
    if (!sessionId || !user) return;

    setFinishingSession(true);

    try {
      await updateDoc(doc(db, "trainingSessions", sessionId), {
        status: "completed",
        finishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        results: allResults,
        sessionAveragePercentage,
      });

      if (saveComment && finishComment.trim()) {
        await addDoc(collection(db, "reflections"), {
          userId: user.uid,
          text: finishComment.trim(),
          type: "training",
          activityType: "training",
          activityDate: new Date().toISOString().slice(0, 10),
          programId: params.programId,
          programName: program?.name || "Trening",
          sessionId,
          sessionAveragePercentage,
          createdAt: serverTimestamp(),
        });
      }

      setShowFinishModal(false);
      setFinishComment("");
      setFinished(true);
      alert("Sesja zapisana.");
    } catch (error) {
      console.error(error);
      alert("Błąd zapisu sesji.");
    } finally {
      setFinishingSession(false);
    }
  }

  return (
    <LoginRequired>
      <>
        {loading || resumeChoice === "checking" ? (
          <p>Ładowanie treningu...</p>
        ) : !program || exercises.length === 0 ? (
          <section className="rounded-2xl bg-white p-6 shadow">
            <h1 className="text-2xl font-bold">Brak ćwiczeń w treningu</h1>
            <Link
              href="/programs"
              className="mt-4 inline-block rounded bg-slate-800 px-4 py-2 text-white"
            >
              Wróć do treningów
            </Link>
          </section>
        ) : resumeChoice === "choose" && existingSession ? (
          <section className="mx-auto max-w-3xl space-y-6">
            <div className="rounded-2xl bg-white p-8 text-center shadow">
              <h1 className="text-3xl font-bold">Masz niedokończoną sesję</h1>
              <p className="mt-3 text-slate-600">
                Trening: <strong>{program.name}</strong>
              </p>
              <p className="mt-1 text-slate-600">
                Zapisane podejścia:{" "}
                <strong>
                  {(existingSession.results || []).reduce(
                    (sum, result) => sum + (result.attempts?.length || 0),
                    0
                  )}
                </strong>
              </p>
              <p className="mt-1 text-slate-600">
                Ostatnie ćwiczenie:{" "}
                <strong>
                  {(existingSession.currentExerciseIndex || 0) + 1} / {exercises.length}
                </strong>
              </p>

              <div className="mt-8 grid gap-3 md:grid-cols-2">
                <button
                  onClick={() => continueExistingSession(existingSession)}
                  className="rounded bg-orange-600 px-6 py-4 font-black text-white hover:bg-orange-500"
                >
                  Kontynuuj sesję
                </button>

                <button
                  onClick={discardAndStartNewSession}
                  className="rounded bg-slate-800 px-6 py-4 font-black text-white hover:bg-slate-700"
                >
                  Zacznij nową
                </button>
              </div>

              <Link
                href="/programs"
                className="mt-5 inline-block text-sm font-bold text-slate-600 underline"
              >
                Wróć do treningów
              </Link>
            </div>
          </section>
        ) : finished ? (
          <section className="space-y-6">
            <div className="rounded-2xl bg-white p-6 text-center shadow">
              <h1 className="text-3xl font-bold">Sesja zakończona ✅</h1>
              <p className="mt-2 text-slate-600">
                Średnia skuteczność sesji: {sessionAveragePercentage.toFixed(1)}%
              </p>

              <div className="mt-6 flex justify-center gap-3">
                <Link href="/stats" className="rounded bg-orange-600 px-5 py-3 font-bold text-white">
                  Zobacz statystyki
                </Link>
                <Link href="/programs" className="rounded bg-slate-800 px-5 py-3 font-bold text-white">
                  Wróć do treningów
                </Link>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-bold">Podsumowanie</h2>

              <div className="space-y-3">
                {allResults.map((result, index) => {
                  const exercise = exercises.find((item) => item.id === result.exerciseId);

                  return (
                    <div key={result.exerciseId} className="rounded border p-4">
                      <p className="font-bold">
                        {index + 1}. {exercise?.name || "Ćwiczenie"}
                      </p>
                      <p className="text-sm text-slate-600">
                        Próby: {result.attempts.join(", ") || "-"} · Średnia:{" "}
                        {result.average.toFixed(1)} / {result.maxScore} · Best:{" "}
                        {result.best} · Skuteczność: {result.percentage.toFixed(1)}%
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <PracticeContent
            program={program}
            exercises={exercises}
            currentIndex={currentIndex}
            attemptsByExercise={attemptsByExercise}
            savingAttempt={savingAttempt}
            addAttempt={addAttempt}
            removeLastAttempt={removeLastAttempt}
            goToExercise={goToExercise}
            finishSession={finishSession}
          />
        )}

        {showFinishModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
              <h2 className="text-2xl font-black">Zakończyć trening?</h2>

              <p className="mt-2 text-slate-600">
                Sesja zostanie zapisana w statystykach. Możesz też dodać krótki komentarz,
                który trafi do sekcji <strong>Przemyślenia</strong>.
              </p>

              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Średnia skuteczność sesji</p>
                <p className="text-3xl font-black text-orange-700">
                  {sessionAveragePercentage.toFixed(1)}%
                </p>
              </div>

              <textarea
                value={finishComment}
                onChange={(event) => setFinishComment(event.target.value)}
                placeholder="Np. Dobrze działało pozycjonowanie, ale za szybko podchodziłam do trudnych bil..."
                className="mt-5 min-h-[130px] w-full rounded border p-3"
              />

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => completeSession(true)}
                  disabled={finishingSession}
                  className="rounded bg-orange-600 px-5 py-3 font-bold text-white hover:bg-orange-500 disabled:opacity-60"
                >
                  {finishingSession ? "Zapisywanie..." : "Zapisz z komentarzem"}
                </button>

                <button
                  onClick={() => completeSession(false)}
                  disabled={finishingSession}
                  className="rounded bg-slate-800 px-5 py-3 font-bold text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  Zakończ bez komentarza
                </button>

                <button
                  onClick={() => setShowFinishModal(false)}
                  disabled={finishingSession}
                  className="rounded bg-slate-200 px-5 py-3 font-bold text-slate-800 hover:bg-slate-300 disabled:opacity-60"
                >
                  Anuluj
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    </LoginRequired>
  );
}

function PracticeContent({
  program,
  exercises,
  currentIndex,
  attemptsByExercise,
  savingAttempt,
  addAttempt,
  removeLastAttempt,
  goToExercise,
  finishSession,
}: {
  program: TrainingProgram;
  exercises: Exercise[];
  currentIndex: number;
  attemptsByExercise: Record<string, number[]>;
  savingAttempt: boolean;
  addAttempt: (score: number) => void;
  removeLastAttempt: () => void;
  goToExercise: (nextIndex: number) => void;
  finishSession: () => void;
}) {
  const currentExercise = exercises[currentIndex];

  const currentAttempts = currentExercise?.id
    ? attemptsByExercise[currentExercise.id] || []
    : [];

  const currentMaxScore = currentExercise ? getExerciseMaxScore(currentExercise) : 1;
  const currentResult = calculateResult(currentExercise, currentAttempts);
  const isLastExercise = currentIndex === exercises.length - 1;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl bg-white p-6 text-center shadow">
        <h1 className="text-2xl font-bold">{program.name}</h1>
        <p className="mt-1 text-slate-600">
          Ćwiczenie {currentIndex + 1} / {exercises.length}: {currentExercise.name}
        </p>

        {currentExercise.description && (
          <p className="mx-auto mt-3 max-w-3xl rounded-xl bg-slate-100 p-4 text-left text-sm text-slate-700">
            {currentExercise.description}
          </p>
        )}

        <p className="mt-1 text-sm text-slate-500">
          Każde kliknięte podejście zapisuje się automatycznie.
        </p>
      </div>

      <PoolTable balls={currentExercise.balls} lines={currentExercise.lines || []} />

      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold">Dodaj wynik</h2>
              <p className="text-sm text-slate-600">
                Maksymalny wynik: {currentMaxScore}. Wynik {currentMaxScore} = 100%.
              </p>
            </div>

            {savingAttempt && (
              <span className="rounded bg-orange-100 px-3 py-1 text-sm font-bold text-orange-700">
                Zapisywanie...
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {Array.from({ length: currentMaxScore + 1 }).map((_, score) => (
              <button
                key={score}
                onClick={() => addAttempt(score)}
                className={`rounded-xl px-4 py-3 text-lg font-black text-white shadow ${
                  score === currentMaxScore
                    ? "bg-green-700 hover:bg-green-600"
                    : "bg-slate-800 hover:bg-orange-600"
                }`}
              >
                {score}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-xl bg-slate-100 p-4">
            <h3 className="mb-2 font-bold">Próby w tym ćwiczeniu</h3>

            {currentAttempts.length === 0 ? (
              <p className="text-slate-600">Brak prób. Kliknij wynik, żeby dodać podejście.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {currentAttempts.map((attempt, index) => (
                  <span key={`${attempt}-${index}`} className="rounded bg-white px-3 py-2 font-bold shadow-sm">
                    #{index + 1}: {attempt}
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={removeLastAttempt}
              disabled={currentAttempts.length === 0}
              className="mt-4 rounded bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              Cofnij ostatnią próbę
            </button>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-bold">Statystyki ćwiczenia</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-100 p-4">
                <p className="text-sm text-slate-500">Liczba prób</p>
                <p className="text-2xl font-black">{currentAttempts.length}</p>
              </div>

              <div className="rounded-xl bg-slate-100 p-4">
                <p className="text-sm text-slate-500">Best</p>
                <p className="text-2xl font-black">
                  {currentAttempts.length ? currentResult.best : "-"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-100 p-4">
                <p className="text-sm text-slate-500">Średnia</p>
                <p className="text-2xl font-black">
                  {currentAttempts.length ? currentResult.average.toFixed(1) : "-"}
                </p>
              </div>

              <div className="rounded-xl bg-slate-100 p-4">
                <p className="text-sm text-slate-500">Skuteczność</p>
                <p className="text-2xl font-black">
                  {currentAttempts.length ? `${currentResult.percentage.toFixed(0)}%` : "-"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-bold">Nawigacja</h2>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => goToExercise(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="rounded bg-slate-200 px-4 py-3 font-bold text-slate-900 disabled:opacity-40"
              >
                ← Poprzednie ćwiczenie
              </button>

              <button
                onClick={() => goToExercise(currentIndex + 1)}
                disabled={isLastExercise}
                className="rounded bg-slate-800 px-4 py-3 font-bold text-white disabled:opacity-40"
              >
                Następne ćwiczenie →
              </button>

              {isLastExercise && (
                <button
                  onClick={finishSession}
                  className="rounded bg-orange-600 px-4 py-3 font-black text-white hover:bg-orange-500"
                >
                  Zakończ i zapisz sesję
                </button>
              )}

              {!isLastExercise && (
                <button
                  onClick={finishSession}
                  className="rounded bg-orange-100 px-4 py-3 font-bold text-orange-800 hover:bg-orange-200"
                >
                  Zakończ sesję wcześniej
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
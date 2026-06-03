"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";

type FirestoreTimestamp = {
  seconds: number;
};

type HundredGameResult = {
  id: string;
  userId: string;
  timeMs: number;
  createdAt?: FirestoreTimestamp;
};

type FocusResult = {
  id: string;
  userId: string;
  averageMs: number;
  bestMs: number;
  rounds: number;
  createdAt?: FirestoreTimestamp;
};

type StroopResult = {
  id: string;
  userId: string;
  accuracy: number;
  averageMs: number;
  correct: number;
  rounds: number;
  createdAt?: FirestoreTimestamp;
};

type MentalProfile = {
  id: string;
  userId: string;
  potting: number;
  doubles: number;
  jumps: number;
  breakShot: number;
  safety: number;
  position: number;
  developmentPlan: string;
  createdAt?: FirestoreTimestamp;
};

type StroopColor = "red" | "blue" | "green" | "purple";

type StroopRound = {
  word: StroopColor;
  color: StroopColor;
  startedAt: number;
};

const FOCUS_ROUNDS = 20;
const STROOP_ROUNDS = 20;

const breathingSteps = [
  { label: "Wdech", seconds: 4 },
  { label: "Zatrzymaj", seconds: 4 },
  { label: "Wydech", seconds: 4 },
  { label: "Zatrzymaj", seconds: 4 },
];

const checklistItems = [
  "Woda / napój przygotowany",
  "Krótka rozgrzewka zrobiona",
  "Telefon wyciszony",
  "Plan na mecz/trening jest jasny",
  "Skupiam się na procesie, nie tylko na wyniku",
  "Akceptuję błędy i wracam do rutyny",
  "Oddychanie spokojne",
  "Pierwsze uderzenia gram bez pośpiechu",
];

const skillLabels = {
  potting: "Wbijanie",
  doubles: "Duble",
  jumps: "Skoki",
  breakShot: "Rozbicie",
  safety: "Odstawne",
  position: "Pozycjonowanie",
};

const stroopLabels: Record<StroopColor, string> = {
  red: "CZERWONY",
  blue: "NIEBIESKI",
  green: "ZIELONY",
  purple: "FIOLETOWY",
};

const stroopTextClasses: Record<StroopColor, string> = {
  red: "text-red-600",
  blue: "text-blue-600",
  green: "text-green-600",
  purple: "text-purple-600",
};

const stroopButtonClasses: Record<StroopColor, string> = {
  red: "bg-red-600 hover:bg-red-500",
  blue: "bg-blue-600 hover:bg-blue-500",
  green: "bg-green-600 hover:bg-green-500",
  purple: "bg-purple-600 hover:bg-purple-500",
};

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatMs(ms: number) {
  return `${Math.round(ms)} ms`;
}

function shuffleNumbers() {
  return Array.from({ length: 100 }, (_, index) => index + 1).sort(
    () => Math.random() - 0.5
  );
}

function formatDate(timestamp?: FirestoreTimestamp) {
  if (!timestamp?.seconds) return "-";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp.seconds * 1000));
}

function getRandomTargetPosition() {
  return {
    x: 8 + Math.random() * 84,
    y: 8 + Math.random() * 84,
  };
}

function getRandomStroopRound(): StroopRound {
  const colors: StroopColor[] = ["red", "blue", "green", "purple"];
  const word = colors[Math.floor(Math.random() * colors.length)];
  const color = colors[Math.floor(Math.random() * colors.length)];

  return {
    word,
    color,
    startedAt: Date.now(),
  };
}

export default function MentalPage() {
  const { user } = useAuth();

  const [results, setResults] = useState<HundredGameResult[]>([]);
  const [focusResults, setFocusResults] = useState<FocusResult[]>([]);
  const [stroopResults, setStroopResults] = useState<StroopResult[]>([]);
  const [profiles, setProfiles] = useState<MentalProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [numbers, setNumbers] = useState<number[]>([]);
  const [nextNumber, setNextNumber] = useState(1);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [gameRunning, setGameRunning] = useState(false);
  const [savingResult, setSavingResult] = useState(false);

  const [focusRunning, setFocusRunning] = useState(false);
  const [focusRound, setFocusRound] = useState(0);
  const [focusTargetStartedAt, setFocusTargetStartedAt] = useState<number | null>(null);
  const [focusTimes, setFocusTimes] = useState<number[]>([]);
  const [focusTarget, setFocusTarget] = useState({ x: 50, y: 50 });
  const [savingFocusResult, setSavingFocusResult] = useState(false);

  const [stroopRunning, setStroopRunning] = useState(false);
  const [stroopRoundIndex, setStroopRoundIndex] = useState(0);
  const [currentStroopRound, setCurrentStroopRound] = useState<StroopRound | null>(null);
  const [stroopCorrect, setStroopCorrect] = useState(0);
  const [stroopTimes, setStroopTimes] = useState<number[]>([]);
  const [savingStroopResult, setSavingStroopResult] = useState(false);

  const [breathingRunning, setBreathingRunning] = useState(false);
  const [breathingStep, setBreathingStep] = useState(0);
  const [breathingSeconds, setBreathingSeconds] = useState(4);

  const [checkedItems, setCheckedItems] = useState<string[]>([]);

  const [potting, setPotting] = useState(5);
  const [doubles, setDoubles] = useState(5);
  const [jumps, setJumps] = useState(5);
  const [breakShot, setBreakShot] = useState(5);
  const [safety, setSafety] = useState(5);
  const [position, setPosition] = useState(5);
  const [developmentPlan, setDevelopmentPlan] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  async function loadMentalData() {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const resultsSnapshot = await getDocs(
      query(collection(db, "mentalHundredGameResults"), where("userId", "==", user.uid))
    );

    const loadedResults = resultsSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as HundredGameResult[];

    const focusSnapshot = await getDocs(
      query(collection(db, "mentalFocusResults"), where("userId", "==", user.uid))
    );

    const loadedFocusResults = focusSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as FocusResult[];

    const stroopSnapshot = await getDocs(
      query(collection(db, "mentalStroopResults"), where("userId", "==", user.uid))
    );

    const loadedStroopResults = stroopSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as StroopResult[];

    const profilesSnapshot = await getDocs(
      query(collection(db, "mentalProfiles"), where("userId", "==", user.uid))
    );

    const loadedProfiles = profilesSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as MentalProfile[];

    loadedResults.sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
    loadedFocusResults.sort((a, b) => (a.averageMs || 0) - (b.averageMs || 0));
    loadedStroopResults.sort((a, b) => {
      if ((b.accuracy || 0) !== (a.accuracy || 0)) return (b.accuracy || 0) - (a.accuracy || 0);
      return (a.averageMs || 0) - (b.averageMs || 0);
    });
    loadedProfiles.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    setResults(loadedResults);
    setFocusResults(loadedFocusResults);
    setStroopResults(loadedStroopResults);
    setProfiles(loadedProfiles);

    const latestProfile = loadedProfiles[0];

    if (latestProfile) {
      setPotting(latestProfile.potting);
      setDoubles(latestProfile.doubles);
      setJumps(latestProfile.jumps);
      setBreakShot(latestProfile.breakShot);
      setSafety(latestProfile.safety);
      setPosition(latestProfile.position);
      setDevelopmentPlan(latestProfile.developmentPlan || "");
    }

    setLoading(false);
  }

  useEffect(() => {
    loadMentalData().catch((error) => {
      console.error(error);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!gameRunning || !startedAt) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now() - startedAt);
    }, 50);

    return () => clearInterval(interval);
  }, [gameRunning, startedAt]);

  useEffect(() => {
    if (!breathingRunning) return;

    const interval = setInterval(() => {
      setBreathingSeconds((prev) => {
        if (prev > 1) return prev - 1;

        setBreathingStep((currentStep) => {
          const nextStep = (currentStep + 1) % breathingSteps.length;
          setBreathingSeconds(breathingSteps[nextStep].seconds);
          return nextStep;
        });

        return prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [breathingRunning]);

  const bestResult = results[0];
  const bestFocusResult = focusResults[0];
  const bestStroopResult = stroopResults[0];

  const lastTenAverage = useMemo(() => {
    const lastTen = [...results]
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 10);

    if (lastTen.length === 0) return 0;

    return lastTen.reduce((sum, result) => sum + result.timeMs, 0) / lastTen.length;
  }, [results]);

  const focusLastTenAverage = useMemo(() => {
    const lastTen = [...focusResults]
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 10);

    if (lastTen.length === 0) return 0;

    return lastTen.reduce((sum, result) => sum + result.averageMs, 0) / lastTen.length;
  }, [focusResults]);

  const checklistProgress = useMemo(() => {
    return Math.round((checkedItems.length / checklistItems.length) * 100);
  }, [checkedItems]);

  const latestProfile = profiles[0];

  function startGame() {
    setNumbers(shuffleNumbers());
    setNextNumber(1);
    setCurrentTime(0);
    setStartedAt(Date.now());
    setGameRunning(true);
  }

  async function clickNumber(number: number) {
    if (!gameRunning || number !== nextNumber || !startedAt || !user) return;

    if (number === 100) {
      const finalTime = Date.now() - startedAt;

      setGameRunning(false);
      setCurrentTime(finalTime);
      setSavingResult(true);

      try {
        await addDoc(collection(db, "mentalHundredGameResults"), {
          userId: user.uid,
          timeMs: finalTime,
          createdAt: serverTimestamp(),
        });

        await loadMentalData();
        alert(`Koniec! Twój czas: ${formatTime(finalTime)}`);
      } catch (error) {
        console.error(error);
        alert("Błąd zapisu wyniku.");
      } finally {
        setSavingResult(false);
      }

      return;
    }

    setNextNumber((prev) => prev + 1);
  }

  function startFocusTest() {
    setFocusRunning(true);
    setFocusRound(1);
    setFocusTimes([]);
    setFocusTarget(getRandomTargetPosition());
    setFocusTargetStartedAt(Date.now());
  }

  async function clickFocusTarget() {
    if (!focusRunning || !focusTargetStartedAt || !user) return;

    const reactionTime = Date.now() - focusTargetStartedAt;
    const nextTimes = [...focusTimes, reactionTime];

    if (focusRound >= FOCUS_ROUNDS) {
      const averageMs = nextTimes.reduce((sum, item) => sum + item, 0) / nextTimes.length;
      const bestMs = Math.min(...nextTimes);

      setFocusTimes(nextTimes);
      setFocusRunning(false);
      setSavingFocusResult(true);

      try {
        await addDoc(collection(db, "mentalFocusResults"), {
          userId: user.uid,
          averageMs,
          bestMs,
          rounds: FOCUS_ROUNDS,
          createdAt: serverTimestamp(),
        });

        await loadMentalData();
        alert(`Focus Test zakończony! Średnia: ${formatMs(averageMs)}`);
      } catch (error) {
        console.error(error);
        alert("Błąd zapisu Focus Test.");
      } finally {
        setSavingFocusResult(false);
      }

      return;
    }

    setFocusTimes(nextTimes);
    setFocusRound((prev) => prev + 1);
    setFocusTarget(getRandomTargetPosition());
    setFocusTargetStartedAt(Date.now());
  }

  function startStroopTest() {
    setStroopRunning(true);
    setStroopRoundIndex(1);
    setStroopCorrect(0);
    setStroopTimes([]);
    setCurrentStroopRound(getRandomStroopRound());
  }

  async function answerStroop(answer: StroopColor) {
    if (!stroopRunning || !currentStroopRound || !user) return;

    const reactionTime = Date.now() - currentStroopRound.startedAt;
    const nextTimes = [...stroopTimes, reactionTime];
    const isCorrect = answer === currentStroopRound.color;
    const nextCorrect = stroopCorrect + (isCorrect ? 1 : 0);

    if (stroopRoundIndex >= STROOP_ROUNDS) {
      const averageMs = nextTimes.reduce((sum, item) => sum + item, 0) / nextTimes.length;
      const accuracy = (nextCorrect / STROOP_ROUNDS) * 100;

      setStroopRunning(false);
      setStroopTimes(nextTimes);
      setStroopCorrect(nextCorrect);
      setSavingStroopResult(true);

      try {
        await addDoc(collection(db, "mentalStroopResults"), {
          userId: user.uid,
          accuracy,
          averageMs,
          correct: nextCorrect,
          rounds: STROOP_ROUNDS,
          createdAt: serverTimestamp(),
        });

        await loadMentalData();
        alert(`Stroop Test zakończony! Poprawność: ${accuracy.toFixed(0)}%, średni czas: ${formatMs(averageMs)}`);
      } catch (error) {
        console.error(error);
        alert("Błąd zapisu Stroop Test.");
      } finally {
        setSavingStroopResult(false);
      }

      return;
    }

    setStroopTimes(nextTimes);
    setStroopCorrect(nextCorrect);
    setStroopRoundIndex((prev) => prev + 1);
    setCurrentStroopRound(getRandomStroopRound());
  }

  function startBreathing() {
    setBreathingStep(0);
    setBreathingSeconds(breathingSteps[0].seconds);
    setBreathingRunning(true);
  }

  function stopBreathing() {
    setBreathingRunning(false);
    setBreathingStep(0);
    setBreathingSeconds(4);
  }

  function toggleChecklistItem(item: string) {
    setCheckedItems((prev) =>
      prev.includes(item)
        ? prev.filter((currentItem) => currentItem !== item)
        : [...prev, item]
    );
  }

  function resetChecklist() {
    setCheckedItems([]);
  }

  async function saveMentalProfile() {
    if (!user) return;

    setSavingProfile(true);

    try {
      await addDoc(collection(db, "mentalProfiles"), {
        userId: user.uid,
        potting,
        doubles,
        jumps,
        breakShot,
        safety,
        position,
        developmentPlan,
        createdAt: serverTimestamp(),
      });

      await loadMentalData();
      alert("Koło zawodnika zapisane.");
    } catch (error) {
      console.error(error);
      alert("Błąd zapisu koła zawodnika.");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <LoginRequired>
      {loading ? (
        <p>Ładowanie mentalu...</p>
      ) : (
        <section className="space-y-6">
          <div className="rounded-2xl bg-slate-900 p-6 text-white shadow">
            <h1 className="text-3xl font-black">Mental</h1>
            <p className="mt-2 max-w-2xl text-slate-300">
              Trening koncentracji, refleksu, kontroli impulsu, oddechu, samoocena umiejętności i plan pracy mentalnej.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Setka Game — best</p>
              <p className="text-3xl font-black">
                {bestResult ? formatTime(bestResult.timeMs) : "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Focus — best avg</p>
              <p className="text-3xl font-black">
                {bestFocusResult ? formatMs(bestFocusResult.averageMs) : "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Stroop — best</p>
              <p className="text-3xl font-black">
                {bestStroopResult
                  ? `${bestStroopResult.accuracy.toFixed(0)}%`
                  : "-"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {bestStroopResult ? formatMs(bestStroopResult.averageMs) : ""}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Setka — średnia 10</p>
              <p className="text-3xl font-black">
                {lastTenAverage ? formatTime(lastTenAverage) : "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Focus — średnia 10</p>
              <p className="text-3xl font-black">
                {focusLastTenAverage ? formatMs(focusLastTenAverage) : "-"}
              </p>
            </div>
          </div>

          {/* Setka Game */}
          <div className="rounded-2xl bg-white p-6 shadow">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-black">Setka Game</h2>
                <p className="text-slate-600">
                  Klikaj liczby od 1 do 100 w kolejności. Liczy się czas.
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm text-slate-500">Następna liczba</p>
                <p className="text-3xl font-black text-orange-700">{nextNumber}</p>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-3">
              <button
                onClick={startGame}
                disabled={savingResult}
                className="rounded bg-orange-600 px-6 py-3 font-bold text-white hover:bg-orange-500 disabled:opacity-60"
              >
                {gameRunning ? "Restart" : "Start"}
              </button>

              <span className="rounded bg-slate-100 px-4 py-3 font-black">
                Czas: {formatTime(currentTime)}
              </span>

              {savingResult && (
                <span className="rounded bg-orange-100 px-4 py-3 text-sm font-bold text-orange-700">
                  Zapisywanie...
                </span>
              )}
            </div>

            {numbers.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-8 text-center text-slate-600">
                Kliknij Start, żeby rozpocząć grę.
              </div>
            ) : (
              <div className="mx-auto grid max-w-[620px] grid-cols-10 gap-1">
                {numbers.map((number) => {
                  const alreadyClicked = number < nextNumber;

                  return (
                    <button
                      key={number}
                      onClick={() => clickNumber(number)}
                      disabled={alreadyClicked}
                      className={`aspect-square rounded border text-[11px] font-black leading-none transition sm:text-xs ${
                        alreadyClicked
                          ? "bg-slate-200 text-slate-300"
                          : "bg-white text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      {number}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Focus Test */}
          <div className="rounded-2xl bg-white p-6 shadow">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-black">Focus Test</h2>
                <p className="text-slate-600">
                  Kliknij target jak najszybciej. Test ma {FOCUS_ROUNDS} rund i zapisuje średni czas reakcji.
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm text-slate-500">Runda</p>
                <p className="text-3xl font-black text-blue-700">
                  {focusRunning ? `${focusRound}/${FOCUS_ROUNDS}` : `0/${FOCUS_ROUNDS}`}
                </p>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-3">
              <button
                onClick={startFocusTest}
                disabled={savingFocusResult}
                className="rounded bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {focusRunning ? "Restart" : "Start Focus Test"}
              </button>

              {focusTimes.length > 0 && (
                <span className="rounded bg-slate-100 px-4 py-3 font-black">
                  Ostatni klik: {formatMs(focusTimes[focusTimes.length - 1])}
                </span>
              )}

              {savingFocusResult && (
                <span className="rounded bg-blue-100 px-4 py-3 text-sm font-bold text-blue-700">
                  Zapisywanie...
                </span>
              )}
            </div>

            <div className="relative h-[420px] overflow-hidden rounded-2xl border bg-slate-50">
              {!focusRunning ? (
                <div className="flex h-full items-center justify-center text-center text-slate-600">
                  Kliknij Start Focus Test, żeby rozpocząć.
                </div>
              ) : (
                <button
                  onClick={clickFocusTarget}
                  className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 font-black text-white shadow-lg transition hover:bg-blue-500"
                  style={{
                    left: `${focusTarget.x}%`,
                    top: `${focusTarget.y}%`,
                  }}
                >
                  🎯
                </button>
              )}
            </div>
          </div>

          {/* Stroop Test */}
          <div className="rounded-2xl bg-white p-6 shadow">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-black">Stroop Test</h2>
                <p className="text-slate-600">
                  Kliknij kolor czcionki, nie znaczenie słowa. Test sprawdza kontrolę impulsu.
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm text-slate-500">Runda</p>
                <p className="text-3xl font-black text-purple-700">
                  {stroopRunning ? `${stroopRoundIndex}/${STROOP_ROUNDS}` : `0/${STROOP_ROUNDS}`}
                </p>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-3">
              <button
                onClick={startStroopTest}
                disabled={savingStroopResult}
                className="rounded bg-purple-600 px-6 py-3 font-bold text-white hover:bg-purple-500 disabled:opacity-60"
              >
                {stroopRunning ? "Restart" : "Start Stroop Test"}
              </button>

              {stroopRunning && (
                <span className="rounded bg-slate-100 px-4 py-3 font-black">
                  Poprawne: {stroopCorrect}/{stroopRoundIndex - 1}
                </span>
              )}

              {savingStroopResult && (
                <span className="rounded bg-purple-100 px-4 py-3 text-sm font-bold text-purple-700">
                  Zapisywanie...
                </span>
              )}
            </div>

            <div className="rounded-2xl border bg-slate-50 p-8 text-center">
              {!stroopRunning || !currentStroopRound ? (
                <div className="py-12 text-slate-600">
                  Kliknij Start Stroop Test, żeby rozpocząć.
                </div>
              ) : (
                <>
                  <p className={`text-6xl font-black ${stroopTextClasses[currentStroopRound.color]}`}>
                    {stroopLabels[currentStroopRound.word]}
                  </p>

                  <p className="mt-4 text-sm text-slate-500">
                    Kliknij kolor liter, nie słowo.
                  </p>

                  <div className="mt-8 grid gap-3 sm:grid-cols-4">
                    {(["red", "blue", "green", "purple"] as StroopColor[]).map((color) => (
                      <button
                        key={color}
                        onClick={() => answerStroop(color)}
                        className={`rounded px-4 py-4 font-black text-white ${stroopButtonClasses[color]}`}
                      >
                        {stroopLabels[color]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Breathing + Checklist */}
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-black">Breathing Trainer</h2>
                  <p className="text-slate-600">
                    Prosta rutyna oddechowa przed treningiem, sparingiem albo turniejem.
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm text-slate-500">Tryb</p>
                  <p className="text-2xl font-black text-green-700">Box Breathing</p>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-8 text-center">
                <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full bg-green-100 shadow-inner">
                  <div>
                    <p className="text-3xl font-black text-green-800">
                      {breathingRunning ? breathingSteps[breathingStep].label : "Gotowa?"}
                    </p>

                    <p className="mt-2 text-5xl font-black text-green-700">
                      {breathingRunning ? breathingSeconds : "4"}
                    </p>
                  </div>
                </div>

                <p className="mx-auto mt-6 max-w-xl text-slate-600">
                  Schemat: wdech 4 sekundy → zatrzymaj 4 sekundy → wydech 4 sekundy →
                  zatrzymaj 4 sekundy. Powtórz kilka cykli przed ważną partią.
                </p>

                <div className="mt-6 flex justify-center gap-3">
                  <button
                    onClick={startBreathing}
                    className="rounded bg-green-700 px-6 py-3 font-bold text-white hover:bg-green-600"
                  >
                    Start
                  </button>

                  <button
                    onClick={stopBreathing}
                    className="rounded bg-slate-200 px-6 py-3 font-bold text-slate-800 hover:bg-slate-300"
                  >
                    Stop
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-black">Pre-match Checklist</h2>
                  <p className="text-slate-600">
                    Szybka kontrola gotowości przed sparingiem, turniejem albo ważnym treningiem.
                  </p>
                </div>

                <div className="rounded-xl bg-slate-100 px-4 py-3 text-right">
                  <p className="text-sm text-slate-500">Gotowość</p>
                  <p className="text-3xl font-black text-orange-700">{checklistProgress}%</p>
                </div>
              </div>

              <div className="mb-5 h-4 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-orange-600"
                  style={{ width: `${checklistProgress}%` }}
                />
              </div>

              <div className="space-y-3">
                {checklistItems.map((item) => {
                  const checked = checkedItems.includes(item);

                  return (
                    <button
                      key={item}
                      onClick={() => toggleChecklistItem(item)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition ${
                        checked
                          ? "border-green-300 bg-green-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${
                          checked
                            ? "bg-green-600 text-white"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {checked ? "✓" : ""}
                      </span>

                      <span className="font-bold text-slate-800">{item}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={resetChecklist}
                  className="rounded bg-slate-200 px-5 py-3 font-bold text-slate-800 hover:bg-slate-300"
                >
                  Reset
                </button>

                {checklistProgress === 100 && (
                  <span className="rounded bg-green-100 px-5 py-3 font-bold text-green-700">
                    Gotowa do gry ✅
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Koło */}
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="text-2xl font-black">Koło zawodnika</h2>
              <p className="mt-2 text-slate-600">
                Oceń swoje umiejętności od 1 do 10. Najlepiej powtarzać co 3 miesiące.
              </p>

              <div className="mt-6 space-y-4">
                <SkillSlider label={skillLabels.potting} value={potting} onChange={setPotting} />
                <SkillSlider label={skillLabels.doubles} value={doubles} onChange={setDoubles} />
                <SkillSlider label={skillLabels.jumps} value={jumps} onChange={setJumps} />
                <SkillSlider label={skillLabels.breakShot} value={breakShot} onChange={setBreakShot} />
                <SkillSlider label={skillLabels.safety} value={safety} onChange={setSafety} />
                <SkillSlider label={skillLabels.position} value={position} onChange={setPosition} />
              </div>

              <textarea
                className="mt-6 min-h-[120px] w-full rounded border p-3"
                placeholder="Nad czym chcesz pracować przez najbliższe 3 miesiące?"
                value={developmentPlan}
                onChange={(event) => setDevelopmentPlan(event.target.value)}
              />

              <button
                onClick={saveMentalProfile}
                disabled={savingProfile}
                className="mt-4 rounded bg-orange-600 px-6 py-3 font-bold text-white hover:bg-orange-500 disabled:opacity-60"
              >
                {savingProfile ? "Zapisywanie..." : "Zapisz koło zawodnika"}
              </button>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="text-2xl font-black">Aktualne koło</h2>

              {!latestProfile ? (
                <p className="mt-4 text-slate-600">Brak zapisanej samooceny.</p>
              ) : (
                <>
                  <div className="mt-5 space-y-4">
                    <SkillBar label={skillLabels.potting} value={latestProfile.potting} />
                    <SkillBar label={skillLabels.doubles} value={latestProfile.doubles} />
                    <SkillBar label={skillLabels.jumps} value={latestProfile.jumps} />
                    <SkillBar label={skillLabels.breakShot} value={latestProfile.breakShot} />
                    <SkillBar label={skillLabels.safety} value={latestProfile.safety} />
                    <SkillBar label={skillLabels.position} value={latestProfile.position} />
                  </div>

                  {latestProfile.developmentPlan && (
                    <div className="mt-6 rounded-xl bg-slate-50 p-4">
                      <p className="mb-2 text-sm font-bold text-slate-500">
                        Plan na kolejne miesiące
                      </p>
                      <p className="whitespace-pre-wrap text-slate-800">
                        {latestProfile.developmentPlan}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Historie */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="mb-4 text-2xl font-black">Historia Setka Game</h2>

              {results.length === 0 ? (
                <p className="text-slate-600">Brak zapisanych wyników.</p>
              ) : (
                <div className="space-y-2">
                  {results.slice(0, 10).map((result, index) => (
                    <div
                      key={result.id}
                      className="rounded border p-3"
                    >
                      <p className="font-bold">
                        #{index + 1} — {formatTime(result.timeMs)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDate(result.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="mb-4 text-2xl font-black">Historia Focus Test</h2>

              {focusResults.length === 0 ? (
                <p className="text-slate-600">Brak zapisanych wyników.</p>
              ) : (
                <div className="space-y-2">
                  {focusResults.slice(0, 10).map((result, index) => (
                    <div
                      key={result.id}
                      className="rounded border p-3"
                    >
                      <p className="font-bold">
                        #{index + 1} — średnia {formatMs(result.averageMs)}
                      </p>
                      <p className="text-sm text-slate-500">
                        Best klik: {formatMs(result.bestMs)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDate(result.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="mb-4 text-2xl font-black">Historia Stroop Test</h2>

              {stroopResults.length === 0 ? (
                <p className="text-slate-600">Brak zapisanych wyników.</p>
              ) : (
                <div className="space-y-2">
                  {stroopResults.slice(0, 10).map((result, index) => (
                    <div
                      key={result.id}
                      className="rounded border p-3"
                    >
                      <p className="font-bold">
                        #{index + 1} — {result.accuracy.toFixed(0)}%
                      </p>
                      <p className="text-sm text-slate-500">
                        Średni czas: {formatMs(result.averageMs)} · Poprawne: {result.correct}/{result.rounds}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDate(result.createdAt)}
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

function SkillSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span>{value}/10</span>
      </div>

      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
    </div>
  );
}

function SkillBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span>{value}/10</span>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-orange-600"
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  );
}
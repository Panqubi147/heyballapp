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

const skillLabels = {
  potting: "Wbijanie",
  doubles: "Duble",
  jumps: "Skoki",
  breakShot: "Rozbicie",
  safety: "Odstawne",
  position: "Pozycjonowanie",
};

function formatTime(ms: number) {
  return `${(ms / 1000).toFixed(2)} s`;
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

export default function MentalPage() {
  const { user } = useAuth();

  const [results, setResults] = useState<HundredGameResult[]>([]);
  const [profiles, setProfiles] = useState<MentalProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [numbers, setNumbers] = useState<number[]>([]);
  const [nextNumber, setNextNumber] = useState(1);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [gameRunning, setGameRunning] = useState(false);
  const [savingResult, setSavingResult] = useState(false);

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

    const profilesSnapshot = await getDocs(
      query(collection(db, "mentalProfiles"), where("userId", "==", user.uid))
    );

    const loadedProfiles = profilesSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as MentalProfile[];

    loadedResults.sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
    loadedProfiles.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    setResults(loadedResults);
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

  const bestResult = results[0];

  const lastTenAverage = useMemo(() => {
    const lastTen = [...results]
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 10);

    if (lastTen.length === 0) return 0;

    return lastTen.reduce((sum, result) => sum + result.timeMs, 0) / lastTen.length;
  }, [results]);

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
              Trening koncentracji, samoocena umiejętności i plan pracy mentalnej.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Setka Game — best</p>
              <p className="text-3xl font-black">
                {bestResult ? formatTime(bestResult.timeMs) : "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Średnia 10 prób</p>
              <p className="text-3xl font-black">
                {lastTenAverage ? formatTime(lastTenAverage) : "-"}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Liczba prób</p>
              <p className="text-3xl font-black">{results.length}</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow">
              <p className="text-sm text-slate-500">Ostatnie koło</p>
              <p className="text-xl font-black">
                {latestProfile ? formatDate(latestProfile.createdAt) : "-"}
              </p>
            </div>
          </div>

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
              <div className="grid grid-cols-10 gap-2">
                {numbers.map((number) => {
                  const alreadyClicked = number < nextNumber;

                  return (
                    <button
                      key={number}
                      onClick={() => clickNumber(number)}
                      disabled={alreadyClicked}
                      className={`aspect-square rounded-lg border text-sm font-black transition ${
                        alreadyClicked
                          ? "bg-green-100 text-green-300"
                          : number === nextNumber
                            ? "bg-orange-600 text-white hover:bg-orange-500"
                            : "bg-white text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      {String(number).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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

          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-4 text-2xl font-black">Historia Setka Game</h2>

            {results.length === 0 ? (
              <p className="text-slate-600">Brak zapisanych wyników.</p>
            ) : (
              <div className="space-y-2">
                {results.slice(0, 10).map((result, index) => (
                  <div
                    key={result.id}
                    className="flex items-center justify-between rounded border p-3"
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
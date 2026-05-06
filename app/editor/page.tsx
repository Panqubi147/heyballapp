"use client";

import { Suspense, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { Ball, Exercise, ScoreMode, TableLine } from "@/types";
import { PoolTable, createBall } from "@/components/PoolTable";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";

function normalizeBalls(balls: Ball[]) {
  return balls.map((ball) => ({
    ...ball,
    stripe: ball.stripe ?? ball.number >= 9,
  }));
}

function getAutoMaxScore(balls: Ball[]) {
  return balls.filter((ball) => ball.number !== 0).length;
}

function EditorContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const exerciseId = searchParams.get("exerciseId");
  const isEditMode = Boolean(exerciseId);

  const [loading, setLoading] = useState(isEditMode);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [lines, setLines] = useState<TableLine[]>([]);
  const [drawMode, setDrawMode] = useState<"none" | "line" | "arrow">("none");
  const [selectedBallId, setSelectedBallId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("potting");
  const [difficulty, setDifficulty] = useState(1);
  const [scoreMode, setScoreMode] = useState<ScoreMode>("balls");
  const [manualMaxScore, setManualMaxScore] = useState(10);
  const [saving, setSaving] = useState(false);

  const calculatedMaxScore =
    scoreMode === "balls" ? getAutoMaxScore(balls) : Math.max(1, manualMaxScore);

  useEffect(() => {
    async function loadExercise() {
      if (!exerciseId) return;

      const snapshot = await getDoc(doc(db, "exercises", exerciseId));

      if (!snapshot.exists()) {
        alert("Nie znaleziono ćwiczenia.");
        router.push("/exercises");
        return;
      }

      const exercise = { id: snapshot.id, ...snapshot.data() } as Exercise;

      setName(exercise.name);
      setDescription(exercise.description || "");
      setCategory(exercise.category || "potting");
      setDifficulty(exercise.difficulty || 1);
      setBalls(normalizeBalls(exercise.balls || []));
      setLines(exercise.lines || []);
      setScoreMode(exercise.scoreMode || "balls");
      setManualMaxScore(exercise.maxScore || 10);
      setLoading(false);
    }

    loadExercise().catch((error) => {
      console.error(error);
      alert("Błąd ładowania ćwiczenia.");
      setLoading(false);
    });
  }, [exerciseId, router]);

  function addBall(number: number) {
    if (balls.some((ball) => ball.number === number)) return;
    const newBall = createBall(number);
    setBalls([...balls, newBall]);
    setSelectedBallId(newBall.id);
  }

  function moveSelectedBall(dx: number, dy: number) {
    if (!selectedBallId) return;
  
    const ballRadius = 2.25 / 2;
  
    setBalls((prev) =>
      prev.map((ball) =>
        ball.id === selectedBallId
          ? {
              ...ball,
              x: Math.max(ballRadius, Math.min(100 - ballRadius, ball.x + dx)),
              y: Math.max(ballRadius, Math.min(100 - ballRadius, ball.y + dy)),
            }
          : ball
      )
    );
  }

  function removeSelectedBall() {
    if (!selectedBallId) return;
    setBalls((prev) => prev.filter((ball) => ball.id !== selectedBallId));
    setSelectedBallId(null);
  }

  function clearTable() {
    setBalls([]);
    setLines([]);
    setSelectedBallId(null);
    setDrawMode("none");
  }

  async function saveExercise() {
    if (!user) {
      alert("Musisz być zalogowany.");
      return;
    }

    if (!name.trim()) {
      alert("Dodaj nazwę ćwiczenia.");
      return;
    }

    if (calculatedMaxScore <= 0) {
      alert("Maksymalny wynik musi być większy niż 0. Dodaj bile albo ustaw wynik ręcznie.");
      return;
    }

    setSaving(true);

    const normalizedBalls = normalizeBalls(balls);

    const exercisePayload = {
      name,
      description,
      category,
      difficulty,
      balls: normalizedBalls,
      lines,
      scoreMode,
      maxScore: calculatedMaxScore,
    };

    try {
      if (isEditMode && exerciseId) {
        await updateDoc(doc(db, "exercises", exerciseId), {
          ...exercisePayload,
          updatedAt: serverTimestamp(),
        });

        alert("Zmiany zapisane.");
        router.push("/exercises");
      } else {
        await addDoc(collection(db, "exercises"), {
          userId: user.uid,
          ...exercisePayload,
          createdAt: serverTimestamp(),
        });

        setName("");
        setDescription("");
        setBalls([]);
        setLines([]);
        setSelectedBallId(null);
        setDrawMode("none");
        setScoreMode("balls");
        setManualMaxScore(10);
        setCategory("potting");

        alert("Ćwiczenie zapisane.");
      }
    } catch (error) {
      console.error(error);
      alert("Błąd zapisu.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Ładowanie ćwiczenia...</p>;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-bold">
          {isEditMode ? "Edytuj ćwiczenie" : "Kreator ćwiczeń"}
        </h1>
        <p className="mt-2 text-slate-600">
          Dodaj bile, przesuwaj je po stole, rysuj linie i strzałki oraz ustaw sposób punktacji.
        </p>
      </div>

      <PoolTable
        balls={balls}
        lines={lines}
        editable
        drawMode={drawMode}
        selectedBallId={selectedBallId}
        onSelectBall={setSelectedBallId}
        onBallsChange={setBalls}
        onLinesChange={setLines}
      />

      <div className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-3 font-bold">Bile</h2>

        <div className="mb-4 flex flex-wrap gap-2">
          {Array.from({ length: 16 }).map((_, number) => (
            <button
              key={number}
              onClick={() => addBall(number)}
              className="rounded bg-slate-800 px-3 py-2 text-white hover:bg-slate-700"
            >
              {number === 0 ? "Dodaj białą" : `Dodaj ${number}`}
            </button>
          ))}

          <button
            onClick={removeSelectedBall}
            disabled={!selectedBallId}
            className="rounded bg-red-700 px-3 py-2 text-white disabled:opacity-40"
          >
            Usuń wybraną bilę
          </button>

          <button onClick={clearTable} className="rounded bg-red-600 px-3 py-2 text-white">
            Wyczyść wszystko
          </button>
        </div>

        <h2 className="mb-3 font-bold">Rysowanie</h2>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setDrawMode("none")}
            className={`rounded px-3 py-2 ${
              drawMode === "none" ? "bg-orange-600 text-white" : "bg-slate-200 text-slate-900"
            }`}
          >
            Przesuwanie bil
          </button>

          <button
            onClick={() => setDrawMode("line")}
            className={`rounded px-3 py-2 ${
              drawMode === "line" ? "bg-orange-600 text-white" : "bg-slate-200 text-slate-900"
            }`}
          >
            Rysuj linię
          </button>

          <button
            onClick={() => setDrawMode("arrow")}
            className={`rounded px-3 py-2 ${
              drawMode === "arrow" ? "bg-orange-600 text-white" : "bg-slate-200 text-slate-900"
            }`}
          >
            Rysuj strzałkę
          </button>

          <div className="flex flex-wrap gap-2">
  <button
    onClick={() => {
      if (lines.length === 0) return;

      setLines((prev) => prev.slice(0, -1));
    }}
    disabled={lines.length === 0}
    className="rounded bg-orange-600 px-3 py-2 text-white disabled:opacity-40"
  >
    Usuń ostatnią linię
  </button>

  <button
    onClick={() => setLines([])}
    disabled={lines.length === 0}
    className="rounded bg-slate-800 px-3 py-2 text-white disabled:opacity-40"
  >
    Usuń wszystkie linie
  </button>
</div>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          W trybie linii/strzałki kliknij pierwszy punkt na stole, potem drugi punkt.
        </p>

        <h2 className="mb-3 font-bold">Dokładne przesuwanie wybranej bili</h2>

        <div className="mb-6 flex flex-wrap items-center gap-2">
        <button onClick={() => moveSelectedBall(0, -0.1)} className="rounded bg-slate-800 px-4 py-2 text-white">↑</button>
<button onClick={() => moveSelectedBall(-0.1, 0)} className="rounded bg-slate-800 px-4 py-2 text-white">←</button>
<button onClick={() => moveSelectedBall(0.1, 0)} className="rounded bg-slate-800 px-4 py-2 text-white">→</button>
<button onClick={() => moveSelectedBall(0, 0.1)} className="rounded bg-slate-800 px-4 py-2 text-white">↓</button>

          <span className="ml-2 text-sm text-slate-600">
            {selectedBallId
              ? "Kliknięta bila jest zaznaczona białą obwódką."
              : "Kliknij bilę, żeby ją zaznaczyć."}
          </span>
        </div>

        <h2 className="mb-3 font-bold">Punktacja</h2>

        <div className="mb-6 grid gap-4 rounded-xl border bg-slate-50 p-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Typ punktacji
            </label>

            <select
              className="w-full rounded border p-3"
              value={scoreMode}
              onChange={(event) => setScoreMode(event.target.value as ScoreMode)}
            >
              <option value="balls">Automatycznie z liczby bil do wbicia</option>
              <option value="manual">Ręcznie ustaw maksymalny wynik</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Maksymalny wynik
            </label>

            {scoreMode === "balls" ? (
              <div className="rounded border bg-white p-3">
                {calculatedMaxScore} pkt
                <span className="ml-2 text-sm text-slate-500">
                  biała bila nie jest liczona
                </span>
              </div>
            ) : (
              <input
                className="w-full rounded border p-3"
                type="number"
                min={1}
                max={30}
                value={manualMaxScore}
                onChange={(event) => setManualMaxScore(Number(event.target.value))}
              />
            )}
          </div>

          <p className="text-sm text-slate-600 md:col-span-2">
            Przykład: ćwiczenie na 2 bile daje przyciski 0–2, czyli 2 = 100%.
            Dla 10 odstawnych/skoków wybierz tryb ręczny i ustaw 10.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <input
            className="rounded border p-3"
            placeholder="Nazwa ćwiczenia"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          <select
            className="rounded border p-3"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="potting">Wbijanie</option>
            <option value="jumps">Skoki</option>
            <option value="safety">Bezpieczne</option>
            <option value="technique">Technika</option>
            <option value="break">Rozbicia</option>
            <option value="doubles">Duble</option>
            <option value="masse">Masse</option>
            <option value="position">Pozycjonowanie</option>
          </select>

          <input
            className="rounded border p-3"
            type="number"
            min={1}
            max={5}
            value={difficulty}
            onChange={(event) => setDifficulty(Number(event.target.value))}
          />

          <textarea
            className="rounded border p-3 md:col-span-2"
            placeholder="Opis"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <button
          onClick={saveExercise}
          disabled={saving}
          className="mt-4 rounded bg-orange-600 px-6 py-3 font-bold text-white hover:bg-orange-500 disabled:opacity-60"
        >
          {saving ? "Zapisywanie..." : isEditMode ? "Zapisz zmiany" : "Zapisz ćwiczenie"}
        </button>
      </div>
    </section>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<p>Ładowanie edytora...</p>}>
      <LoginRequired>
        <EditorContent />
      </LoginRequired>
    </Suspense>
  );
}
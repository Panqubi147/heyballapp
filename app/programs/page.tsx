"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Exercise, TrainingProgram } from "@/types";
import { PoolTable } from "@/components/PoolTable";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";

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

type ExerciseSourceFilter = "all" | "own" | "global" | "coach";

export default function ProgramsPage() {
  const { user } = useAuth();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [programName, setProgramName] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<ExerciseSourceFilter>("all");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);

  async function loadData() {
    if (!user) {
      setLoading(false);
      return;
    }
  
    setLoading(true);
    setLoadError("");
  
    try {
      const ownExerciseSnapshot = await getDocs(
        query(collection(db, "exercises"), where("userId", "==", user.uid))
      );
  
      const ownExercises = ownExerciseSnapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })) as Exercise[];
  
      let globalExercises: Exercise[] = [];
  
      try {
        const globalExerciseSnapshot = await getDocs(
          query(collection(db, "exercises"), where("isGlobal", "==", true))
        );
  
        globalExercises = globalExerciseSnapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as Exercise[];
      } catch (globalError) {
        console.error("Błąd globalnych ćwiczeń:", globalError);
      }
  
      let loadedPrograms: TrainingProgram[] = [];
  
      try {
        const programsSnapshot = await getDocs(
          query(collection(db, "trainingPrograms"), where("userId", "==", user.uid))
        );
  
        loadedPrograms = programsSnapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as TrainingProgram[];
      } catch (programError) {
        console.error("Błąd treningów:", programError);
      }
  
      const loadedExercises = [
        ...ownExercises,
        ...globalExercises.filter(
          (globalExercise) =>
            !ownExercises.some((ownExercise) => ownExercise.id === globalExercise.id)
        ),
      ];
  
      setExercises(loadedExercises);
      setPrograms(loadedPrograms);
    } catch (error) {
      console.error("Błąd główny loadData:", error);
      setLoadError("Nie udało się pobrać Twoich ćwiczeń. Najpewniej Firestore Rules blokują exercises.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user]);

  const filteredExercises = useMemo(() => {
    return exercises.filter((exercise) => {
      const matchesSearch =
        exercise.name.toLowerCase().includes(search.toLowerCase()) ||
        (exercise.description || "").toLowerCase().includes(search.toLowerCase()) ||
        exercise.category.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        categoryFilter === "all" || exercise.category === categoryFilter;

      const matchesSource =
        sourceFilter === "all" ||
        (sourceFilter === "own" &&
          !exercise.isGlobal &&
          !exercise.assignedByCoachId) ||
        (sourceFilter === "global" && exercise.isGlobal) ||
        (sourceFilter === "coach" &&
          exercise.assignedByCoachId &&
          !exercise.isGlobal);

      return matchesSearch && matchesCategory && matchesSource;
    });
  }, [exercises, search, categoryFilter, sourceFilter]);

  const selectedExercises = useMemo(() => {
    return selectedExerciseIds
      .map((id) => exercises.find((exercise) => exercise.id === id))
      .filter(Boolean) as Exercise[];
  }, [selectedExerciseIds, exercises]);

  const isEditing = Boolean(editingProgramId);

  function toggleExercise(id: string) {
    setSelectedExerciseIds((prev) =>
      prev.includes(id)
        ? prev.filter((exerciseId) => exerciseId !== id)
        : [...prev, id]
    );
  }

  function moveSelectedExercise(id: string, direction: "up" | "down") {
    const currentIndex = selectedExerciseIds.indexOf(id);
    if (currentIndex === -1) return;

    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= selectedExerciseIds.length) return;

    const next = [...selectedExerciseIds];
    const temp = next[currentIndex];
    next[currentIndex] = next[nextIndex];
    next[nextIndex] = temp;

    setSelectedExerciseIds(next);
  }

  function startEditProgram(program: TrainingProgram) {
    if (!program.id) return;

    setEditingProgramId(program.id);
    setProgramName(program.name);
    setSelectedExerciseIds(program.exerciseIds || []);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function cancelEditProgram() {
    setEditingProgramId(null);
    setProgramName("");
    setSelectedExerciseIds([]);
  }

  async function saveProgram() {
    if (!user) {
      alert("Musisz być zalogowany.");
      return;
    }

    if (!programName.trim()) {
      alert("Dodaj nazwę treningu.");
      return;
    }

    if (selectedExerciseIds.length === 0) {
      alert("Wybierz przynajmniej jedno ćwiczenie.");
      return;
    }

    setSaving(true);

    try {
      if (editingProgramId) {
        await updateDoc(doc(db, "trainingPrograms", editingProgramId), {
          name: programName,
          exerciseIds: selectedExerciseIds,
          updatedAt: serverTimestamp(),
        });

        alert("Trening zaktualizowany.");
      } else {
        await addDoc(collection(db, "trainingPrograms"), {
          userId: user.uid,
          name: programName,
          exerciseIds: selectedExerciseIds,
          createdAt: serverTimestamp(),
        });

        alert("Trening zapisany.");
      }

      setProgramName("");
      setSelectedExerciseIds([]);
      setEditingProgramId(null);
      await loadData();
    } catch (error: any) {
      console.error("Błąd zapisu treningu:", error);
    
      alert(
        `Błąd zapisu treningu: ${error?.code || ""} ${error?.message || ""}`
      );
    }finally {
      setSaving(false);
    }
  }

  async function deleteProgram(program: TrainingProgram) {
    if (!program.id) return;

    const confirmed = confirm(`Usunąć trening "${program.name}"?`);
    if (!confirmed) return;

    await deleteDoc(doc(db, "trainingPrograms", program.id));
    setPrograms((prev) => prev.filter((item) => item.id !== program.id));

    if (editingProgramId === program.id) {
      cancelEditProgram();
    }
  }

  return (
    <LoginRequired>
      <section className="space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow">
          <h1 className="text-2xl font-bold">Moje treningi</h1>
          <p className="mt-2 text-slate-600">
            Wybierz ćwiczenia z bazy, ustaw kolejność i zapisz gotowy trening.
          </p>
        </div>

        {loading ? (
          <p>Ładowanie...</p>
        ) : loadError ? (
          <div className="rounded-2xl bg-red-50 p-6 font-bold text-red-700 shadow">
            {loadError}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-bold">Baza ćwiczeń</h2>
              
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <input
                  className="rounded border p-3"
                  placeholder="Szukaj ćwiczeń"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                <select
                  className="rounded border p-3"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">Wszystkie kategorie</option>
                  <option value="potting">Wbijanie</option>
                  <option value="jumps">Skoki</option>
                  <option value="safety">Bezpieczne</option>
                  <option value="technique">Technika</option>
                  <option value="break">Rozbicia</option>
                  <option value="doubles">Duble</option>
                  <option value="masse">Masse</option>
                  <option value="position">Pozycjonowanie</option>
                </select>

                <select
                  className="rounded border p-3"
                  value={sourceFilter}
                  onChange={(event) =>
                    setSourceFilter(event.target.value as ExerciseSourceFilter)
                  }
                >
                  <option value="all">Wszystkie źródła</option>
                  <option value="own">Moje ćwiczenia</option>
                  <option value="global">Globalne</option>
                  <option value="coach">Od trenera</option>
                </select>
              </div>

              {filteredExercises.length === 0 ? (
  <div className="rounded border p-4 text-slate-600">
    Brak ćwiczeń pasujących do filtrów.

    <div className="mt-3 rounded bg-slate-100 p-3 text-xs text-slate-700">
      Załadowane ćwiczenia: {exercises.length}
      <br />
      UID konta: {user?.uid}
      <br />
      Filtr kategorii: {categoryFilter}
      <br />
      Filtr źródła: {sourceFilter}
    </div>
  </div>
) : (
              
                <div className="space-y-4">
                  {filteredExercises.map((exercise) => {
                    const selected = selectedExerciseIds.includes(exercise.id || "");

                    return (
                      <article
                        key={exercise.id}
                        className={`rounded-2xl border p-4 ${
                          selected ? "border-orange-500 bg-orange-50" : "border-slate-200"
                        }`}
                      >
                        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold">{exercise.name}</h3>

                              {exercise.isGlobal && (
                                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                                  Globalne
                                </span>
                              )}

                              {exercise.assignedByCoachId && !exercise.isGlobal && (
                                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                                  Od trenera
                                </span>
                              )}
                            </div>

                            <p className="text-sm text-slate-600">
                              {categoryLabels[exercise.category] || exercise.category} · Poziom{" "}
                              {exercise.difficulty} · Bile: {exercise.balls.length}
                            </p>
                          </div>

                          <button
                            onClick={() => toggleExercise(exercise.id!)}
                            className={`rounded px-4 py-2 text-sm font-bold ${
                              selected
                                ? "bg-red-600 text-white"
                                : "bg-slate-800 text-white hover:bg-slate-700"
                            }`}
                          >
                            {selected ? "Usuń z treningu" : "Dodaj do treningu"}
                          </button>
                        </div>

                        <PoolTable balls={exercise.balls} lines={exercise.lines || []} />
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl bg-white p-6 shadow">
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-xl font-bold">
                    {isEditing ? "Edytuj trening" : "Nowy trening"}
                  </h2>

                  {isEditing && (
                    <button
                      onClick={cancelEditProgram}
                      className="rounded bg-slate-200 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-300"
                    >
                      Anuluj edycję
                    </button>
                  )}
                </div>

                <input
                  className="mb-4 w-full rounded border p-3"
                  placeholder="Nazwa treningu"
                  value={programName}
                  onChange={(event) => setProgramName(event.target.value)}
                />

                {selectedExercises.length === 0 ? (
                  <div className="rounded border p-4 text-sm text-slate-600">
                    Nie wybrano jeszcze ćwiczeń.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedExercises.map((exercise, index) => (
                      <div
                        key={exercise.id}
                        className="flex items-center justify-between gap-3 rounded border p-3"
                      >
                        <div>
                          <p className="font-bold">
                            {index + 1}. {exercise.name}
                          </p>
                          <p className="text-xs text-slate-600">
                            {categoryLabels[exercise.category] || exercise.category} · Poziom{" "}
                            {exercise.difficulty}
                          </p>
                        </div>

                        <div className="flex gap-1">
                          <button
                            onClick={() => moveSelectedExercise(exercise.id!, "up")}
                            className="rounded bg-slate-200 px-2 py-1 text-sm"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveSelectedExercise(exercise.id!, "down")}
                            className="rounded bg-slate-200 px-2 py-1 text-sm"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => toggleExercise(exercise.id!)}
                            className="rounded bg-red-600 px-2 py-1 text-sm text-white"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={saveProgram}
                  disabled={saving}
                  className="mt-4 w-full rounded bg-orange-600 px-6 py-3 font-bold text-white hover:bg-orange-500 disabled:opacity-60"
                >
                  {saving
                    ? "Zapisywanie..."
                    : isEditing
                      ? "Zapisz zmiany"
                      : "Zapisz trening"}
                </button>
              </div>

              <div className="rounded-2xl bg-white p-6 shadow">
                <h2 className="mb-4 text-xl font-bold">Zapisane treningi</h2>

                {programs.length === 0 ? (
                  <div className="rounded border p-4 text-sm text-slate-600">
                    Brak zapisanych treningów.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {programs.map((program) => (
                      <article
                        key={program.id}
                        className={`rounded border p-4 ${
                          editingProgramId === program.id ? "border-orange-500 bg-orange-50" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold">{program.name}</h3>

                          {program.assignedByCoachId && (
                            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                              Od trenera
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-slate-600">
                          Liczba ćwiczeń: {(program.exerciseIds || []).length}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/practice/${program.id}`}
                            className="rounded bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-500"
                          >
                            Start treningu
                          </Link>

                          <button
                            onClick={() => startEditProgram(program)}
                            className="rounded bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                          >
                            Edytuj
                          </button>

                          <button
                            onClick={() => deleteProgram(program)}
                            className="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500"
                          >
                            Usuń
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </LoginRequired>
  );
}
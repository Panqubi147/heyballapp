"use client";

import Link from "next/link";
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
import { Exercise } from "@/types";
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

export default function ExercisesPage() {
  const { user } = useAuth();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [search, setSearch] = useState("");

  async function loadExercises() {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const ownSnapshot = await getDocs(
      query(collection(db, "exercises"), where("userId", "==", user.uid))
    );

    const globalSnapshot = await getDocs(
      query(collection(db, "exercises"), where("isGlobal", "==", true))
    );

    const ownExercises = ownSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as Exercise[];

    const globalExercises = globalSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as Exercise[];

    const mergedExercises = [
      ...ownExercises,
      ...globalExercises.filter(
        (globalExercise) =>
          !ownExercises.some((ownExercise) => ownExercise.id === globalExercise.id)
      ),
    ];

    setExercises(mergedExercises);
    setLoading(false);
  }

  useEffect(() => {
    loadExercises().catch((error) => {
      console.error(error);
      setLoading(false);
    });
  }, [user]);

  const filteredExercises = useMemo(() => {
    return exercises.filter((exercise) => {
      const matchesSearch =
        exercise.name.toLowerCase().includes(search.toLowerCase()) ||
        exercise.description.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        categoryFilter === "all" || exercise.category === categoryFilter;

      const matchesDifficulty =
        difficultyFilter === "all" ||
        String(exercise.difficulty) === difficultyFilter;

      return matchesSearch && matchesCategory && matchesDifficulty;
    });
  }, [exercises, search, categoryFilter, difficultyFilter]);

  async function deleteExercise(exercise: Exercise) {
    if (!exercise.id) return;

    if (exercise.isGlobal) {
      alert("Globalnego ćwiczenia nie można usunąć z poziomu użytkownika.");
      return;
    }

    const confirmed = confirm(`Usunąć ćwiczenie "${exercise.name}"?`);
    if (!confirmed) return;

    await deleteDoc(doc(db, "exercises", exercise.id));

    setExercises((prev) => prev.filter((item) => item.id !== exercise.id));
  }

  return (
    <LoginRequired>
      <section className="space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow">
          <h1 className="text-2xl font-bold">Baza ćwiczeń</h1>
          <p className="mt-2 text-slate-600">
            Przeglądaj zapisane układy, filtruj je, edytuj i usuwaj błędne ćwiczenia.
          </p>
        </div>

        {loading ? (
          <p>Ładowanie...</p>
        ) : (
          <>
            <div className="grid gap-3 rounded-2xl bg-white p-6 shadow md:grid-cols-4">
              <input
                className="rounded border p-3 md:col-span-2"
                placeholder="Szukaj po nazwie lub opisie"
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
                value={difficultyFilter}
                onChange={(event) => setDifficultyFilter(event.target.value)}
              >
                <option value="all">Każdy poziom</option>
                <option value="1">Poziom 1</option>
                <option value="2">Poziom 2</option>
                <option value="3">Poziom 3</option>
                <option value="4">Poziom 4</option>
                <option value="5">Poziom 5</option>
              </select>
            </div>

            {filteredExercises.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 shadow">
                Brak ćwiczeń pasujących do filtrów.
              </div>
            ) : (
              <div className="grid gap-6">
                {filteredExercises.map((exercise) => (
                  <article key={exercise.id} className="rounded-2xl bg-white p-6 shadow">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-bold">{exercise.name}</h2>

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

                        <p className="mt-1 text-sm text-slate-600">
                          Kategoria: {categoryLabels[exercise.category] || exercise.category} ·
                          Poziom: {exercise.difficulty} · Bile: {exercise.balls.length} ·
                          Linie/strzałki: {exercise.lines?.length || 0}
                        </p>

                        {exercise.description && (
                          <p className="mt-2 text-slate-700">{exercise.description}</p>
                        )}
                      </div>

                      {!exercise.isGlobal && (
                        <div className="flex gap-2">
                          <Link
                            href={`/editor?exerciseId=${exercise.id}`}
                            className="rounded bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                          >
                            Edytuj
                          </Link>

                          <button
                            onClick={() => deleteExercise(exercise)}
                            className="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500"
                          >
                            Usuń
                          </button>
                        </div>
                      )}
                    </div>

                    <PoolTable balls={exercise.balls} lines={exercise.lines || []} />
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </LoginRequired>
  );
}
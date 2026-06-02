"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { LoginRequired } from "@/components/LoginRequired";

type ActivityType = "training" | "match" | "tournament" | "note";

type Reflection = {
  id: string;
  userId: string;
  text: string;
  type: "general" | "training";
  activityType?: ActivityType;
  activityDate?: string;
  programName?: string;
  sessionAveragePercentage?: number;
  createdAt?: {
    seconds: number;
  };
};

type RangeFilter = "week" | "month" | "all";

const activityLabels: Record<ActivityType, string> = {
  training: "Po treningu",
  match: "Sparing",
  tournament: "Turniej",
  note: "Notatka",
};

function formatDate(timestamp?: { seconds: number }) {
  if (!timestamp?.seconds) return "-";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp.seconds * 1000));
}

function formatActivityDate(date?: string) {
  if (!date) return "";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
  }).format(new Date(`${date}T12:00:00`));
}

function getRangeStart(range: RangeFilter) {
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

function getBadge(item: Reflection) {
  if (item.type === "training" || item.activityType === "training") {
    return {
      label: "Po treningu",
      className: "bg-orange-100 text-orange-700",
    };
  }

  if (item.activityType === "match") {
    return {
      label: "Sparing",
      className: "bg-blue-100 text-blue-700",
    };
  }

  if (item.activityType === "tournament") {
    return {
      label: "Turniej",
      className: "bg-purple-100 text-purple-700",
    };
  }

  if (item.activityType === "note") {
    return {
      label: "Notatka",
      className: "bg-green-100 text-green-700",
    };
  }

  return {
    label: "Ogólne",
    className: "bg-slate-100 text-slate-700",
  };
}

export default function ReflectionsPage() {
  const { user } = useAuth();

  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [text, setText] = useState("");
  const [range, setRange] = useState<RangeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadReflections() {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const snapshot = await getDocs(
      query(
        collection(db, "reflections"),
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      )
    );

    const loaded = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })) as Reflection[];

    setReflections(loaded);
    setLoading(false);
  }

  useEffect(() => {
    loadReflections().catch((error) => {
      console.error(error);
      setLoading(false);
    });
  }, [user]);

  const filteredReflections = useMemo(() => {
    const rangeStart = getRangeStart(range);

    if (!rangeStart) return reflections;

    return reflections.filter((item) => {
      if (!item.createdAt?.seconds) return false;
      return new Date(item.createdAt.seconds * 1000) >= rangeStart;
    });
  }, [reflections, range]);

  async function saveReflection() {
    if (!user) return;

    if (!text.trim()) {
      alert("Dodaj treść przemyślenia.");
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, "reflections"), {
        userId: user.uid,
        text: text.trim(),
        type: "general",
        activityType: "note",
        activityDate: new Date().toISOString().slice(0, 10),
        createdAt: serverTimestamp(),
      });

      setText("");
      await loadReflections();
    } catch (error) {
      console.error(error);
      alert("Błąd zapisu przemyślenia.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <LoginRequired>
      {loading ? (
        <p>Ładowanie przemyśleń...</p>
      ) : (
        <section className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow">
            <h1 className="text-3xl font-black">Przemyślenia</h1>
            <p className="mt-2 text-slate-600">
              Zapisuj obserwacje po treningach, sparingach, turniejach i ogólne notatki o progresie.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-3 text-xl font-bold">Dodaj przemyślenie</h2>

            <textarea
              className="min-h-[120px] w-full rounded border p-3"
              placeholder="Np. Dzisiaj dobrze działało pozycjonowanie, ale muszę poprawić kontrolę białej..."
              value={text}
              onChange={(event) => setText(event.target.value)}
            />

            <button
              onClick={saveReflection}
              disabled={saving}
              className="mt-4 rounded bg-orange-600 px-6 py-3 font-bold text-white hover:bg-orange-500 disabled:opacity-60"
            >
              {saving ? "Zapisywanie..." : "Zapisz przemyślenie"}
            </button>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="text-xl font-bold">Historia</h2>

              <select
                className="rounded border p-3"
                value={range}
                onChange={(event) => setRange(event.target.value as RangeFilter)}
              >
                <option value="week">Ostatni tydzień</option>
                <option value="month">Ostatni miesiąc</option>
                <option value="all">All time</option>
              </select>
            </div>

            {filteredReflections.length === 0 ? (
              <div className="rounded border p-4 text-slate-600">
                Brak przemyśleń w wybranym zakresie.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredReflections.map((item) => {
                  const badge = getBadge(item);

                  return (
                    <article key={item.id} className="rounded-2xl border p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </span>

                        {item.programName && (
                          <span className="text-sm font-bold text-slate-600">
                            {item.programName}
                          </span>
                        )}

                        {item.activityDate && (
                          <span className="text-sm font-bold text-slate-500">
                            {formatActivityDate(item.activityDate)}
                          </span>
                        )}

                        {item.activityType && (
                          <span className="text-xs text-slate-400">
                            {activityLabels[item.activityType]}
                          </span>
                        )}

                        {typeof item.sessionAveragePercentage === "number" && (
                          <span className="text-sm font-bold text-green-700">
                            {item.sessionAveragePercentage.toFixed(1)}%
                          </span>
                        )}
                      </div>

                      <p className="whitespace-pre-wrap text-slate-800">{item.text}</p>

                      <p className="mt-3 text-xs text-slate-400">
                        Dodano: {formatDate(item.createdAt)}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </LoginRequired>
  );
}
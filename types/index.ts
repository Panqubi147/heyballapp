
export type Ball = {
  id: string;
  number: number;
  x: number;
  y: number;
  color: string;
  stripe?: boolean;
};

export type TableLine = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: "line" | "arrow";
};

export type ScoreMode = "balls" | "manual";

export type Exercise = {
  id?: string;
  userId?: string;
  name: string;
  description: string;
  category: string;
  difficulty: number;
  balls: Ball[];
  lines?: TableLine[];
  scoreMode?: ScoreMode;
  maxScore?: number;
  createdAt?: unknown;
  updatedAt?: unknown;

  isGlobal?: boolean;
  createdByCoachId?: string;
  createdByCoachEmail?: string | null;

  assignedByCoachId?: string;
  assignedByCoachEmail?: string | null;
  sourceExerciseId?: string;
  sourceOwnerId?: string;
  assignedAt?: unknown;
};

export type TrainingProgram = {
  id?: string;
  userId: string;
  name: string;
  exerciseIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;

  assignedByCoachId?: string;
  assignedByCoachEmail?: string | null;
  sourceProgramId?: string;
  sourceOwnerId?: string;
  assignedAt?: unknown;
};

export type TrainingSessionResult = {
  exerciseId: string;
  attempts: number[];
  average: number;
  best: number;
  maxScore?: number;
  percentage?: number;
};
export type ActivityType =
  | "training"
  | "match"
  | "tournament";
  
export type TrainingSession = {
  id?: string;
  userId: string;
  programId: string;
  startedAt: unknown;
  finishedAt?: unknown;
  results: TrainingSessionResult[];
};

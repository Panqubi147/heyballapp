"use client";

import { Ball, TableLine } from "@/types";
import { useState } from "react";

const BALL_SIZE_PERCENT = 2.25;

const ballColors: Record<number, string> = {
  0: "#ffffff",
  1: "#fbbf24",
  2: "#2563eb",
  3: "#ef4444",
  4: "#7c3aed",
  5: "#f97316",
  6: "#16a34a",
  7: "#7f1d1d",
  8: "#111827",
  9: "#fbbf24",
  10: "#2563eb",
  11: "#ef4444",
  12: "#7c3aed",
  13: "#f97316",
  14: "#16a34a",
  15: "#7f1d1d",
};

type Props = {
  balls: Ball[];
  lines?: TableLine[];
  editable?: boolean;
  drawMode?: "none" | "line" | "arrow";
  selectedBallId?: string | null;
  onSelectBall?: (id: string | null) => void;
  onBallsChange?: (balls: Ball[]) => void;
  onLinesChange?: (lines: TableLine[]) => void;
};

export function PoolTable({
  balls,
  lines = [],
  editable = false,
  drawMode = "none",
  selectedBallId,
  onSelectBall,
  onBallsChange,
  onLinesChange,
}: Props) {
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);

  const horizontalDiamondPositions = [12.5, 25, 37.5, 62.5, 75, 87.5];
  const verticalDiamondPositions = [25, 50, 75];

  function getPoint(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  }

  function moveBall(id: string, x: number, y: number) {
    if (!editable || !onBallsChange) return;

    const ballRadius = BALL_SIZE_PERCENT / 2;

    onBallsChange(
      balls.map((ball) =>
        ball.id === id
          ? {
              ...ball,
              x: Math.max(ballRadius, Math.min(100 - ballRadius, x)),
              y: Math.max(ballRadius, Math.min(100 - ballRadius, y)),
            }
          : ball
      )
    );
  }

  function handleTableClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!editable || drawMode === "none" || !onLinesChange) return;

    const point = getPoint(event);

    if (!drawingStart) {
      setDrawingStart(point);
      return;
    }

    onLinesChange([
      ...lines,
      {
        id: crypto.randomUUID(),
        x1: drawingStart.x,
        y1: drawingStart.y,
        x2: point.x,
        y2: point.y,
        type: drawMode,
      },
    ]);

    setDrawingStart(null);
  }

  function renderBall(ball: Ball) {
    const color = ball.color || ballColors[ball.number] || "#111827";
    const isCueBall = ball.number === 0;
    const isStripe = ball.stripe || ball.number >= 9;

    return (
      <span
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-black/30 shadow-inner"
        style={{ backgroundColor: isCueBall ? "#ffffff" : color }}
      >
        {isStripe && !isCueBall && (
          <>
            <span className="absolute left-0 top-0 h-[27%] w-full bg-white" />
            <span className="absolute bottom-0 left-0 h-[27%] w-full bg-white" />
          </>
        )}

        {!isCueBall && (
          <span className="relative z-10 flex h-[58%] w-[58%] items-center justify-center rounded-full bg-white text-[clamp(5px,0.55vw,8px)] font-black leading-none text-slate-900">
            {ball.number}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="relative mx-auto aspect-[2/1] w-full max-w-4xl rounded-[28px] bg-zinc-800 p-5 shadow-xl">
      {horizontalDiamondPositions.map((x) => (
        <div
          key={`top-${x}`}
          className="absolute z-20 h-2 w-2 bg-white"
          style={{
            left: `calc(1.25rem + (100% - 2.5rem) * ${x / 100})`,
            top: "0.62rem",
            transform: "translate(-50%, -50%) rotate(45deg)",
          }}
        />
      ))}

      {horizontalDiamondPositions.map((x) => (
        <div
          key={`bottom-${x}`}
          className="absolute z-20 h-2 w-2 bg-white"
          style={{
            left: `calc(1.25rem + (100% - 2.5rem) * ${x / 100})`,
            top: "calc(100% - 0.62rem)",
            transform: "translate(-50%, -50%) rotate(45deg)",
          }}
        />
      ))}

      {verticalDiamondPositions.map((y) => (
        <div
          key={`left-${y}`}
          className="absolute z-20 h-2 w-2 bg-white"
          style={{
            left: "0.62rem",
            top: `calc(1.25rem + (100% - 2.5rem) * ${y / 100})`,
            transform: "translate(-50%, -50%) rotate(45deg)",
          }}
        />
      ))}

      {verticalDiamondPositions.map((y) => (
        <div
          key={`right-${y}`}
          className="absolute z-20 h-2 w-2 bg-white"
          style={{
            left: "calc(100% - 0.62rem)",
            top: `calc(1.25rem + (100% - 2.5rem) * ${y / 100})`,
            transform: "translate(-50%, -50%) rotate(45deg)",
          }}
        />
      ))}

      <div className="absolute left-3 top-3 h-10 w-10 rounded-full bg-black" />
      <div className="absolute right-3 top-3 h-10 w-10 rounded-full bg-black" />
      <div className="absolute bottom-3 left-3 h-10 w-10 rounded-full bg-black" />
      <div className="absolute bottom-3 right-3 h-10 w-10 rounded-full bg-black" />
      <div className="absolute left-1/2 top-2 h-9 w-9 -translate-x-1/2 rounded-full bg-black" />
      <div className="absolute bottom-2 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full bg-black" />

      <div
        className="relative h-full w-full overflow-hidden rounded-xl bg-emerald-700"
        onClick={handleTableClick}
      >
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-4 opacity-20">
          {Array.from({ length: 32 }).map((_, i) => (
            <div key={i} className="border border-white/40" />
          ))}
        </div>

        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <defs>
            <marker
              id="arrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="white" />
            </marker>
          </defs>

          {lines.map((line) => (
            <line
              key={line.id}
              x1={`${line.x1}%`}
              y1={`${line.y1}%`}
              x2={`${line.x2}%`}
              y2={`${line.y2}%`}
              stroke="white"
              strokeWidth="3"
              strokeDasharray={line.type === "line" ? "8 6" : undefined}
              markerEnd={line.type === "arrow" ? "url(#arrow)" : undefined}
            />
          ))}

          {drawingStart && (
            <circle cx={`${drawingStart.x}%`} cy={`${drawingStart.y}%`} r="6" fill="white" />
          )}
        </svg>

        {balls.map((ball) => (
          <button
            key={ball.id}
            type="button"
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ${
              selectedBallId === ball.id ? "outline outline-1 outline-white" : ""
            }`}
            style={{
              left: `${ball.x}%`,
              top: `${ball.y}%`,
              width: `${BALL_SIZE_PERCENT}%`,
              aspectRatio: "1 / 1",
              cursor: editable ? "grab" : "default",
            }}
            draggable={editable}
            onClick={(event) => {
              event.stopPropagation();
              onSelectBall?.(ball.id);
            }}
            onDragEnd={(event) => {
              const rect = event.currentTarget.parentElement?.getBoundingClientRect();
              if (!rect) return;

              const x = ((event.clientX - rect.left) / rect.width) * 100;
              const y = ((event.clientY - rect.top) / rect.height) * 100;

              moveBall(ball.id, x, y);
            }}
            title={ball.number === 0 ? "Biała bila" : `Bila ${ball.number}`}
          >
            {renderBall(ball)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function createBall(number: number): Ball {
  return {
    id: crypto.randomUUID(),
    number,
    x: 50,
    y: 50,
    color: ballColors[number] || "#111827",
    stripe: number >= 9,
  };
}

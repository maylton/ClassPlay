"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import type { ActivitySet, GameType } from "@/lib/types";
import { GAME_COMPONENTS } from "./game-registry";

const REPLAY_EVENT = "classplay:game-replay";

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function GameStage({
  mode,
  activity,
  runKey,
  onComplete,
}: {
  mode: GameType;
  activity: ActivitySet;
  runKey?: string | number;
  onComplete: (score: number, correct: number, total: number) => void;
}) {
  const startedAtRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(true);

  const restartClock = useCallback(() => {
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setRunning(true);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(restartClock, 0);
    return () => window.clearTimeout(timeout);
  }, [mode, runKey, activity.id, restartClock]);

  useEffect(() => {
    const replay = () => restartClock();
    window.addEventListener(REPLAY_EVENT, replay);
    return () => window.removeEventListener(REPLAY_EVENT, replay);
  }, [restartClock]);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      if (startedAtRef.current === null) return;
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  function handleComplete(score: number, correct: number, total: number) {
    const startedAt = startedAtRef.current;
    setElapsedMs(startedAt === null ? 0 : Date.now() - startedAt);
    setRunning(false);
    onComplete(score, correct, total);
  }

  const GameComponent = GAME_COMPONENTS[mode];
  return (
    <div className="timed-game-shell">
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 auto .55rem", maxWidth: 1100, padding: "0 .2rem" }}>
        <span className="storage-pill"><AppIcon name="clock" /> Time {formatElapsed(elapsedMs)}</span>
      </div>
      <GameComponent key={`${mode}-${runKey ?? 0}`} activity={activity} onComplete={handleComplete} />
    </div>
  );
}

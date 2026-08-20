"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { AppIcon } from "@/components/AppIcon";
import type { ActivitySet, GameType } from "@/lib/types";
import { FlashcardsGame } from "./FlashcardsGame";
import { GapFillGame } from "./GapFillGame";
import type { GameProps } from "./GameTypes";
import { MatchingGame } from "./MatchingGame";
import { MemoryGame } from "./MemoryGame";
import { QuizGame } from "./QuizGame";
import { SentenceBuilderGame } from "./SentenceBuilderGame";
import { SpaceBlasterGame } from "./SpaceBlasterGame";
import { WordMazeGame } from "./WordMazeGame";

const REPLAY_EVENT = "classplay:game-replay";
const GAME_COMPONENTS: Record<GameType, ComponentType<GameProps>> = {
  flashcards: FlashcardsGame,
  memory: MemoryGame,
  matching: MatchingGame,
  "sentence-builder": SentenceBuilderGame,
  "gap-fill": GapFillGame,
  quiz: QuizGame,
  "space-blaster": SpaceBlasterGame,
  "word-maze": WordMazeGame,
};

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
  const startedAtRef = useRef(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(true);

  const restartClock = useCallback(() => {
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setRunning(true);
  }, []);

  useEffect(() => {
    restartClock();
  }, [mode, runKey, activity.id, restartClock]);

  useEffect(() => {
    const replay = () => restartClock();
    window.addEventListener(REPLAY_EVENT, replay);
    return () => window.removeEventListener(REPLAY_EVENT, replay);
  }, [restartClock]);

  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsedMs(Date.now() - startedAtRef.current);
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  function handleComplete(score: number, correct: number, total: number) {
    setElapsedMs(Date.now() - startedAtRef.current);
    setRunning(false);
    onComplete(score, correct, total);
  }

  const GameComponent = GAME_COMPONENTS[mode];
  return (
    <div className="timed-game-shell">
      <div className="game-session-timer"><span className="storage-pill"><AppIcon name="clock" /> Time {formatElapsed(elapsedMs)}</span></div>
      <GameComponent key={`${mode}-${runKey ?? 0}`} activity={activity} onComplete={handleComplete} />
    </div>
  );
}

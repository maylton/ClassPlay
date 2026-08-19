"use client";

import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import type { ActivitySet, GameType } from "@/lib/types";
import { FlashcardsGame } from "./FlashcardsGame";
import { MemoryGame } from "./MemoryGame";
import { MatchingGame } from "./MatchingGame";
import { SentenceBuilderGame } from "./SentenceBuilderGame";
import { GapFillGame } from "./GapFillGame";
import { QuizGame } from "./QuizGame";
import { SpaceBlasterGame } from "./SpaceBlasterGame";
import { WordMazeGame } from "./WordMazeGame";

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
  const startedAtRef = useRef(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(true);

  function restartClock() {
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setRunning(true);
  }

  useEffect(() => {
    restartClock();
  }, [mode, runKey, activity.id]);

  useEffect(() => {
    const replay = () => restartClock();
    window.addEventListener(REPLAY_EVENT, replay);
    return () => window.removeEventListener(REPLAY_EVENT, replay);
  }, []);

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

  const props = { activity, onComplete: handleComplete };
  const key = `${mode}-${runKey ?? 0}`;

  let game;
  if (mode === "flashcards") game = <FlashcardsGame key={key} {...props} />;
  else if (mode === "memory") game = <MemoryGame key={key} {...props} />;
  else if (mode === "matching") game = <MatchingGame key={key} {...props} />;
  else if (mode === "sentence-builder") game = <SentenceBuilderGame key={key} {...props} />;
  else if (mode === "gap-fill") game = <GapFillGame key={key} {...props} />;
  else if (mode === "quiz") game = <QuizGame key={key} {...props} />;
  else if (mode === "space-blaster") game = <SpaceBlasterGame key={key} {...props} />;
  else game = <WordMazeGame key={key} {...props} />;

  return (
    <div className="timed-game-shell">
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 auto .55rem", maxWidth: 1100, padding: "0 .2rem" }}>
        <span className="storage-pill"><AppIcon name="clock" /> Time {formatElapsed(elapsedMs)}</span>
      </div>
      {game}
    </div>
  );
}

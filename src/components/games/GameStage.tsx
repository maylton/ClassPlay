"use client";

import type { ActivitySet, GameType } from "@/lib/types";
import { FlashcardsGame } from "./FlashcardsGame";
import { MemoryGame } from "./MemoryGame";
import { MatchingGame } from "./MatchingGame";
import { SentenceBuilderGame } from "./SentenceBuilderGame";
import { GapFillGame } from "./GapFillGame";
import { QuizGame } from "./QuizGame";
import { SpaceBlasterGame } from "./SpaceBlasterGame";
import { WordMazeGame } from "./WordMazeGame";

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
  const props = { activity, onComplete };
  const key = `${mode}-${runKey ?? 0}`;

  if (mode === "flashcards") return <FlashcardsGame key={key} {...props} />;
  if (mode === "memory") return <MemoryGame key={key} {...props} />;
  if (mode === "matching") return <MatchingGame key={key} {...props} />;
  if (mode === "sentence-builder") return <SentenceBuilderGame key={key} {...props} />;
  if (mode === "gap-fill") return <GapFillGame key={key} {...props} />;
  if (mode === "quiz") return <QuizGame key={key} {...props} />;
  if (mode === "space-blaster") return <SpaceBlasterGame key={key} {...props} />;
  return <WordMazeGame key={key} {...props} />;
}

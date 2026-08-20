import {
  buildQuizGapArcadeRounds,
  chooseQuizGapArcadeSource,
  type QuizGapArcadeSource,
} from "./derived-arcade-engine";
import { speedBonus } from "./game-engine";
import type { ActivityItem } from "./types";

export type GrammarRunnerQuestionSource = QuizGapArcadeSource;

export type GrammarRunnerGate = {
  lane: 0 | 1 | 2;
  text: string;
  correct: boolean;
};

export type GrammarRunnerRound = {
  itemId: string;
  source: GrammarRunnerQuestionSource;
  prompt: string;
  correctAnswer: string;
  gates: GrammarRunnerGate[];
  hint?: string;
};

export type GrammarRunnerGateResult = {
  correct: boolean;
  points: number;
  nextStreak: number;
  perfect: boolean;
};

export const GRAMMAR_RUNNER_MIN_TRAVEL_MS = 3800;
export const GRAMMAR_RUNNER_MAX_TRAVEL_MS = 5600;
const PERFECT_SELECTION_MS = 1500;

export const chooseGrammarRunnerSource = chooseQuizGapArcadeSource;

export function grammarRunnerTravelMs(streak: number) {
  return Math.max(
    GRAMMAR_RUNNER_MIN_TRAVEL_MS,
    GRAMMAR_RUNNER_MAX_TRAVEL_MS - Math.min(Math.max(streak, 0), 6) * 300,
  );
}

export function buildGrammarRunnerRounds(
  items: readonly ActivityItem[],
  source: GrammarRunnerQuestionSource,
  random: () => number = Math.random,
): GrammarRunnerRound[] {
  return buildQuizGapArcadeRounds(items, source, 3, random)
    .filter((round) => round.options.length === 3)
    .map((round) => ({
      itemId: round.itemId,
      source: round.source,
      prompt: round.prompt,
      correctAnswer: round.correctAnswer,
      hint: round.hint,
      gates: round.options.map((text, lane) => ({
        lane: lane as 0 | 1 | 2,
        text,
        correct: text === round.correctAnswer,
      })),
    }));
}

export function resolveGrammarRunnerGate(
  correct: boolean,
  selectionMs: number,
  streak: number,
): GrammarRunnerGateResult {
  if (!correct) {
    return { correct: false, points: 0, nextStreak: 0, perfect: false };
  }
  const nextStreak = streak + 1;
  const speed = speedBonus(selectionMs, 90, PERFECT_SELECTION_MS, GRAMMAR_RUNNER_MAX_TRAVEL_MS);
  return {
    correct: true,
    points: 100 + speed + Math.min(streak, 5) * 20,
    nextStreak,
    perfect: selectionMs <= PERFECT_SELECTION_MS,
  };
}

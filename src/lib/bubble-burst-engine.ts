import {
  buildQuizGapArcadeRounds,
  chooseQuizGapArcadeSource,
  type QuizGapArcadeRound,
  type QuizGapArcadeSource,
} from "./derived-arcade-engine";
import { speedBonus } from "./game-engine";
import type { ActivityItem } from "./types";

export type BubbleBurstQuestionSource = QuizGapArcadeSource;
export type BubbleBurstRound = QuizGapArcadeRound;

export type BubbleBurstHit = {
  points: number;
  perfect: boolean;
  nextStreak: number;
};

export type BubbleBurstPosition = {
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
};

export const BUBBLE_BURST_ROUND_MS = 15000;
const PERFECT_WINDOW_MS = 2200;

export const chooseBubbleBurstSource = chooseQuizGapArcadeSource;

export function resolveBubbleBurstHit(responseMs: number, streak: number): BubbleBurstHit {
  const perfect = responseMs <= PERFECT_WINDOW_MS;
  const nextStreak = streak + 1;
  const points = 100 + speedBonus(responseMs) + Math.min(streak, 5) * 20 + (perfect ? 40 : 0);
  return { points, perfect, nextStreak };
}

export function buildBubbleBurstRounds(
  items: readonly ActivityItem[],
  source: BubbleBurstQuestionSource,
  random: () => number = Math.random,
): BubbleBurstRound[] {
  return buildQuizGapArcadeRounds(items, source, 4, random);
}

const BUBBLE_ANCHORS = [
  { x: 20, y: 30 },
  { x: 73, y: 28 },
  { x: 31, y: 72 },
  { x: 76, y: 69 },
] as const;

export function createBubbleBurstLayout(
  optionCount: number,
  random: () => number = Math.random,
): BubbleBurstPosition[] {
  return BUBBLE_ANCHORS.slice(0, Math.max(0, Math.min(optionCount, BUBBLE_ANCHORS.length))).map((anchor, index) => {
    const jitterX = (random() - .5) * 8;
    const jitterY = (random() - .5) * 8;
    return {
      x: Math.max(12, Math.min(88, anchor.x + jitterX)),
      y: Math.max(18, Math.min(82, anchor.y + jitterY)),
      size: Math.round(126 + random() * 32),
      duration: 4.8 + random() * 1.8,
      delay: -(index * .55 + random() * .45),
    };
  });
}

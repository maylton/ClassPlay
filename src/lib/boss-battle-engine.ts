import {
  buildQuizGapArcadeRounds,
  chooseQuizGapArcadeSource,
  type QuizGapArcadeRound,
  type QuizGapArcadeSource,
} from "./derived-arcade-engine";
import { speedBonus } from "./game-engine";
import type { ActivityItem, ActivityKind } from "./types";

export type BossBattleQuestionSource = QuizGapArcadeSource;
export type BossBattleRound = QuizGapArcadeRound;

export type BossBattleHit = {
  correct: boolean;
  critical: boolean;
  damage: number;
  points: number;
  nextStreak: number;
  heartsLost: number;
};

export const BOSS_BATTLE_STARTING_HEARTS = 3;
const BASE_DAMAGE = 110;
const MAX_SPEED_DAMAGE = 170;
const SPEED_FULL_BONUS_UNTIL_MS = 1200;
const SPEED_ZERO_BONUS_AT_MS = 12000;
const CRITICAL_DAMAGE = 50;
const CRITICAL_WINDOW_MS = 1800;

export function bossBattleSubtitle(kind: ActivityKind) {
  if (kind === "grammar") return "Break its rules before it breaks your streak.";
  if (kind === "vocabulary") return "Every word you know weakens the beast.";
  return "One last challenge. No panic allowed.";
}

/**
 * Backward-compatible profile helper for the existing Boss Battle component.
 * Ignis is now the single visual boss; only the pedagogical subtitle varies.
 */
export function bossForKind(kind: ActivityKind) {
  return { name: "Ignis" as const, subtitle: bossBattleSubtitle(kind) };
}

export const chooseBossBattleSource = chooseQuizGapArcadeSource;

export function bossMaxHp(roundCount: number) {
  return Math.max(600, roundCount * 150);
}

export function resolveBossBattleHit(correct: boolean, responseMs: number, streak: number): BossBattleHit {
  if (!correct) return { correct: false, critical: false, damage: 0, points: 0, nextStreak: 0, heartsLost: 1 };
  const nextStreak = streak + 1;
  const speedDamage = speedBonus(
    responseMs,
    MAX_SPEED_DAMAGE,
    SPEED_FULL_BONUS_UNTIL_MS,
    SPEED_ZERO_BONUS_AT_MS,
  );
  const streakDamage = Math.min(Math.max(0, nextStreak - 1), 5) * 15;
  const critical = responseMs <= CRITICAL_WINDOW_MS;
  const damage = BASE_DAMAGE + speedDamage + streakDamage + (critical ? CRITICAL_DAMAGE : 0);
  const points = 100 + speedBonus(responseMs) + Math.min(streak, 5) * 20;
  return { correct: true, critical, damage, points, nextStreak, heartsLost: 0 };
}

export function buildBossBattleRounds(
  items: readonly ActivityItem[],
  source: BossBattleQuestionSource,
  random: () => number = Math.random,
): BossBattleRound[] {
  return buildQuizGapArcadeRounds(items, source, 4, random);
}

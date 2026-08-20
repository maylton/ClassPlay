import {
  buildQuizGapArcadeRounds,
  chooseQuizGapArcadeSource,
  type QuizGapArcadeRound,
  type QuizGapArcadeSource,
} from "./derived-arcade-engine";
import { speedBonus } from "./game-engine";
import type { ActivityItem, ActivityKind } from "./types";

export type TowerStackReward = "normal" | "slow" | "wide" | "perfect";
export type TowerStackRound = QuizGapArcadeRound;
export type TowerBlockGeometry = { x: number; width: number };
export type TowerAnswerResult = { correct: boolean; points: number; nextStreak: number; reward: TowerStackReward };
export type TowerPlacementResult = TowerBlockGeometry & { landed: boolean; perfect: boolean; recovered: boolean; points: number };

export const TOWER_STACK_MIN_PLAYABLE_ITEMS = 3;
export const TOWER_STACK_MIN_BLOCK_WIDTH = 6;
export const TOWER_STACK_FOUNDATION: TowerBlockGeometry = { x: 20, width: 60 };
export const TOWER_STACK_MIN_TIME_WIDTH_PERCENT = 55;
export const TOWER_STACK_SHRINK_WINDOW_MS = 15000;
const FAST_REWARD_MS = 2600;
const PERFECT_ALIGNMENT_PERCENT = 2.25;

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

export function chooseTowerStackSource(kind: ActivityKind, quizCount: number, gapCount: number): QuizGapArcadeSource | null {
  return chooseQuizGapArcadeSource(kind, quizCount, gapCount, TOWER_STACK_MIN_PLAYABLE_ITEMS);
}

export function buildTowerStackRounds(items: readonly ActivityItem[], source: QuizGapArcadeSource, random: () => number = Math.random): TowerStackRound[] {
  return buildQuizGapArcadeRounds(items, source, 4, random);
}

export function towerAnswerWidthPercent(responseMs: number) {
  const progress = clamp(Math.max(0, responseMs) / TOWER_STACK_SHRINK_WINDOW_MS, 0, 1);
  return Math.round(100 - progress * (100 - TOWER_STACK_MIN_TIME_WIDTH_PERCENT));
}

export function towerTimedBlockWidth(baseWidth: number, responseMs: number) {
  const safeBase = clamp(baseWidth, TOWER_STACK_MIN_BLOCK_WIDTH, 88);
  return Math.max(TOWER_STACK_MIN_BLOCK_WIDTH, safeBase * towerAnswerWidthPercent(responseMs) / 100);
}

export function resolveTowerStackAnswer(correct: boolean, responseMs: number, streak: number): TowerAnswerResult {
  if (!correct) return { correct: false, points: 0, nextStreak: 0, reward: "normal" };
  const nextStreak = streak + 1;
  let reward: TowerStackReward = "normal";
  if (nextStreak % 5 === 0) reward = "perfect";
  else if (nextStreak % 3 === 0) reward = "wide";
  else if (responseMs <= FAST_REWARD_MS) reward = "slow";
  const points = 110 + speedBonus(responseMs, 90, 1800, 15000) + Math.min(streak, 5) * 18;
  return { correct: true, points, nextStreak, reward };
}

export function towerActiveBlockWidth(baseWidth: number, reward: TowerStackReward, responseMs = 0) {
  const timedWidth = towerTimedBlockWidth(baseWidth, responseMs);
  return reward === "wide" ? Math.min(82, timedWidth + 14) : timedWidth;
}

export function towerSweepDurationMs(floors: number, reward: TowerStackReward) {
  const normal = Math.max(1450, 3200 - Math.max(0, floors) * 95);
  return reward === "slow" ? Math.round(normal * 1.45) : normal;
}

export function towerMovingBlockX(elapsedMs: number, durationMs: number, width: number) {
  const travel = Math.max(0, 100 - width);
  if (!travel) return 0;
  const duration = Math.max(300, durationMs);
  const phase = ((Math.max(0, elapsedMs) % duration) / duration) * 2;
  const normalized = phase <= 1 ? phase : 2 - phase;
  return clamp(normalized * travel, 0, travel);
}

export function resolveTowerPlacement(base: TowerBlockGeometry, moving: TowerBlockGeometry, reward: TowerStackReward): TowerPlacementResult {
  const baseCenter = base.x + base.width / 2;
  if (reward === "perfect") {
    const width = Math.min(base.width, moving.width);
    return { x: clamp(baseCenter - width / 2, 0, 100 - width), width, landed: true, perfect: true, recovered: false, points: 190 };
  }
  const baseLeft = base.x;
  const baseRight = base.x + base.width;
  const movingLeft = moving.x;
  const movingRight = moving.x + moving.width;
  const overlapLeft = Math.max(baseLeft, movingLeft);
  const overlapRight = Math.min(baseRight, movingRight);
  const overlap = Math.max(0, overlapRight - overlapLeft);
  if (overlap < TOWER_STACK_MIN_BLOCK_WIDTH) return { x: moving.x, width: moving.width, landed: false, perfect: false, recovered: false, points: 0 };
  const movingCenter = moving.x + moving.width / 2;
  const nearlyCentered = Math.abs(baseCenter - movingCenter) <= PERFECT_ALIGNMENT_PERCENT;
  if (nearlyCentered) {
    const recoveredWidth = reward === "wide" ? Math.min(82, moving.width, base.width + 10) : Math.min(base.width, moving.width);
    const x = clamp(baseCenter - recoveredWidth / 2, 0, 100 - recoveredWidth);
    return { x, width: recoveredWidth, landed: true, perfect: true, recovered: recoveredWidth > base.width, points: reward === "wide" ? 175 : 150 };
  }
  if (reward === "wide" && moving.width > base.width && overlap >= base.width * .76) {
    const recoveredWidth = Math.min(82, moving.width, Math.max(overlap, base.width + 6));
    const x = clamp(baseCenter - recoveredWidth / 2, 0, 100 - recoveredWidth);
    return { x, width: recoveredWidth, landed: true, perfect: false, recovered: recoveredWidth > base.width, points: 130 };
  }
  const width = overlap;
  return { x: overlapLeft, width, landed: true, perfect: false, recovered: false, points: 35 + Math.round(width * 1.6) };
}

export function towerHeightMeters(floors: number) { return Math.round(Math.max(0, floors) * 4.2); }
export function towerRank(heightMeters: number) {
  if (heightMeters >= 120) return "Skyline Master";
  if (heightMeters >= 80) return "Skyscraper";
  if (heightMeters >= 40) return "Architect";
  return "Builder";
}

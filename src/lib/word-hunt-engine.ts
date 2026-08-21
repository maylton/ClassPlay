import { buildQuizGapArcadeRounds, chooseQuizGapArcadeSource, type QuizGapArcadeSource } from "./derived-arcade-engine";
import { speedBonus } from "./game-engine";
import type { ActivityItem, ActivityKind } from "./types";

export type WordHuntCell = { row: number; col: number };
export type WordHuntTarget = {
  itemId: string;
  prompt: string;
  displayAnswer: string;
  target: string;
  hint?: string;
  path: WordHuntCell[];
};
export type WordHuntBoard = {
  size: number;
  letters: string[][];
  targets: WordHuntTarget[];
};

const DIRECTIONS = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const WORD_HUNT_MIN_ITEMS = 3;
export const WORD_HUNT_MAX_TARGETS = 8;
export const WORD_HUNT_MAX_WORD_LENGTH = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeWordHuntTarget(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function chooseWordHuntSource(kind: ActivityKind, quizCount: number, gapCount: number) {
  return chooseQuizGapArcadeSource(kind, quizCount, gapCount, WORD_HUNT_MIN_ITEMS);
}

function candidateRounds(items: readonly ActivityItem[], source: QuizGapArcadeSource, random: () => number) {
  const seen = new Set<string>();
  return buildQuizGapArcadeRounds(items, source, 3, random)
    .map((round, order) => ({
      ...round,
      order,
      target: normalizeWordHuntTarget(round.correctAnswer),
    }))
    .filter((round) => {
      if (round.target.length < 3 || round.target.length > WORD_HUNT_MAX_WORD_LENGTH || seen.has(round.target)) return false;
      seen.add(round.target);
      return true;
    })
    .slice(0, WORD_HUNT_MAX_TARGETS);
}

function cellsForPlacement(word: string, size: number, random: () => number) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const [dr, dc] = DIRECTIONS[Math.floor(random() * DIRECTIONS.length)] ?? DIRECTIONS[0];
    const row = Math.floor(random() * size);
    const col = Math.floor(random() * size);
    const endRow = row + dr * (word.length - 1);
    const endCol = col + dc * (word.length - 1);
    if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
    return Array.from({ length: word.length }, (_, index) => ({ row: row + dr * index, col: col + dc * index }));
  }
  return null;
}

export function buildWordHuntBoard(
  items: readonly ActivityItem[],
  source: QuizGapArcadeSource,
  random: () => number = Math.random,
): WordHuntBoard | null {
  const candidates = candidateRounds(items, source, random);
  if (candidates.length < WORD_HUNT_MIN_ITEMS) return null;

  const longest = Math.max(...candidates.map((round) => round.target.length));
  const size = clamp(Math.max(9, longest + 1), 9, 12);
  const letters = Array.from({ length: size }, () => Array<string>(size).fill(""));
  const placed: WordHuntTarget[] = [];

  for (const round of [...candidates].sort((a, b) => b.target.length - a.target.length)) {
    let successfulPath: WordHuntCell[] | null = null;
    for (let attempt = 0; attempt < 140 && !successfulPath; attempt += 1) {
      const path = cellsForPlacement(round.target, size, random);
      if (!path) continue;
      const compatible = path.every((cell, index) => {
        const current = letters[cell.row]?.[cell.col] ?? "";
        return !current || current === round.target[index];
      });
      if (compatible) successfulPath = path;
    }
    if (!successfulPath) continue;
    successfulPath.forEach((cell, index) => { letters[cell.row][cell.col] = round.target[index] ?? ""; });
    placed.push({
      itemId: round.itemId,
      prompt: round.prompt,
      displayAnswer: round.correctAnswer,
      target: round.target,
      hint: round.hint,
      path: successfulPath,
    });
  }

  if (placed.length < WORD_HUNT_MIN_ITEMS) return null;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!letters[row][col]) letters[row][col] = ALPHABET[Math.floor(random() * ALPHABET.length)] ?? "A";
    }
  }

  const order = new Map(candidates.map((round) => [round.itemId, round.order]));
  placed.sort((a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0));
  return { size, letters, targets: placed };
}

export function wordHuntPathBetween(start: WordHuntCell, end: WordHuntCell, size: number) {
  const rowDelta = end.row - start.row;
  const colDelta = end.col - start.col;
  const absRow = Math.abs(rowDelta);
  const absCol = Math.abs(colDelta);
  if (!(rowDelta === 0 || colDelta === 0 || absRow === absCol)) return [];
  const length = Math.max(absRow, absCol) + 1;
  if (length < 2 || length > size) return [];
  const dr = Math.sign(rowDelta);
  const dc = Math.sign(colDelta);
  return Array.from({ length }, (_, index) => ({ row: start.row + dr * index, col: start.col + dc * index }));
}

function samePath(left: readonly WordHuntCell[], right: readonly WordHuntCell[]) {
  return left.length === right.length && left.every((cell, index) => cell.row === right[index]?.row && cell.col === right[index]?.col);
}

export function wordHuntSelectionMatches(selection: readonly WordHuntCell[], target: readonly WordHuntCell[]) {
  return samePath(selection, target) || samePath(selection, [...target].reverse());
}

export function resolveWordHuntFind(elapsedMs: number, streak: number, usedHint: boolean) {
  const base = 160 + speedBonus(elapsedMs, 150, 1600, 18000) + Math.min(streak, 6) * 22;
  const points = Math.max(60, base - (usedHint ? 70 : 0));
  return { points, nextStreak: streak + 1 };
}

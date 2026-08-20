import { shuffle } from "./game-engine";

export const MEMORY_MIN_PAIRS = 2;
export const MEMORY_MAX_PAIRS = 20;
export const MEMORY_BOARD_PAIR_SIZES = [4, 6, 8, 10, 12, 16, 20] as const;

export function memoryBoardPairCount(availablePairs: number) {
  const available = Math.max(0, Math.floor(availablePairs));
  if (available < MEMORY_MIN_PAIRS) return available;
  if (available < MEMORY_BOARD_PAIR_SIZES[0]) return available;

  let selected: number = MEMORY_BOARD_PAIR_SIZES[0];
  for (const size of MEMORY_BOARD_PAIR_SIZES) {
    if (size > available) break;
    selected = size;
  }
  return Math.min(selected, MEMORY_MAX_PAIRS);
}

function sameIdSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

/**
 * Chooses the pairs for one Memory board. When more content exists than fits
 * the board, selection is randomized. A replay also avoids repeating the exact
 * same subset when at least one unused pair is available.
 */
export function chooseMemoryItems<T extends { id: string }>(
  items: readonly T[],
  previousPairIds: readonly string[] = [],
  random: () => number = Math.random,
) {
  const pairCount = memoryBoardPairCount(items.length);
  if (!pairCount) return [];

  const shuffled = shuffle(items, random);
  const selected = shuffled.slice(0, pairCount);
  const selectedIds = selected.map((item) => item.id);

  if (items.length > pairCount && sameIdSet(selectedIds, previousPairIds)) {
    const selectedSet = new Set(selectedIds);
    const replacement = shuffled.find((item) => !selectedSet.has(item.id));
    if (replacement) selected[selected.length - 1] = replacement;
  }

  return selected;
}

export function memoryGridColumns(pairCount: number) {
  if (pairCount <= 8) return 4;
  if (pairCount <= 10) return 5;
  if (pairCount <= 12) return 6;
  return 8;
}

export function memoryCardMinHeight(pairCount: number) {
  if (pairCount <= 8) return 130;
  if (pairCount <= 10) return 116;
  if (pairCount <= 12) return 106;
  if (pairCount <= 16) return 96;
  return 88;
}

export function memoryCardFontSize(pairCount: number) {
  if (pairCount <= 8) return 0.92;
  if (pairCount <= 12) return 0.82;
  if (pairCount <= 16) return 0.76;
  return 0.7;
}

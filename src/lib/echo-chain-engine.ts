import { shuffle } from "./game-engine";
import type { ActivityItem } from "./types";

export type EchoChainDifficulty = "easy" | "medium" | "challenge";

export type EchoChainItem = {
  itemId: string;
  spokenText: string;
  tileText: string;
  imageUrl?: string;
};

export type EchoChainRound = {
  id: string;
  itemIds: string[];
};

export type EchoChainGame = {
  board: EchoChainItem[];
  rounds: EchoChainRound[];
};

export const ECHO_CHAIN_MIN_ITEMS = 6;
export const ECHO_CHAIN_MAX_ITEMS = 9;

export const ECHO_CHAIN_DIFFICULTIES = {
  easy: {
    label: "Easy",
    description: "Hear one echo at a time, then finish with short pairs.",
    pattern: [1, 1, 1, 1, 2, 2],
    maxWords: 14,
    scoreMultiplier: 0.85,
  },
  medium: {
    label: "Medium",
    description: "Listen for growing chains of up to three language cues.",
    pattern: [1, 1, 2, 2, 3, 3],
    maxWords: 20,
    scoreMultiplier: 0.95,
  },
  challenge: {
    label: "Challenge",
    description: "Hold longer audio chains in memory and replay them in order.",
    pattern: [1, 2, 2, 3, 3, 4],
    maxWords: 28,
    scoreMultiplier: 1,
  },
} as const satisfies Record<EchoChainDifficulty, {
  label: string;
  description: string;
  pattern: readonly number[];
  maxWords: number;
  scoreMultiplier: number;
}>;

function clean(value?: string) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value: string) {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function speechReady(value: string) {
  const words = wordCount(value);
  return value.length >= 2
    && value.length <= 180
    && words >= 1
    && words <= 24
    && /[a-z]/i.test(value)
    && !/https?:\/\/|www\.|_{2,}|\|/.test(value);
}

function sentenceFromParts(parts?: string[]) {
  return (parts ?? []).map(clean).filter(Boolean).join(" ").replace(/\s+([,.!?])/g, "$1");
}

function bestSpokenText(item: ActivityItem) {
  const candidates = [
    clean(item.example),
    sentenceFromParts(item.sentenceParts),
    clean(item.prompt),
    clean(item.answer),
  ];
  return candidates.find(speechReady) ?? "";
}

function tileTextFor(item: ActivityItem, spokenText: string) {
  const answer = clean(item.answer);
  const prompt = clean(item.prompt);
  if (answer && normalized(answer) !== normalized(spokenText)) return answer;
  if (prompt && normalized(prompt) !== normalized(spokenText)) return prompt;
  return answer || prompt;
}

export function buildEchoChainItems(items: readonly ActivityItem[]) {
  const seenLabels = new Set<string>();
  const ready: EchoChainItem[] = [];
  for (const item of items) {
    if (!clean(item.prompt) || !clean(item.answer)) continue;
    const spokenText = bestSpokenText(item);
    const tileText = tileTextFor(item, spokenText);
    const labelKey = normalized(tileText);
    if (!spokenText || !tileText || tileText.length > 96 || !labelKey || seenLabels.has(labelKey)) continue;
    seenLabels.add(labelKey);
    ready.push({ itemId: item.id, spokenText, tileText, imageUrl: item.imageUrl });
  }
  return ready;
}

function takeSequence(
  board: readonly EchoChainItem[],
  desired: number,
  maxWords: number,
  cursor: number,
) {
  const itemIds: string[] = [];
  let words = 0;
  let offset = 0;
  while (itemIds.length < desired && offset < board.length * 2) {
    const item = board[(cursor + offset) % board.length];
    const nextWords = wordCount(item.spokenText);
    if (!itemIds.includes(item.itemId) && (itemIds.length === 0 || words + nextWords <= maxWords)) {
      itemIds.push(item.itemId);
      words += nextWords;
    }
    offset += 1;
  }
  return itemIds;
}

export function buildEchoChainGame(
  items: readonly ActivityItem[],
  difficulty: EchoChainDifficulty,
  random: () => number = Math.random,
): EchoChainGame | null {
  const ready = buildEchoChainItems(items);
  if (ready.length < ECHO_CHAIN_MIN_ITEMS) return null;
  const board = shuffle(ready, random).slice(0, ECHO_CHAIN_MAX_ITEMS);
  const config = ECHO_CHAIN_DIFFICULTIES[difficulty];
  const rounds = config.pattern.map((desired, index) => ({
    id: `echo-${index + 1}`,
    itemIds: takeSequence(board, Math.min(desired, board.length), config.maxWords, index * 2),
  }));
  return rounds.every((round) => round.itemIds.length > 0) ? { board, rounds } : null;
}

export function echoChainMatches(selected: readonly string[], expected: readonly string[]) {
  return selected.length === expected.length && selected.every((itemId, index) => itemId === expected[index]);
}

export function resolveEchoChainRound({
  correct,
  responseMs,
  streak,
  replays,
  sequenceLength,
  difficulty,
}: {
  correct: boolean;
  responseMs: number;
  streak: number;
  replays: number;
  sequenceLength: number;
  difficulty: EchoChainDifficulty;
}) {
  if (!correct) return { points: 0, nextStreak: 0 };
  const config = ECHO_CHAIN_DIFFICULTIES[difficulty];
  const base = 170 * sequenceLength;
  const speed = Math.max(0, 120 * sequenceLength - Math.floor(responseMs / 85));
  const memory = Math.max(0, sequenceLength - 1) * 85;
  const streakBonus = Math.min(6, streak) * 28;
  const replayPenalty = replays * 55;
  const points = Math.max(80, Math.round((base + speed + memory + streakBonus - replayPenalty) * config.scoreMultiplier));
  return { points, nextStreak: streak + 1 };
}

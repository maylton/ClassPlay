import { buildQuizGapArcadeRounds, chooseQuizGapArcadeSource, type QuizGapArcadeSource } from "./derived-arcade-engine";
import { speedBonus } from "./game-engine";
import type { ActivityItem, ActivityKind } from "./types";

export type TypingRushRound = {
  itemId: string;
  source: QuizGapArcadeSource;
  prompt: string;
  correctAnswer: string;
  hint?: string;
};

export const TYPING_RUSH_MIN_ITEMS = 3;
export const TYPING_RUSH_ROUND_MS = 16000;

export function chooseTypingRushSource(kind: ActivityKind, quizCount: number, gapCount: number) {
  return chooseQuizGapArcadeSource(kind, quizCount, gapCount, TYPING_RUSH_MIN_ITEMS);
}

export function buildTypingRushRounds(
  items: readonly ActivityItem[],
  source: QuizGapArcadeSource,
  random: () => number = Math.random,
): TypingRushRound[] {
  return buildQuizGapArcadeRounds(items, source, 3, random).map(({ itemId, prompt, correctAnswer, hint }) => ({
    itemId,
    source,
    prompt,
    correctAnswer,
    hint,
  }));
}

export function normalizeTypedAnswer(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function typingRushIsCorrect(input: string, answer: string) {
  const normalizedInput = normalizeTypedAnswer(input);
  const normalizedAnswer = normalizeTypedAnswer(answer);
  return Boolean(normalizedInput) && normalizedInput === normalizedAnswer;
}

function levenshtein(left: string, right: string) {
  const a = normalizeTypedAnswer(left);
  const b = normalizeTypedAnswer(right);
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j] ?? 0;
      const insertion = (previous[j - 1] ?? 0) + 1;
      const deletion = saved + 1;
      const substitution = diagonal + (a[i - 1] === b[j - 1] ? 0 : 1);
      previous[j] = Math.min(insertion, deletion, substitution);
      diagonal = saved;
    }
  }
  return previous[b.length] ?? 0;
}

export function typingRushIsNearMiss(input: string, answer: string) {
  const normalized = normalizeTypedAnswer(answer);
  if (normalized.length < 4 || typingRushIsCorrect(input, answer)) return false;
  const allowed = normalized.length >= 10 ? 2 : 1;
  return levenshtein(input, answer) <= allowed;
}

export function typingRushTimePercent(elapsedMs: number) {
  return Math.max(0, Math.min(100, Math.round((1 - Math.max(0, elapsedMs) / TYPING_RUSH_ROUND_MS) * 100)));
}

export function resolveTypingRushCorrect(elapsedMs: number, streak: number, attempt: number) {
  const attemptPenalty = attempt > 1 ? 70 : 0;
  const points = Math.max(80, 170 + speedBonus(elapsedMs, 180, 1700, TYPING_RUSH_ROUND_MS) + Math.min(streak, 6) * 24 - attemptPenalty);
  return { points, nextStreak: streak + 1 };
}

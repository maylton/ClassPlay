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

export type TypedAnswerOptions = {
  /** Keep accents significant ("está" ≠ "esta"). */
  strictAccents?: boolean;
  /** Other answers that also count as correct. */
  acceptedAnswers?: readonly string[];
};

/**
 * Case-, punctuation- and spacing-insensitive form of a typed answer. Works for
 * any script: letters (\p{L}) and combining marks (\p{M}, e.g. Japanese dakuten
 * or Devanagari vowel signs) are kept; only Latin diacritics are dropped, and
 * only when accents are not strict.
 */
export function normalizeTypedAnswer(value: string, strictAccents = false) {
  const composed = strictAccents ? value.normalize("NFC") : value.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return composed
    .toLocaleLowerCase()
    .replace(/[’'ʼ`]/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function answerCandidates(answer: string, options: TypedAnswerOptions) {
  return [answer, ...(options.acceptedAnswers ?? [])].filter((candidate) => candidate.trim());
}

export function typingRushIsCorrect(input: string, answer: string, options: TypedAnswerOptions = {}) {
  const normalizedInput = normalizeTypedAnswer(input, options.strictAccents);
  return Boolean(normalizedInput) && answerCandidates(answer, options).some((candidate) => normalizeTypedAnswer(candidate, options.strictAccents) === normalizedInput);
}

function levenshtein(left: string, right: string, strictAccents = false) {
  const a = normalizeTypedAnswer(left, strictAccents);
  const b = normalizeTypedAnswer(right, strictAccents);
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

export function typingRushIsNearMiss(input: string, answer: string, options: TypedAnswerOptions = {}) {
  if (typingRushIsCorrect(input, answer, options)) return false;
  return answerCandidates(answer, options).some((candidate) => {
    const normalized = normalizeTypedAnswer(candidate, options.strictAccents);
    if (normalized.length < 4) return false;
    const allowed = normalized.length >= 10 ? 2 : 1;
    return levenshtein(input, candidate, options.strictAccents) <= allowed;
  });
}

export function typingRushTimePercent(elapsedMs: number) {
  return Math.max(0, Math.min(100, Math.round((1 - Math.max(0, elapsedMs) / TYPING_RUSH_ROUND_MS) * 100)));
}

export function resolveTypingRushCorrect(elapsedMs: number, streak: number, attempt: number) {
  const attemptPenalty = attempt > 1 ? 70 : 0;
  const points = Math.max(80, 170 + speedBonus(elapsedMs, 180, 1700, TYPING_RUSH_ROUND_MS) + Math.min(streak, 6) * 24 - attemptPenalty);
  return { points, nextStreak: streak + 1 };
}

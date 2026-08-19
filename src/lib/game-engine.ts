import type { ActivityItem } from "./types";

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
}

export function isCorrectAnswer(input: string, expected: string) {
  return normalizeAnswer(input) === normalizeAnswer(expected);
}

/**
 * Shared multiple-choice safety layer. The correct answer is inserted only
 * after distractors have been selected, so shuffling/truncation can never
 * remove it. Curated item distractors take priority; pool values are only a
 * fallback for user-created activities that do not provide enough choices.
 */
export function buildChoiceOptions(
  correctAnswer: string,
  curatedDistractors: readonly string[] = [],
  fallbackDistractors: readonly string[] = [],
  optionCount = 4,
  random: () => number = Math.random,
) {
  const correct = correctAnswer.trim();
  if (!correct) return [];
  const correctKey = normalizeAnswer(correct);
  const seen = new Set([correctKey]);

  function uniqueCandidates(values: readonly string[]) {
    const result: string[] = [];
    for (const raw of values) {
      const value = raw.trim();
      const key = normalizeAnswer(value);
      if (!value || !key || seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
    return result;
  }

  const curated = uniqueCandidates(curatedDistractors);
  const fallback = uniqueCandidates(fallbackDistractors);
  const distractors = [
    ...shuffle(curated, random),
    ...shuffle(fallback, random),
  ].slice(0, Math.max(0, optionCount - 1));

  return shuffle([correct, ...distractors], random);
}

export function quizOptions(item: ActivityItem, pool: readonly ActivityItem[] = [], random: () => number = Math.random) {
  const fallback = pool.filter((candidate) => candidate.id !== item.id).map((candidate) => candidate.answer);
  return buildChoiceOptions(item.answer, item.distractors ?? [], fallback, 4, random);
}

export function gapOptions(item: ActivityItem, pool: readonly ActivityItem[] = [], random: () => number = Math.random) {
  const correct = sentenceGapAnswer(item);
  const fallback = pool.filter((candidate) => candidate.id !== item.id).map(sentenceGapAnswer);
  return buildChoiceOptions(correct, item.distractors ?? [], fallback, 4, random);
}

function singleGapParts(value?: string) {
  const sentence = value ?? "";
  const matches = Array.from(sentence.matchAll(/_{2,}/g));
  if (matches.length !== 1) return null;
  const match = matches[0];
  const start = match.index ?? 0;
  const end = start + match[0].length;
  return { before: sentence.slice(0, start), after: sentence.slice(end) };
}

export function sentenceGapAnswer(item: ActivityItem) {
  const parts = singleGapParts(item.gapSentence);
  const example = item.example?.trim() ?? "";

  if (parts && example.startsWith(parts.before) && example.endsWith(parts.after)) {
    const start = parts.before.length;
    const end = example.length - parts.after.length;
    const extracted = example.slice(start, end).trim().replace(/^[,.;:!?\s]+|[,.;:!?\s]+$/g, "");
    if (extracted) return extracted;
  }

  // If the sentence/example pair cannot be aligned, prefer the explicit target
  // over the prompt. This keeps legacy content playable while the editor flags
  // structurally ambiguous items for revision.
  return item.answer?.trim() || item.prompt?.trim() || "";
}

export function sentenceAnswer(item: ActivityItem) {
  return (item.sentenceParts ?? []).join(" ").replace(/\s+([,.!?])/g, "$1");
}

/**
 * Sentence Builder intentionally exposes one draggable token per written word.
 * Punctuation stays attached to the word it follows (for example `school.`),
 * while contractions such as `don't` remain a single natural English word.
 */
export function sentenceWords(item: ActivityItem) {
  return sentenceAnswer(item).trim().split(/\s+/).filter(Boolean);
}

export function scoreFor(correct: boolean, streak: number) {
  if (!correct) return 0;
  return 100 + Math.min(streak, 5) * 20;
}

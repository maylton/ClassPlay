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

export function quizOptions(item: ActivityItem) {
  const options = [item.prompt, ...(item.distractors ?? [])].filter(Boolean);
  return shuffle(Array.from(new Set(options))).slice(0, 4);
}

/**
 * Gap Fill options must always contain the correct answer. Older versions mixed
 * answers from other items into the candidate pool and shuffled before slicing,
 * which could remove the correct answer entirely. Keep each question local:
 * one correct answer plus up to three curated distractors from that item.
 */
export function gapOptions(item: ActivityItem) {
  const correct = sentenceGapAnswer(item);
  const correctKey = normalizeAnswer(correct);
  const distractors = Array.from(
    new Map(
      (item.distractors ?? [])
        .filter(Boolean)
        .filter((value) => normalizeAnswer(value) !== correctKey)
        .map((value) => [normalizeAnswer(value), value] as const),
    ).values(),
  );
  return shuffle([correct, ...shuffle(distractors).slice(0, 3)]);
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

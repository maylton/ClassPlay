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

export function gapOptions(item: ActivityItem) {
  const correct = sentenceGapAnswer(item);
  const options = [correct, ...(item.distractors ?? [])].filter(Boolean);
  return shuffle(Array.from(new Set(options))).slice(0, 4);
}

export function sentenceGapAnswer(item: ActivityItem) {
  if (!item.gapSentence || !item.example) return item.prompt;
  const [before = "", after = ""] = item.gapSentence.split("_____");
  const normalizedBefore = before.trim();
  const normalizedAfter = after.trim();
  let answer = item.example;
  if (normalizedBefore && answer.startsWith(normalizedBefore)) {
    answer = answer.slice(normalizedBefore.length).trim();
  }
  if (normalizedAfter && answer.endsWith(normalizedAfter)) {
    answer = answer.slice(0, answer.length - normalizedAfter.length).trim();
  }
  return answer.replace(/^[,.;:!?\s]+|[,.;:!?\s]+$/g, "") || item.prompt;
}

export function sentenceAnswer(item: ActivityItem) {
  return (item.sentenceParts ?? []).join(" ").replace(/\s+([,.!?])/g, "$1");
}

export function scoreFor(correct: boolean, streak: number) {
  if (!correct) return 0;
  return 100 + Math.min(streak, 5) * 20;
}

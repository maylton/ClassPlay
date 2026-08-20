import {
  buildChoiceOptions,
  sentenceGapAnswer,
  shouldUseCuratedQuizDistractors,
  shuffle,
} from "./game-engine";
import type { ActivityItem, ActivityKind } from "./types";

export type QuizGapArcadeSource = "gap-fill" | "quiz";

export type QuizGapArcadeRound = {
  itemId: string;
  source: QuizGapArcadeSource;
  prompt: string;
  correctAnswer: string;
  options: string[];
  hint?: string;
};

export function chooseQuizGapArcadeSource(
  kind: ActivityKind,
  quizCount: number,
  gapCount: number,
  minimumItems = 3,
): QuizGapArcadeSource | null {
  if (quizCount < minimumItems && gapCount < minimumItems) return null;
  if (kind === "grammar" && gapCount >= minimumItems) return "gap-fill";
  if (kind === "vocabulary" && quizCount >= minimumItems) return "quiz";
  if (quizCount >= gapCount && quizCount >= minimumItems) return "quiz";
  return gapCount >= minimumItems ? "gap-fill" : "quiz";
}

function quizGapChoiceOptions(
  item: ActivityItem,
  pool: readonly ActivityItem[],
  source: QuizGapArcadeSource,
  optionCount: number,
  random: () => number,
) {
  if (source === "gap-fill") {
    const correctAnswer = sentenceGapAnswer(item);
    const fallback = pool
      .filter((candidate) => candidate.id !== item.id)
      .map(sentenceGapAnswer);
    return buildChoiceOptions(
      correctAnswer,
      item.distractors ?? [],
      fallback,
      optionCount,
      random,
    );
  }

  const correctAnswer = item.answer.trim();
  const fallback = pool
    .filter((candidate) => candidate.id !== item.id)
    .map((candidate) => candidate.answer);
  const curated = shouldUseCuratedQuizDistractors(item) ? (item.distractors ?? []) : [];
  return buildChoiceOptions(correctAnswer, curated, fallback, optionCount, random);
}

export function buildQuizGapArcadeRounds(
  items: readonly ActivityItem[],
  source: QuizGapArcadeSource,
  optionCount: number,
  random: () => number = Math.random,
): QuizGapArcadeRound[] {
  return shuffle(items, random)
    .map((item) => {
      const correctAnswer = source === "gap-fill"
        ? sentenceGapAnswer(item)
        : item.answer.trim();
      const options = quizGapChoiceOptions(item, items, source, optionCount, random);
      return {
        itemId: item.id,
        source,
        prompt: source === "gap-fill"
          ? (item.gapSentence ?? item.example ?? item.prompt)
          : item.prompt,
        correctAnswer,
        options,
        hint: item.hint,
      };
    })
    .filter((round) => Boolean(round.correctAnswer) && round.options.includes(round.correctAnswer));
}

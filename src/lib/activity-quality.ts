import { normalizeAnswer } from "./game-engine";
import type { ActivityItem } from "./types";

export type QualityWarning = {
  /** 1-based item numbers the warning refers to, as shown in the editor. */
  items: number[];
  message: string;
};

function clean(value?: string) {
  return (value ?? "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive containment that works for any script. */
function containsPhrase(text: string, phrase: string) {
  const needle = normalizeAnswer(phrase);
  if (needle.length < 3) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}($|[^\\p{L}\\p{N}])`, "u").test(normalizeAnswer(text));
}

function list(numbers: number[]) {
  return numbers.length === 2 ? `${numbers[0]} and ${numbers[1]}` : `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/**
 * Content problems that make a game confusing or give the answer away. These
 * are advice for the teacher, not save blockers.
 */
export function analyzeActivityQuality(items: readonly ActivityItem[]): QualityWarning[] {
  const warnings: QualityWarning[] = [];
  const answerGroups = new Map<string, number[]>();

  items.forEach((item, index) => {
    const number = index + 1;
    const prompt = clean(item.prompt);
    const answer = clean(item.answer);
    const hasSentence = Boolean(clean(item.example) || (item.sentenceParts ?? []).some((part) => clean(part)));
    if (!prompt && !answer && !hasSentence) return;

    if ((prompt && !answer && !hasSentence) || (!prompt && answer && !hasSentence && !item.imageUrl)) {
      warnings.push({ items: [number], message: `Item ${number} has only one side, so pair games will skip it.` });
      return;
    }
    if (prompt && answer && normalizeAnswer(prompt) === normalizeAnswer(answer)) {
      warnings.push({ items: [number], message: `Item ${number} has the same prompt and answer, so pair games will skip it.` });
    }

    if (answer) {
      const key = normalizeAnswer(answer);
      answerGroups.set(key, [...(answerGroups.get(key) ?? []), number]);
      if (prompt && !/_{2,}/.test(prompt) && normalizeAnswer(prompt) !== key && containsPhrase(prompt, answer)) {
        warnings.push({ items: [number], message: `Item ${number}: the answer “${answer}” appears in the prompt.` });
      }
      if (clean(item.hint) && containsPhrase(item.hint!, answer)) {
        warnings.push({ items: [number], message: `Item ${number}: the hint gives away the answer “${answer}”.` });
      }
    }

    const correctKeys = new Set([answer, ...(item.acceptedAnswers ?? [])].map(normalizeAnswer).filter(Boolean));
    const clash = (item.distractors ?? []).find((distractor) => correctKeys.has(normalizeAnswer(distractor)));
    if (clash) {
      warnings.push({ items: [number], message: `Item ${number}: the distractor “${clean(clash)}” is also a correct answer.` });
    }
  });

  for (const [, numbers] of answerGroups) {
    if (numbers.length < 2) continue;
    const answer = clean(items[numbers[0] - 1].answer);
    warnings.push({
      items: numbers,
      message: `Items ${list(numbers)} share the answer “${answer}”. In Matching and Memory students cannot tell those cards apart.`,
    });
  }

  return warnings.sort((a, b) => a.items[0] - b.items[0]);
}

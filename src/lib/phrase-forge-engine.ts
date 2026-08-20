import { isCorrectAnswer, sentenceAnswer, shuffle, speedBonus } from "./game-engine";
import { sentenceWordTokens, type WordToken } from "./word-token-engine";
import type { ActivityItem } from "./types";

export type PhraseForgeRound = {
  itemId: string;
  target: string;
  tokens: WordToken[];
  hint?: string;
};

export type PhraseForgeResult = {
  correct: boolean;
  points: number;
  nextStreak: number;
  nextHeat: number;
  masterForge: boolean;
};

export const PHRASE_FORGE_STARTING_HEAT = 34;
export const PHRASE_FORGE_WRONG_HEAT_LOSS = 14;
const MASTER_FORGE_MS = 3200;

export function buildPhraseForgeRounds(
  items: readonly ActivityItem[],
  random: () => number = Math.random,
): PhraseForgeRound[] {
  return shuffle(items, random)
    .map((item) => ({
      itemId: item.id,
      target: sentenceAnswer(item),
      tokens: shuffle(sentenceWordTokens(item, "forge"), random),
      hint: item.hint,
    }))
    .filter((round) => Boolean(round.target) && round.tokens.length >= 2);
}

export function phraseForgeAnswer(tokens: readonly WordToken[]) {
  return tokens.map((token) => token.text).join(" ");
}

export function phraseForgeIsCorrect(tokens: readonly WordToken[], target: string) {
  return isCorrectAnswer(phraseForgeAnswer(tokens), target);
}

export function phraseForgeHeatLabel(heat: number) {
  if (heat >= 88) return "MOLTEN";
  if (heat >= 68) return "BLAZING";
  if (heat >= 48) return "HOT";
  return "WARMING UP";
}

export function resolvePhraseForgeAttempt(input: {
  correct: boolean;
  responseMs: number;
  streak: number;
  previousMistakes: number;
  heat: number;
}): PhraseForgeResult {
  const { correct, responseMs, streak, previousMistakes, heat } = input;
  if (!correct) {
    return {
      correct: false,
      points: 0,
      nextStreak: 0,
      nextHeat: Math.max(0, heat - PHRASE_FORGE_WRONG_HEAT_LOSS),
      masterForge: false,
    };
  }

  const nextStreak = streak + 1;
  const speed = speedBonus(responseMs, 100, 1800, 15000);
  const retryPenalty = Math.min(previousMistakes, 4) * 18;
  const streakBonus = Math.min(streak, 5) * 20;
  const points = Math.max(80, 120 + speed + streakBonus - retryPenalty);
  const masterForge = previousMistakes === 0 && responseMs <= MASTER_FORGE_MS;
  const heatGain = 12 + Math.round(speed / 16) + Math.min(streak, 4) * 2 + (masterForge ? 7 : 0);

  return {
    correct: true,
    points,
    nextStreak,
    nextHeat: Math.min(100, heat + heatGain),
    masterForge,
  };
}

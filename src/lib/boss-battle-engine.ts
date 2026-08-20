import { gapOptions, quizOptions, sentenceGapAnswer, shuffle, speedBonus } from "./game-engine";
import type { ActivityItem, ActivityKind } from "./types";

export type BossBattleQuestionSource = "gap-fill" | "quiz";
export type BossBattleBossId = "grammar-golem" | "vocabulary-dragon" | "final-exam-bot";

export type BossBattleRound = {
  itemId: string;
  source: BossBattleQuestionSource;
  prompt: string;
  correctAnswer: string;
  options: string[];
  hint?: string;
};

export type BossBattleBoss = {
  id: BossBattleBossId;
  name: string;
  subtitle: string;
};

export type BossBattleHit = {
  correct: boolean;
  critical: boolean;
  damage: number;
  points: number;
  nextStreak: number;
  heartsLost: number;
};

export const BOSS_BATTLE_STARTING_HEARTS = 3;
const BASE_DAMAGE = 120;
const CRITICAL_DAMAGE = 60;
const CRITICAL_WINDOW_MS = 2200;

export function bossForKind(kind: ActivityKind): BossBattleBoss {
  if (kind === "grammar") return { id: "grammar-golem", name: "Grammar Golem", subtitle: "Break its rules before it breaks your streak." };
  if (kind === "vocabulary") return { id: "vocabulary-dragon", name: "Vocabulary Dragon", subtitle: "Every word you know weakens the beast." };
  return { id: "final-exam-bot", name: "Final Exam Bot", subtitle: "One last challenge. No panic allowed." };
}

export function chooseBossBattleSource(kind: ActivityKind, quizCount: number, gapCount: number): BossBattleQuestionSource | null {
  if (quizCount < 3 && gapCount < 3) return null;
  if (kind === "grammar" && gapCount >= 3) return "gap-fill";
  if (kind === "vocabulary" && quizCount >= 3) return "quiz";
  if (gapCount >= quizCount && gapCount >= 3) return "gap-fill";
  return quizCount >= 3 ? "quiz" : "gap-fill";
}

export function bossMaxHp(roundCount: number) {
  return Math.max(600, roundCount * 150);
}

export function resolveBossBattleHit(correct: boolean, responseMs: number, streak: number): BossBattleHit {
  if (!correct) return { correct: false, critical: false, damage: 0, points: 0, nextStreak: 0, heartsLost: 1 };
  const nextStreak = streak + 1;
  const speed = speedBonus(responseMs, 80);
  const streakDamage = Math.min(Math.max(0, nextStreak - 1), 5) * 15;
  const critical = responseMs <= CRITICAL_WINDOW_MS;
  const damage = BASE_DAMAGE + speed + streakDamage + (critical ? CRITICAL_DAMAGE : 0);
  const points = 100 + speedBonus(responseMs) + Math.min(streak, 5) * 20;
  return { correct: true, critical, damage, points, nextStreak, heartsLost: 0 };
}

export function buildBossBattleRounds(
  items: readonly ActivityItem[],
  source: BossBattleQuestionSource,
  random: () => number = Math.random,
): BossBattleRound[] {
  return shuffle(items, random).map((item) => {
    if (source === "gap-fill") {
      const correctAnswer = sentenceGapAnswer(item);
      return {
        itemId: item.id,
        source,
        prompt: item.gapSentence ?? item.example ?? item.prompt,
        correctAnswer,
        options: gapOptions(item, items, random),
        hint: item.hint,
      };
    }
    return {
      itemId: item.id,
      source,
      prompt: item.prompt,
      correctAnswer: item.answer.trim(),
      options: quizOptions(item, items, random),
      hint: item.hint,
    };
  }).filter((round) => Boolean(round.correctAnswer) && round.options.includes(round.correctAnswer));
}

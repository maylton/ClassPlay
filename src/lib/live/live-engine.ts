import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { gapOptions, quizOptions, sentenceGapAnswer } from "@/lib/game-engine";
import type { ActivitySet, GameType, LiveQuestion } from "@/lib/types";

export type LiveGameMode = Extract<GameType, "gap-fill" | "quiz" | "space-blaster">;

export const LIVE_GAME_MODES: readonly LiveGameMode[] = ["gap-fill", "quiz", "space-blaster"];

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export type HostLiveQuestion = LiveQuestion & { correctAnswer: string };

export function liveModeItems(activity: ActivitySet, gameMode: LiveGameMode) {
  return getPlayableItemsForMode(activity.items, gameMode);
}

export function liveModeQuestionCount(activity: ActivitySet, gameMode: LiveGameMode) {
  return liveModeItems(activity, gameMode).length;
}

export function buildLiveQuestion(activity: ActivitySet, index: number, gameMode: LiveGameMode = "quiz"): HostLiveQuestion {
  const items = liveModeItems(activity, gameMode);
  const item = items[index];
  if (!item) throw new Error("Live question index is outside the selected game mode.");

  const usesGap = gameMode === "gap-fill" || gameMode === "space-blaster";
  const correctAnswer = usesGap ? sentenceGapAnswer(item) : item.answer;
  const options = usesGap ? gapOptions(item, items) : quizOptions(item, items);

  return {
    itemId: item.id,
    index,
    total: items.length,
    gameMode,
    prompt: usesGap ? item.gapSentence! : item.prompt,
    hint: item.hint,
    imageUrl: item.imageUrl,
    options,
    startedAt: new Date().toISOString(),
    correctAnswer,
  };
}

export function publicLiveQuestion(question: HostLiveQuestion): LiveQuestion {
  const publicQuestion = { ...question } as Partial<HostLiveQuestion>;
  delete publicQuestion.correctAnswer;
  return publicQuestion as LiveQuestion;
}

export function teamScore(players: { teamId?: string | null; score: number }[], teamId: string) {
  return players.filter((player) => player.teamId === teamId).reduce((sum, player) => sum + player.score, 0);
}

export function normalizeRoomCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function validateNickname(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  if (normalized.length < 2) return { ok: false as const, message: "Use at least 2 characters." };
  if (normalized.length > 24) return { ok: false as const, message: "Use 24 characters or fewer." };
  return { ok: true as const, nickname: normalized };
}

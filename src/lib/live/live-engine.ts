import { materializeItemsForMode } from "@/lib/activity-intelligence";
import { sentenceGapAnswer } from "@/lib/game-engine";
import type { ActivitySet, LiveQuestion } from "@/lib/types";

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export type HostLiveQuestion = LiveQuestion & { correctAnswer: string };

export function buildLiveQuestion(activity: ActivitySet, index: number): HostLiveQuestion {
  const items = activity.enabledGames.includes("gap-fill")
    ? materializeItemsForMode(activity.items, "gap-fill", true)
    : activity.items;
  const item = items[index];
  if (!item) throw new Error("Live question index is outside the activity.");

  const usesGap = Boolean(item.gapSentence && item.example);
  const correctAnswer = usesGap ? sentenceGapAnswer(item) : item.answer;
  const distractors = usesGap
    ? (item.distractors ?? [])
    : items.filter((other) => other.id !== item.id).map((other) => other.answer);
  const uniqueDistractors = distractors.filter((value, position, values) => value && value !== correctAnswer && values.indexOf(value) === position);

  return {
    itemId: item.id,
    index,
    total: items.length,
    prompt: usesGap ? item.gapSentence! : item.prompt,
    hint: item.hint,
    imageUrl: item.imageUrl,
    options: shuffle([correctAnswer, ...shuffle(uniqueDistractors).slice(0, 3)]),
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

import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { gapOptions, quizOptions, sentenceGapAnswer, shuffle } from "@/lib/game-engine";
import type { ActivitySet, DynamiteState, LiveGameMode, LivePlayer, LiveQuestion } from "@/lib/types";

export const LIVE_GAME_MODES: readonly LiveGameMode[] = ["gap-fill", "quiz", "space-blaster", "dynamite"];

export type HostLiveQuestion = LiveQuestion & { correctAnswer: string };

export function dynamiteSourceMode(activity: ActivitySet): "quiz" | "gap-fill" {
  const quizItems = getPlayableItemsForMode(activity.items, "quiz");
  const gapItems = getPlayableItemsForMode(activity.items, "gap-fill");

  if (activity.kind === "grammar" && gapItems.length >= 2) return "gap-fill";
  if (quizItems.length >= 2) return "quiz";
  return "gap-fill";
}

export function liveModeItems(activity: ActivitySet, gameMode: LiveGameMode) {
  if (gameMode === "dynamite") {
    return getPlayableItemsForMode(activity.items, dynamiteSourceMode(activity));
  }
  return getPlayableItemsForMode(activity.items, gameMode);
}

export function liveModeQuestionCount(activity: ActivitySet, gameMode: LiveGameMode) {
  return liveModeItems(activity, gameMode).length;
}

export function buildLiveQuestion(activity: ActivitySet, index: number, gameMode: LiveGameMode = "quiz"): HostLiveQuestion {
  const sourceMode = gameMode === "dynamite" ? dynamiteSourceMode(activity) : gameMode;
  const items = gameMode === "dynamite"
    ? getPlayableItemsForMode(activity.items, sourceMode)
    : liveModeItems(activity, gameMode);
  const item = items[index];
  if (!item) throw new Error("Live question index is outside the selected game mode.");

  const usesGap = sourceMode === "gap-fill" || sourceMode === "space-blaster";
  const correctAnswer = usesGap ? sentenceGapAnswer(item) : item.answer;
  const options = usesGap ? gapOptions(item, items) : quizOptions(item, items);

  return {
    itemId: item.id,
    index,
    total: items.length,
    gameMode,
    sourceMode: gameMode === "dynamite" ? (sourceMode as "quiz" | "gap-fill") : undefined,
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

export function createDynamiteState(
  players: Pick<LivePlayer, "id" | "nickname">[],
  questionCount: number,
  random: () => number = Math.random,
): DynamiteState {
  if (players.length < 2) throw new Error("Dynamite needs at least two players.");
  if (questionCount < 2) throw new Error("Dynamite needs at least two playable questions.");

  const order = shuffle(players.map((player) => ({ id: player.id, name: player.nickname })), random);
  const questionOrder = shuffle(Array.from({ length: questionCount }, (_, index) => index), random);
  return {
    order,
    aliveIds: order.map((player) => player.id),
    eliminatedIds: [],
    currentPlayerId: order[0].id,
    turnNumber: 1,
    questionCursor: 0,
    questionOrder,
    winnerId: null,
  };
}

export function nextAlivePlayerId(state: DynamiteState, afterPlayerId = state.currentPlayerId) {
  if (state.aliveIds.length <= 1) return state.aliveIds[0] ?? null;
  const alive = new Set(state.aliveIds);
  const start = Math.max(0, state.order.findIndex((player) => player.id === afterPlayerId));
  for (let step = 1; step <= state.order.length; step += 1) {
    const candidate = state.order[(start + step) % state.order.length];
    if (candidate && alive.has(candidate.id)) return candidate.id;
  }
  return null;
}

export function advanceDynamiteQuestion(
  state: DynamiteState,
  questionCount: number,
  random: () => number = Math.random,
) {
  let questionOrder = state.questionOrder.length === questionCount
    ? [...state.questionOrder]
    : shuffle(Array.from({ length: questionCount }, (_, index) => index), random);
  let questionCursor = state.questionCursor + 1;
  const previousQuestion = state.questionOrder[state.questionCursor];

  if (questionCursor >= questionOrder.length) {
    questionOrder = shuffle(Array.from({ length: questionCount }, (_, index) => index), random);
    if (questionCount > 1 && questionOrder[0] === previousQuestion) {
      [questionOrder[0], questionOrder[1]] = [questionOrder[1], questionOrder[0]];
    }
    questionCursor = 0;
  }

  return {
    state: { ...state, questionOrder, questionCursor },
    questionIndex: questionOrder[questionCursor],
  };
}

export function eliminateDynamitePlayer(state: DynamiteState, playerId: string) {
  const aliveIds = state.aliveIds.filter((id) => id !== playerId);
  const eliminatedIds = state.eliminatedIds.includes(playerId)
    ? state.eliminatedIds
    : [...state.eliminatedIds, playerId];
  const winnerId = aliveIds.length === 1 ? aliveIds[0] : null;
  const nextPlayerId = winnerId ?? nextAlivePlayerId({ ...state, aliveIds, eliminatedIds }, playerId);
  return {
    ...state,
    aliveIds,
    eliminatedIds,
    currentPlayerId: nextPlayerId ?? "",
    winnerId,
  };
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

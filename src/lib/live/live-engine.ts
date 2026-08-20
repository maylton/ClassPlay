import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { gapOptions, quizOptions, sentenceGapAnswer, shuffle } from "@/lib/game-engine";
import type {
  ActivitySet,
  DynamiteState,
  LiveGameMode,
  LivePlayer,
  LiveQuestion,
  WildcardEffect,
  WildcardEffectType,
  WildcardGridIntensity,
  WildcardGridSize,
  WildcardGridState,
  WildcardGridTeamRef,
} from "@/lib/types";

export const LIVE_GAME_MODES: readonly LiveGameMode[] = ["gap-fill", "quiz", "space-blaster", "dynamite", "wildcard-grid"];

export type HostLiveQuestion = LiveQuestion & { correctAnswer: string };

export const WILDCARD_EFFECTS: Record<WildcardEffectType, WildcardEffect> = {
  jackpot: { type: "jackpot", title: "Jackpot", description: "+50 points. Sometimes the tile really likes you.", tone: "positive" },
  "little-boost": { type: "little-boost", title: "Little Boost", description: "+20 bonus points.", tone: "positive" },
  oops: { type: "oops", title: "Oops!", description: "Lose 10 points — unless your Shield saves you.", tone: "risk" },
  heist: { type: "heist", title: "Heist", description: "Steal up to 20 points from another team.", tone: "interaction", requiresTarget: true },
  gift: { type: "gift", title: "Generous Today", description: "Choose another team to receive 20 points.", tone: "interaction", requiresTarget: true },
  equalizer: { type: "equalizer", title: "Equalizer", description: "The lowest-scoring team gets +30 points.", tone: "interaction" },
  pickpocket: { type: "pickpocket", title: "Pickpocket", description: "Steal up to 10 points from two opponents.", tone: "interaction" },
  shield: { type: "shield", title: "Shield", description: "Block the next score-losing Wildcard that hits your team.", tone: "positive" },
  "double-trouble": { type: "double-trouble", title: "Double Trouble", description: "Your next correct answer is worth double.", tone: "positive" },
  swap: { type: "swap", title: "Score Swap", description: "Swap your score with another team.", tone: "chaos", requiresTarget: true },
  blackout: { type: "blackout", title: "Blackout", description: "Every team loses 20 points. Shields still work.", tone: "chaos" },
  "fresh-start": { type: "fresh-start", title: "Fresh Start", description: "Every score returns to zero.", tone: "chaos" },
};

export function dynamiteSourceMode(activity: ActivitySet): "quiz" | "gap-fill" {
  const quizItems = getPlayableItemsForMode(activity.items, "quiz");
  const gapItems = getPlayableItemsForMode(activity.items, "gap-fill");
  if (activity.kind === "grammar" && gapItems.length >= 2) return "gap-fill";
  if (quizItems.length >= 2) return "quiz";
  return "gap-fill";
}

export function wildcardGridSourceMode(activity: ActivitySet): "quiz" | "gap-fill" {
  const quizItems = getPlayableItemsForMode(activity.items, "quiz");
  const gapItems = getPlayableItemsForMode(activity.items, "gap-fill");
  if (activity.kind === "grammar" && gapItems.length >= 12) return "gap-fill";
  if (quizItems.length >= 12) return "quiz";
  return gapItems.length >= quizItems.length ? "gap-fill" : "quiz";
}

export function liveModeItems(activity: ActivitySet, gameMode: LiveGameMode) {
  if (gameMode === "dynamite") return getPlayableItemsForMode(activity.items, dynamiteSourceMode(activity));
  if (gameMode === "wildcard-grid") return getPlayableItemsForMode(activity.items, wildcardGridSourceMode(activity));
  return getPlayableItemsForMode(activity.items, gameMode);
}

export function liveModeQuestionCount(activity: ActivitySet, gameMode: LiveGameMode) {
  return liveModeItems(activity, gameMode).length;
}

export function buildLiveQuestion(activity: ActivitySet, index: number, gameMode: LiveGameMode = "quiz"): HostLiveQuestion {
  const sourceMode = gameMode === "dynamite"
    ? dynamiteSourceMode(activity)
    : gameMode === "wildcard-grid"
      ? wildcardGridSourceMode(activity)
      : gameMode;
  const items = gameMode === "dynamite" || gameMode === "wildcard-grid"
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
    sourceMode: gameMode === "dynamite" || gameMode === "wildcard-grid" ? (sourceMode as "quiz" | "gap-fill") : undefined,
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

export function createDynamiteState(players: Pick<LivePlayer, "id" | "nickname">[], questionCount: number, random: () => number = Math.random): DynamiteState {
  if (players.length < 2) throw new Error("Dynamite needs at least two players.");
  if (questionCount < 2) throw new Error("Dynamite needs at least two playable questions.");
  const order = shuffle(players.map((player) => ({ id: player.id, name: player.nickname })), random);
  const questionOrder = shuffle(Array.from({ length: questionCount }, (_, index) => index), random);
  return { order, aliveIds: order.map((player) => player.id), eliminatedIds: [], currentPlayerId: order[0].id, turnNumber: 1, questionCursor: 0, questionOrder, winnerId: null };
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

export function advanceDynamiteQuestion(state: DynamiteState, questionCount: number, random: () => number = Math.random) {
  let questionOrder = state.questionOrder.length === questionCount ? [...state.questionOrder] : shuffle(Array.from({ length: questionCount }, (_, index) => index), random);
  let questionCursor = state.questionCursor + 1;
  const previousQuestion = state.questionOrder[state.questionCursor];
  if (questionCursor >= questionOrder.length) {
    questionOrder = shuffle(Array.from({ length: questionCount }, (_, index) => index), random);
    if (questionCount > 1 && questionOrder[0] === previousQuestion) [questionOrder[0], questionOrder[1]] = [questionOrder[1], questionOrder[0]];
    questionCursor = 0;
  }
  return { state: { ...state, questionOrder, questionCursor }, questionIndex: questionOrder[questionCursor] };
}

export function eliminateDynamitePlayer(state: DynamiteState, playerId: string) {
  const aliveIds = state.aliveIds.filter((id) => id !== playerId);
  const eliminatedIds = state.eliminatedIds.includes(playerId) ? state.eliminatedIds : [...state.eliminatedIds, playerId];
  const winnerId = aliveIds.length === 1 ? aliveIds[0] : null;
  const nextPlayerId = winnerId ?? nextAlivePlayerId({ ...state, aliveIds, eliminatedIds }, playerId);
  return { ...state, aliveIds, eliminatedIds, currentPlayerId: nextPlayerId ?? "", winnerId };
}

function wildcardCount(size: WildcardGridSize) {
  return size === 12 ? 3 : size === 16 ? 4 : 5;
}

function pickEffect(types: WildcardEffectType[], random: () => number) {
  return types[Math.floor(random() * types.length)] ?? types[0];
}

export function createWildcardGridState(
  teams: WildcardGridTeamRef[],
  questionCount: number,
  size: WildcardGridSize,
  intensity: WildcardGridIntensity,
  random: () => number = Math.random,
): WildcardGridState {
  if (teams.length < 2 || teams.length > 4) throw new Error("Wildcard Grid supports two to four teams.");
  if (questionCount < size) throw new Error(`Wildcard Grid needs at least ${size} compatible questions.`);
  const teamIds = teams.map((team) => team.id);
  const teamOrder = shuffle([...teamIds], random);
  const questionOrder = shuffle(Array.from({ length: questionCount }, (_, index) => index), random).slice(0, size);
  const count = wildcardCount(size);
  const positive: WildcardEffectType[] = ["jackpot", "little-boost", "shield", "double-trouble"];
  const interaction: WildcardEffectType[] = ["heist", "gift", "equalizer", "pickpocket"];
  const risk: WildcardEffectType[] = ["oops"];
  const balancedPool: WildcardEffectType[] = [...positive, ...interaction, ...risk];
  const selected: WildcardEffectType[] = [pickEffect(positive, random), pickEffect(interaction, random), pickEffect(risk, random)];
  const unused = () => balancedPool.filter((type) => !selected.includes(type));
  while (selected.length < count) {
    if (intensity === "chaos" && selected.length === count - 1 && random() < 0.6) selected.push(pickEffect(["swap", "blackout", "fresh-start"], random));
    else selected.push(pickEffect(unused().length ? unused() : balancedPool, random));
  }
  const wildcardTiles = new Map(shuffle(Array.from({ length: size }, (_, index) => index), random).slice(0, count).map((tileIndex, effectIndex) => [tileIndex, WILDCARD_EFFECTS[selected[effectIndex]]]));
  return {
    size,
    intensity,
    phase: "board",
    tiles: questionOrder.map((questionIndex, index) => ({ number: index + 1, questionIndex, wildcard: wildcardTiles.get(index) ?? null, opened: false, resolved: false })),
    teams: teams.map((team) => ({ ...team })),
    teamOrder,
    activeTeamId: teamOrder[0],
    teamScores: Object.fromEntries(teamOrder.map((teamId) => [teamId, 0])),
    teamShields: Object.fromEntries(teamOrder.map((teamId) => [teamId, false])),
    teamDoubleNext: Object.fromEntries(teamOrder.map((teamId) => [teamId, false])),
    currentTileNumber: null,
    lastAnswerCorrect: null,
    lastBasePoints: 0,
    pendingWildcard: null,
    completedTurns: 0,
    tiedTeamIds: [],
    winnerTeamId: null,
  };
}

export function selectWildcardGridTile(state: WildcardGridState, tileNumber: number) {
  if (state.phase !== "board") throw new Error("A Wildcard Grid tile can only be selected from the board.");
  const tile = state.tiles.find((candidate) => candidate.number === tileNumber);
  if (!tile || tile.opened) throw new Error("That Wildcard Grid tile is no longer available.");
  return { ...state, phase: "question" as const, currentTileNumber: tileNumber, lastAnswerCorrect: null, lastBasePoints: 0, pendingWildcard: null };
}

export function scoreWildcardGridAnswer(state: WildcardGridState, correct: boolean) {
  if (state.phase !== "question" || !state.currentTileNumber) throw new Error("Wildcard Grid is not waiting for an answer.");
  const active = state.activeTeamId;
  const double = correct && Boolean(state.teamDoubleNext[active]);
  const points = correct ? (double ? 40 : 20) : 0;
  const tile = state.tiles.find((candidate) => candidate.number === state.currentTileNumber);
  if (!tile) throw new Error("Wildcard Grid could not find the active tile.");
  return {
    ...state,
    phase: "result" as const,
    tiles: state.tiles.map((candidate) => candidate.number === tile.number ? { ...candidate, opened: true } : candidate),
    teamScores: { ...state.teamScores, [active]: (state.teamScores[active] ?? 0) + points },
    teamDoubleNext: double ? { ...state.teamDoubleNext, [active]: false } : state.teamDoubleNext,
    lastAnswerCorrect: correct,
    lastBasePoints: points,
    pendingWildcard: tile.wildcard ?? null,
  };
}

function consumeShield(state: WildcardGridState, teamId: string) {
  if (!state.teamShields[teamId]) return { blocked: false, shields: state.teamShields };
  return { blocked: true, shields: { ...state.teamShields, [teamId]: false } };
}

function scoreFloor(value: number) {
  return Math.max(0, value);
}

function finishOrAdvanceWildcardTurn(state: WildcardGridState): WildcardGridState {
  const completedTurns = state.completedTurns + 1;
  const tiles = state.tiles.map((tile) => tile.number === state.currentTileNumber ? { ...tile, opened: true, resolved: true } : tile);
  const allDone = tiles.every((tile) => tile.resolved);
  if (allDone) {
    const best = Math.max(...state.teamOrder.map((teamId) => state.teamScores[teamId] ?? 0));
    const tiedTeamIds = state.teamOrder.filter((teamId) => (state.teamScores[teamId] ?? 0) === best);
    return { ...state, tiles, phase: "finished", completedTurns, currentTileNumber: null, pendingWildcard: null, tiedTeamIds, winnerTeamId: tiedTeamIds.length === 1 ? tiedTeamIds[0] : null };
  }
  const currentIndex = Math.max(0, state.teamOrder.indexOf(state.activeTeamId));
  const activeTeamId = state.teamOrder[(currentIndex + 1) % state.teamOrder.length];
  return { ...state, tiles, phase: "board", activeTeamId, completedTurns, currentTileNumber: null, lastAnswerCorrect: null, lastBasePoints: 0, pendingWildcard: null };
}

export function continueWildcardGridResult(state: WildcardGridState) {
  if (state.phase !== "result") throw new Error("Wildcard Grid is not showing an answer result.");
  if (state.pendingWildcard) return { ...state, phase: "wildcard" as const };
  return finishOrAdvanceWildcardTurn(state);
}

export function resolveWildcardGrid(state: WildcardGridState, targetTeamId?: string) {
  if (state.phase !== "wildcard" || !state.pendingWildcard) throw new Error("Wildcard Grid has no Wildcard to resolve.");
  const effect = state.pendingWildcard;
  const active = state.activeTeamId;
  const validTarget = targetTeamId && state.teamOrder.includes(targetTeamId) && targetTeamId !== active ? targetTeamId : undefined;
  if (effect.requiresTarget && !validTarget) throw new Error("Choose another team for this Wildcard.");
  let scores = { ...state.teamScores };
  let shields = { ...state.teamShields };
  let doubles = { ...state.teamDoubleNext };
  const subtract = (teamId: string, amount: number) => {
    const shield = consumeShield({ ...state, teamShields: shields }, teamId);
    shields = shield.shields;
    if (shield.blocked) return 0;
    const before = scores[teamId] ?? 0;
    const after = scoreFloor(before - amount);
    scores[teamId] = after;
    return before - after;
  };
  switch (effect.type) {
    case "jackpot": scores[active] = (scores[active] ?? 0) + 50; break;
    case "little-boost": scores[active] = (scores[active] ?? 0) + 20; break;
    case "oops": subtract(active, 10); break;
    case "heist": { const stolen = subtract(validTarget!, 20); scores[active] = (scores[active] ?? 0) + stolen; break; }
    case "gift": scores[validTarget!] = (scores[validTarget!] ?? 0) + 20; break;
    case "equalizer": { const lowest = Math.min(...state.teamOrder.map((teamId) => scores[teamId] ?? 0)); const teamId = state.teamOrder.find((candidate) => (scores[candidate] ?? 0) === lowest) ?? active; scores[teamId] = (scores[teamId] ?? 0) + 30; break; }
    case "pickpocket": { const opponents = state.teamOrder.filter((teamId) => teamId !== active).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0)).slice(0, 2); const stolen = opponents.reduce((sum, teamId) => sum + subtract(teamId, 10), 0); scores[active] = (scores[active] ?? 0) + stolen; break; }
    case "shield": shields[active] = true; break;
    case "double-trouble": doubles[active] = true; break;
    case "swap": { const target = validTarget!; [scores[active], scores[target]] = [scores[target] ?? 0, scores[active] ?? 0]; break; }
    case "blackout": state.teamOrder.forEach((teamId) => { subtract(teamId, 20); }); break;
    case "fresh-start": state.teamOrder.forEach((teamId) => { scores[teamId] = 0; }); break;
  }
  return finishOrAdvanceWildcardTurn({ ...state, teamScores: scores, teamShields: shields, teamDoubleNext: doubles });
}

export function resolveWildcardGridTie(state: WildcardGridState, winnerTeamId: string) {
  if (state.phase !== "finished" || state.winnerTeamId || !state.tiedTeamIds?.includes(winnerTeamId)) throw new Error("That team is not eligible for the tie-break.");
  return { ...state, winnerTeamId, tiedTeamIds: [winnerTeamId] };
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

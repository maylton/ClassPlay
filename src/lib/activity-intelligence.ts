import { findEnglishPhraseMatch, type EnglishPhraseMatch } from "./english-phrase-matcher";
import { GAME_MODE_CATALOG, GAME_MODE_ORDER } from "./game-catalog";
import type { ActivityItem, ActivitySet, GameType } from "./types";

const DEFAULT_MIN_PLAYABLE_ITEMS = 2;
const ARCADE_MIN_PLAYABLE_ITEMS = 3;
const PAIR_MODES: readonly GameType[] = ["flashcards", "memory", "matching", "quiz"];
const TARGET_SENTENCE_MODES: readonly GameType[] = ["gap-fill", "space-blaster", "word-maze"];
const SENTENCE_MODES: readonly GameType[] = ["sentence-builder", ...TARGET_SENTENCE_MODES];

export type GameModeCompatibilityStatus = "enabled" | "ready" | "needs-content";

export type GameModeCompatibility = {
  mode: GameType;
  status: GameModeCompatibilityStatus;
  playableItems: number;
  reason: string;
  generated: string[];
};

function clean(value?: string) {
  return (value ?? "").trim();
}

function normalized(value?: string) {
  return clean(value).toLocaleLowerCase().replace(/\s+/g, " ");
}

function minimumPlayableItems(mode: GameType) {
  return mode === "space-blaster" || mode === "word-maze" ? ARCADE_MIN_PLAYABLE_ITEMS : DEFAULT_MIN_PLAYABLE_ITEMS;
}

function joinSentenceParts(parts?: string[]) {
  return (parts ?? []).map(clean).filter(Boolean).join(" ").replace(/\s+([,.!?])/g, "$1");
}

function hasPair(item: ActivityItem) {
  return Boolean(clean(item.prompt) && clean(item.answer) && normalized(item.prompt) !== normalized(item.answer));
}

export function canonicalSentence(item: ActivityItem) {
  return clean(item.example) || joinSentenceParts(item.sentenceParts);
}

function targetCandidates(item: ActivityItem, sentence: string) {
  return [clean(item.prompt), clean(item.answer)]
    .filter(Boolean)
    .filter((candidate, index, all) => all.findIndex((value) => normalized(value) === normalized(candidate)) === index)
    .filter((candidate) => normalized(candidate) !== normalized(sentence));
}

function findTarget(item: ActivityItem, sentence: string): EnglishPhraseMatch | null {
  for (const candidate of targetCandidates(item, sentence)) {
    const match = findEnglishPhraseMatch(sentence, candidate);
    if (match) return match;
  }
  return null;
}

export function deriveGapSentence(item: ActivityItem) {
  const existing = clean(item.gapSentence);
  if (existing.includes("_____")) return existing;
  const sentence = canonicalSentence(item);
  if (!sentence) return "";
  const target = findTarget(item, sentence);
  return target ? `${sentence.slice(0, target.start)}_____${sentence.slice(target.end)}` : "";
}

function chunkWords(value: string) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  if (words.length < 2) return words;
  const groupSize = words.length <= 5 ? 2 : words.length <= 10 ? 3 : 4;
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += groupSize) {
    chunks.push(words.slice(index, index + groupSize).join(" "));
  }
  if (chunks.length === 1 && words.length > 1) {
    const middle = Math.ceil(words.length / 2);
    return [words.slice(0, middle).join(" "), words.slice(middle).join(" ")].filter(Boolean);
  }
  return chunks;
}

export function deriveSentenceParts(item: ActivityItem) {
  const existing = (item.sentenceParts ?? []).map(clean).filter(Boolean);
  if (existing.length > 1) return existing;

  const sentence = canonicalSentence(item);
  if (!sentence) return [];
  const target = findTarget(item, sentence);
  if (!target) return chunkWords(sentence);

  const before = sentence.slice(0, target.start).trim();
  const after = sentence.slice(target.end).trim();
  const chunks = [...chunkWords(before), target.text, ...chunkWords(after)].filter(Boolean);
  return chunks.length > 1 ? chunks : chunkWords(sentence);
}

/**
 * Runtime adapter for a game mode. `derive` defaults to false so editor state
 * never becomes a second persisted copy of generated content. Game/runtime
 * consumers opt in to derivation through getPlayableItemsForMode().
 */
export function materializeItemsForMode(items: ActivityItem[], mode: GameType, derive = false) {
  if (!derive) return items;
  if (TARGET_SENTENCE_MODES.includes(mode)) {
    return items.map((item) => item.gapSentence?.includes("_____") ? item : { ...item, gapSentence: deriveGapSentence(item) || item.gapSentence });
  }
  if (mode === "sentence-builder") {
    return items.map((item) => (item.sentenceParts?.length ?? 0) > 1 ? item : { ...item, sentenceParts: deriveSentenceParts(item) });
  }
  return items;
}

export function normalizeItemsForModes(items: ActivityItem[], modes: readonly GameType[]) {
  const pairSelected = modes.some((mode) => PAIR_MODES.includes(mode));
  const sentenceSelected = modes.some((mode) => SENTENCE_MODES.includes(mode));

  return items.map((item) => {
    const sentence = canonicalSentence(item);
    let prompt = clean(item.prompt);
    let answer = clean(item.answer);

    // The stable schema still requires prompt/answer. Sentence-only content uses
    // internal fallbacks, but equal values intentionally do NOT unlock pair modes.
    if (sentenceSelected && !pairSelected) {
      if (!prompt && modes.includes("sentence-builder") && sentence) prompt = sentence;
      if (!answer && prompt) answer = prompt;
    }

    return {
      ...item,
      prompt,
      answer,
      example: clean(item.example),
      hint: clean(item.hint),
      gapSentence: clean(item.gapSentence),
      distractors: (item.distractors ?? []).map(clean).filter(Boolean),
      sentenceParts: (item.sentenceParts ?? []).map(clean).filter(Boolean),
    };
  });
}

export function getPlayableItemsForMode(items: ActivityItem[], mode: GameType) {
  const prepared = materializeItemsForMode(items, mode, true);

  if (mode === "sentence-builder") {
    return prepared.filter((item) => (item.sentenceParts?.length ?? 0) > 1);
  }

  if (TARGET_SENTENCE_MODES.includes(mode)) {
    return prepared.filter((item) => clean(item.gapSentence).includes("_____") && Boolean(clean(item.prompt) || clean(item.answer)));
  }

  const pairs = prepared.filter(hasPair);
  if (mode !== "quiz") return pairs;
  const distinctAnswers = new Set(pairs.map((item) => normalized(item.answer))).size;
  return distinctAnswers >= DEFAULT_MIN_PLAYABLE_ITEMS ? pairs : [];
}

function modeReason(mode: GameType, playableItems: number) {
  const minimum = minimumPlayableItems(mode);
  if (playableItems >= minimum) {
    if (mode === "gap-fill") return "ClassPlay can generate gap sentences from your full sentences and targets.";
    if (mode === "sentence-builder") return "ClassPlay can turn your full sentences into draggable chunks.";
    if (mode === "quiz") return "ClassPlay can build answer choices from the other answers in this activity.";
    if (mode === "space-blaster") return "ClassPlay can turn these sentence targets into moving arcade answer pods.";
    if (mode === "word-maze") return "ClassPlay can place these sentence targets inside answer portals in a maze.";
    return "Your prompt + answer pairs already contain everything this mode needs.";
  }

  if (mode === "gap-fill") return "Add at least two full sentences and choose a target word or expression inside each sentence.";
  if (mode === "sentence-builder") return "Add at least two full sentences so ClassPlay can generate sentence chunks.";
  if (mode === "quiz") return "Add at least two prompt + answer pairs with different answers.";
  if (mode === "space-blaster" || mode === "word-maze") return "Add at least three full sentences and choose a target word or expression inside each sentence.";
  return "Add at least two prompt + answer pairs.";
}

function generatedForMode(mode: GameType) {
  if (mode === "gap-fill") return ["Gap sentences"];
  if (mode === "sentence-builder") return ["Sentence chunks"];
  if (mode === "quiz") return ["Answer choices"];
  if (mode === "space-blaster") return ["Arcade answer targets"];
  if (mode === "word-maze") return ["Maze answer portals"];
  return [];
}

export function analyzeGameModes(items: ActivityItem[], enabledGames: readonly GameType[]): GameModeCompatibility[] {
  return GAME_MODE_ORDER.map((mode) => {
    const playableItems = getPlayableItemsForMode(items, mode).length;
    const minimum = minimumPlayableItems(mode);
    const enabled = enabledGames.includes(mode);
    return {
      mode,
      status: enabled ? "enabled" : playableItems >= minimum ? "ready" : "needs-content",
      playableItems,
      reason: modeReason(mode, playableItems),
      generated: generatedForMode(mode),
    };
  });
}

export function validateEnabledModes(items: ActivityItem[], enabledGames: readonly GameType[]) {
  return analyzeGameModes(items, enabledGames)
    .filter((entry) => enabledGames.includes(entry.mode) && entry.playableItems < minimumPlayableItems(entry.mode))
    .map((entry) => `${GAME_MODE_CATALOG[entry.mode].name}: ${entry.reason}`);
}

export function prepareActivityForSave(activity: ActivitySet): ActivitySet {
  const items = normalizeItemsForModes(activity.items, activity.enabledGames).filter((item) => {
    const hasText = Boolean(clean(item.prompt) || clean(item.answer) || canonicalSentence(item));
    return hasText;
  });
  return { ...activity, items, updatedAt: new Date().toISOString() };
}

export function enableCompatibleMode(activity: ActivitySet, mode: GameType) {
  const analysis = analyzeGameModes(activity.items, activity.enabledGames).find((entry) => entry.mode === mode);
  if (!analysis || analysis.playableItems < minimumPlayableItems(mode)) return null;
  const enabledGames = activity.enabledGames.includes(mode) ? activity.enabledGames : [...activity.enabledGames, mode];
  return prepareActivityForSave({ ...activity, enabledGames });
}

export function compatibleVariants(activity: ActivitySet) {
  return analyzeGameModes(activity.items, activity.enabledGames).filter((entry) => entry.status === "ready");
}

export function selectedModeNeeds(enabledGames: readonly GameType[]) {
  return {
    pair: enabledGames.some((mode) => PAIR_MODES.includes(mode)),
    sentence: enabledGames.some((mode) => SENTENCE_MODES.includes(mode)),
    gap: enabledGames.some((mode) => TARGET_SENTENCE_MODES.includes(mode)),
    builder: enabledGames.includes("sentence-builder"),
    hint: enabledGames.some((mode) => ["flashcards", "quiz", "sentence-builder"].includes(mode)),
    image: enabledGames.includes("flashcards"),
  };
}

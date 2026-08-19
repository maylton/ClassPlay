import { GAME_MODE_CATALOG, GAME_MODE_ORDER } from "./game-catalog";
import type { ActivityItem, ActivitySet, GameType } from "./types";

const MIN_PLAYABLE_ITEMS = 2;
const PAIR_MODES: readonly GameType[] = ["flashcards", "memory", "matching", "quiz"];
const SENTENCE_MODES: readonly GameType[] = ["sentence-builder", "gap-fill"];

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

function findTarget(item: ActivityItem, sentence: string) {
  const lowerSentence = sentence.toLocaleLowerCase();
  for (const candidate of targetCandidates(item, sentence)) {
    if (lowerSentence.includes(candidate.toLocaleLowerCase())) return candidate;
  }
  return "";
}

function replaceFirstInsensitive(source: string, needle: string, replacement: string) {
  const index = source.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return source;
  return `${source.slice(0, index)}${replacement}${source.slice(index + needle.length)}`;
}

export function deriveGapSentence(item: ActivityItem) {
  const existing = clean(item.gapSentence);
  if (existing.includes("_____")) return existing;
  const sentence = canonicalSentence(item);
  if (!sentence) return "";
  const target = findTarget(item, sentence);
  return target ? replaceFirstInsensitive(sentence, target, "_____") : "";
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

  const index = sentence.toLocaleLowerCase().indexOf(target.toLocaleLowerCase());
  if (index < 0) return chunkWords(sentence);
  const before = sentence.slice(0, index).trim();
  const targetText = sentence.slice(index, index + target.length).trim();
  const after = sentence.slice(index + target.length).trim();
  const chunks = [...chunkWords(before), targetText, ...chunkWords(after)].filter(Boolean);
  return chunks.length > 1 ? chunks : chunkWords(sentence);
}

export function materializeItemsForMode(items: ActivityItem[], mode: GameType) {
  if (mode === "gap-fill") {
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

  let normalizedItems = items.map((item) => {
    const sentence = canonicalSentence(item);
    let prompt = clean(item.prompt);
    let answer = clean(item.answer);

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

  for (const mode of modes) normalizedItems = materializeItemsForMode(normalizedItems, mode);
  return normalizedItems;
}

export function getPlayableItemsForMode(items: ActivityItem[], mode: GameType) {
  const prepared = materializeItemsForMode(items, mode);

  if (mode === "sentence-builder") {
    return prepared.filter((item) => (item.sentenceParts?.length ?? 0) > 1);
  }

  if (mode === "gap-fill") {
    return prepared.filter((item) => clean(item.gapSentence).includes("_____") && Boolean(clean(item.prompt) || clean(item.answer)));
  }

  const pairs = prepared.filter(hasPair);
  if (mode !== "quiz") return pairs;
  const distinctAnswers = new Set(pairs.map((item) => normalized(item.answer))).size;
  return distinctAnswers >= MIN_PLAYABLE_ITEMS ? pairs : [];
}

function modeReason(mode: GameType, playableItems: number) {
  if (playableItems >= MIN_PLAYABLE_ITEMS) {
    if (mode === "gap-fill") return "ClassPlay can generate gap sentences from your full sentences and targets.";
    if (mode === "sentence-builder") return "ClassPlay can turn your full sentences into draggable chunks.";
    if (mode === "quiz") return "ClassPlay can build answer choices from the other answers in this activity.";
    return "Your prompt + answer pairs already contain everything this mode needs.";
  }

  if (mode === "gap-fill") return "Add at least two full sentences and choose a target word or expression inside each sentence.";
  if (mode === "sentence-builder") return "Add at least two full sentences so ClassPlay can generate sentence chunks.";
  if (mode === "quiz") return "Add at least two prompt + answer pairs with different answers.";
  return "Add at least two prompt + answer pairs.";
}

function generatedForMode(mode: GameType) {
  if (mode === "gap-fill") return ["Gap sentences"];
  if (mode === "sentence-builder") return ["Sentence chunks"];
  if (mode === "quiz") return ["Answer choices"];
  return [];
}

export function analyzeGameModes(items: ActivityItem[], enabledGames: readonly GameType[]): GameModeCompatibility[] {
  return GAME_MODE_ORDER.map((mode) => {
    const playableItems = getPlayableItemsForMode(items, mode).length;
    const enabled = enabledGames.includes(mode);
    return {
      mode,
      status: enabled ? "enabled" : playableItems >= MIN_PLAYABLE_ITEMS ? "ready" : "needs-content",
      playableItems,
      reason: modeReason(mode, playableItems),
      generated: generatedForMode(mode),
    };
  });
}

export function validateEnabledModes(items: ActivityItem[], enabledGames: readonly GameType[]) {
  return analyzeGameModes(items, enabledGames)
    .filter((entry) => enabledGames.includes(entry.mode) && entry.playableItems < MIN_PLAYABLE_ITEMS)
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
  if (!analysis || analysis.playableItems < MIN_PLAYABLE_ITEMS) return null;
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
    gap: enabledGames.includes("gap-fill"),
    builder: enabledGames.includes("sentence-builder"),
    hint: enabledGames.some((mode) => ["flashcards", "quiz", "sentence-builder"].includes(mode)),
    image: enabledGames.includes("flashcards"),
  };
}

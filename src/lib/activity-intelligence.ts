import { findEnglishPhraseMatch, type EnglishPhraseMatch } from "./english-phrase-matcher";
import { GAME_MODE_CATALOG, GAME_MODE_ORDER } from "./game-catalog";
import type { ActivityItem, ActivitySet, GameType } from "./types";

const DEFAULT_MIN_PLAYABLE_ITEMS = 2;
const ARCADE_MIN_PLAYABLE_ITEMS = 3;
const PAIR_MODES: readonly GameType[] = ["flashcards", "memory", "matching", "quiz"];
const TARGET_SENTENCE_MODES: readonly GameType[] = ["gap-fill", "space-blaster", "word-maze"];
const SENTENCE_MODES: readonly GameType[] = ["sentence-builder", ...TARGET_SENTENCE_MODES];

export type GameModeCompatibilityStatus = "enabled" | "recommended" | "compatible" | "needs-content" | "unavailable";

export type GameModeCompatibility = {
  mode: GameType;
  status: GameModeCompatibilityStatus;
  playableItems: number;
  reason: string;
  generated: string[];
};

type Fit = 0 | 1 | 2;

function clean(value?: string) {
  return (value ?? "").trim();
}

function normalized(value?: string) {
  return clean(value).toLocaleLowerCase().replace(/\s+/g, " ");
}

function wordCount(value?: string) {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

function hasBlank(value?: string) {
  return /_{2,}/.test(clean(value));
}

function looksLikeSentence(value?: string) {
  const text = clean(value);
  return wordCount(text) >= 5 || /[.!?]$/.test(text);
}

function meaningfulItems(items: ActivityItem[]) {
  return items.filter((item) => Boolean(clean(item.prompt) || clean(item.answer) || canonicalSentence(item)));
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

function sentenceForRelationship(item: ActivityItem) {
  const example = canonicalSentence(item);
  const answer = clean(item.answer);
  return looksLikeSentence(example) ? example : looksLikeSentence(answer) ? answer : "";
}

function conditionalPair(sentence: string): { prompt: string; answer: string } | null {
  const value = clean(sentence);
  if (!/\bif\b/i.test(value)) return null;

  const comma = value.indexOf(",");
  if (/^if\b/i.test(value) && comma > 0) {
    const condition = value.slice(0, comma).trim().replace(/[.!?]+$/, "");
    const result = value.slice(comma + 1).trim();
    if (condition && result) return { prompt: `${condition}…`, answer: `…${result}` };
  }

  const reverse = value.match(/^(.+?)\s+if\s+(.+?)([.!?]?)$/i);
  if (reverse) {
    const result = reverse[1].trim().replace(/[,.!?]+$/, "");
    const conditionBody = reverse[2].trim().replace(/[.!?]+$/, "");
    if (result && conditionBody) {
      const condition = `If ${conditionBody.charAt(0).toLocaleLowerCase()}${conditionBody.slice(1)}`;
      return { prompt: `${condition}…`, answer: `…${result}.` };
    }
  }

  return null;
}

function transformationPair(item: ActivityItem): { prompt: string; answer: string } | null {
  const prompt = clean(item.prompt);
  const sentence = sentenceForRelationship(item);
  if (!prompt.includes("→") || !sentence) return null;
  const source = prompt.split("→")[0]?.trim();
  if (!source) return null;
  return { prompt: source, answer: sentence };
}

function deriveMatchingItem(item: ActivityItem): ActivityItem {
  const sentence = sentenceForRelationship(item);
  const conditional = sentence ? conditionalPair(sentence) : null;
  const transformation = transformationPair(item);
  const pair = conditional ?? transformation;
  return pair ? { ...item, prompt: pair.prompt, answer: pair.answer } : item;
}

function sentenceCompletion(item: ActivityItem) {
  return hasBlank(item.prompt) || hasBlank(item.gapSentence);
}

function lexicalOrFormPair(item: ActivityItem) {
  if (!hasPair(item) || sentenceCompletion(item)) return false;
  const prompt = clean(item.prompt);
  const answer = clean(item.answer);
  const promptWords = wordCount(prompt);
  const answerWords = wordCount(answer);
  if (promptWords <= 4 && answerWords <= 6) return true;
  if (prompt.length >= answer.length * 1.35 && answerWords <= 6) return true;
  return false;
}

function situationResponsePair(item: ActivityItem) {
  return hasPair(item) && !sentenceCompletion(item) && looksLikeSentence(item.prompt) && looksLikeSentence(item.answer);
}

function cueToSentence(item: ActivityItem) {
  return hasPair(item) && !sentenceCompletion(item) && !looksLikeSentence(item.prompt) && looksLikeSentence(item.answer);
}

function matchingFit(item: ActivityItem): Fit {
  const adapted = deriveMatchingItem(item);
  if (adapted.prompt !== item.prompt || adapted.answer !== item.answer) return 2;
  if (sentenceCompletion(item)) return 0;
  if (lexicalOrFormPair(item) || situationResponsePair(item)) return 2;
  if (cueToSentence(item)) return 1;
  return hasPair(item) ? 1 : 0;
}

function pairModeFit(item: ActivityItem, mode: GameType): Fit {
  if (mode === "matching") return matchingFit(item);
  if (mode === "quiz") return hasPair(item) ? 2 : 0;

  const sentence = sentenceForRelationship(item);
  if (sentence && conditionalPair(sentence)) return 0;
  if (sentenceCompletion(item)) return 0;

  if (mode === "flashcards") {
    if (lexicalOrFormPair(item)) return 2;
    if (situationResponsePair(item) || cueToSentence(item)) return 1;
    return hasPair(item) ? 1 : 0;
  }

  if (mode === "memory") {
    const maxLength = Math.max(clean(item.prompt).length, clean(item.answer).length);
    if (maxLength > 78) return 0;
    if (lexicalOrFormPair(item)) return 2;
    if (situationResponsePair(item)) return 1;
    return 0;
  }

  return 0;
}

function sentenceModeFit(item: ActivityItem, mode: GameType): Fit {
  if (mode === "sentence-builder") return wordCount(canonicalSentence(item)) >= 3 ? 2 : 0;
  const gap = deriveGapSentence(item);
  if (!gap.includes("_____")) return 0;
  if (mode === "gap-fill") return 2;
  const targetWords = Math.min(wordCount(item.prompt), wordCount(item.answer));
  if (targetWords > 10) return 0;
  return targetWords > 6 ? 1 : 2;
}

function fitForItem(item: ActivityItem, mode: GameType): Fit {
  if (PAIR_MODES.includes(mode)) return pairModeFit(item, mode);
  return sentenceModeFit(item, mode);
}

/**
 * Runtime adapter for a game mode. Generated variants never overwrite the
 * source deck: games receive a view of the item that is pedagogically better
 * suited to that mode.
 */
export function materializeItemsForMode(items: ActivityItem[], mode: GameType, derive = false) {
  if (!derive) return items;
  if (mode === "matching") return items.map(deriveMatchingItem);
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
    return prepared.filter((item) => (item.sentenceParts?.length ?? 0) > 1 && fitForItem(item, mode) > 0);
  }

  if (TARGET_SENTENCE_MODES.includes(mode)) {
    return prepared.filter((item) => clean(item.gapSentence).includes("_____") && Boolean(clean(item.prompt) || clean(item.answer)) && fitForItem(item, mode) > 0);
  }

  const pairs = prepared.filter((item) => hasPair(item) && fitForItem(item, mode) > 0);
  if (mode !== "quiz") return pairs;
  const distinctAnswers = new Set(pairs.map((item) => normalized(item.answer))).size;
  return distinctAnswers >= DEFAULT_MIN_PLAYABLE_ITEMS ? pairs : [];
}

function modeFit(items: ActivityItem[], mode: GameType) {
  const prepared = materializeItemsForMode(items, mode, true);
  const fits = prepared.map((item) => fitForItem(item, mode)).filter((fit) => fit > 0);
  const recommended = fits.filter((fit) => fit === 2).length;
  return {
    compatible: fits.length,
    recommended,
    quality: fits.length ? recommended / fits.length : 0,
  };
}

function modeReason(mode: GameType, playableItems: number, status: GameModeCompatibilityStatus) {
  if (status === "unavailable") {
    if (mode === "flashcards") return "This content behaves like sentence completion or needs too much context for useful flashcards.";
    if (mode === "memory") return "These pairs are too contextual or too long for a clear memory game.";
    if (mode === "matching") return "These items are sentence completions rather than meaningful pairs to associate.";
    return "This content structure does not produce a clear version of this game yet.";
  }

  if (status === "needs-content") {
    if (mode === "gap-fill") return "Add at least two full sentences with a clear target inside each one.";
    if (mode === "sentence-builder") return "Add at least two full sentences so ClassPlay can build them word by word.";
    if (mode === "quiz") return "Add at least two prompt + answer items with different answers.";
    if (mode === "space-blaster" || mode === "word-maze") return "Add at least three sentence targets before this arcade mode can unlock.";
    return "Add at least two clear prompt + answer relationships to unlock this mode.";
  }

  if (mode === "matching" && status !== "enabled") return "ClassPlay found clear relationships and will adapt them when useful, such as condition → result.";
  if (mode === "gap-fill") return "ClassPlay can generate or reuse sentence gaps from this content.";
  if (mode === "sentence-builder") return "Full sentences are available for word-by-word reconstruction.";
  if (mode === "quiz") return "The answers are distinct enough for a multiple-choice challenge.";
  if (mode === "space-blaster") return "The missing-language targets are short enough for an arcade challenge.";
  if (mode === "word-maze") return "The missing-language targets can become clear maze portals.";
  if (status === "compatible") return "This mode can use the content clearly, although another mode may be a stronger fit.";
  return "This content is a strong fit for this game mode.";
}

function generatedForMode(mode: GameType) {
  if (mode === "matching") return ["Relationship pairs when needed"];
  if (mode === "gap-fill") return ["Gap sentences"];
  if (mode === "sentence-builder") return ["Sentence words"];
  if (mode === "quiz") return ["Answer choices"];
  if (mode === "space-blaster") return ["Arcade answer targets"];
  if (mode === "word-maze") return ["Maze answer portals"];
  return [];
}

export function analyzeGameModes(items: ActivityItem[], enabledGames: readonly GameType[]): GameModeCompatibility[] {
  const meaningful = meaningfulItems(items).length;
  return GAME_MODE_ORDER.map((mode) => {
    const playableItems = getPlayableItemsForMode(items, mode).length;
    const minimum = minimumPlayableItems(mode);
    const fit = modeFit(items, mode);
    const enabled = enabledGames.includes(mode);

    let status: GameModeCompatibilityStatus;
    if (playableItems < minimum) {
      status = meaningful >= minimum ? "unavailable" : "needs-content";
    } else if (enabled) {
      status = "enabled";
    } else {
      status = fit.quality >= 0.6 ? "recommended" : "compatible";
    }

    return {
      mode,
      status,
      playableItems,
      reason: modeReason(mode, playableItems, status),
      generated: generatedForMode(mode),
    };
  });
}

export function compatibleModes(items: ActivityItem[]) {
  return analyzeGameModes(items, [])
    .filter((entry) => entry.status === "recommended" || entry.status === "compatible")
    .map((entry) => entry.mode);
}

export function compatibleEnabledGames(items: ActivityItem[], enabledGames: readonly GameType[]) {
  const eligible = new Set(compatibleModes(items));
  return enabledGames.filter((mode) => eligible.has(mode));
}

export function validateEnabledModes(items: ActivityItem[], enabledGames: readonly GameType[]) {
  return analyzeGameModes(items, enabledGames)
    .filter((entry) => enabledGames.includes(entry.mode) && (entry.status === "unavailable" || entry.status === "needs-content"))
    .map((entry) => `${GAME_MODE_CATALOG[entry.mode].name}: ${entry.reason}`);
}

export function prepareActivityForSave(activity: ActivitySet): ActivitySet {
  const items = normalizeItemsForModes(activity.items, activity.enabledGames).filter((item) => {
    const hasText = Boolean(clean(item.prompt) || clean(item.answer) || canonicalSentence(item));
    return hasText;
  });
  const enabledGames = compatibleEnabledGames(items, activity.enabledGames);
  return { ...activity, items, enabledGames, updatedAt: new Date().toISOString() };
}

export function enableCompatibleMode(activity: ActivitySet, mode: GameType) {
  const analysis = analyzeGameModes(activity.items, activity.enabledGames).find((entry) => entry.mode === mode);
  if (!analysis || !["recommended", "compatible", "enabled"].includes(analysis.status)) return null;
  const enabledGames = activity.enabledGames.includes(mode) ? activity.enabledGames : [...activity.enabledGames, mode];
  return prepareActivityForSave({ ...activity, enabledGames });
}

export function compatibleVariants(activity: ActivitySet) {
  return analyzeGameModes(activity.items, activity.enabledGames)
    .filter((entry) => entry.status === "recommended" || entry.status === "compatible");
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

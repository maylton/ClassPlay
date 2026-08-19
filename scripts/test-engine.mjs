import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importTypeScriptModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return import(moduleUrl);
}

const {
  buildChoiceOptions,
  gapOptions,
  isCorrectAnswer,
  normalizeAnswer,
  quizOptions,
  sentenceGapAnswer,
  sentenceWords,
  shouldUseCuratedQuizDistractors,
  shuffle,
} = await importTypeScriptModule("../src/lib/game-engine.ts");

assert.equal(normalizeAnswer("  Goes to School!  "), "goes to school");
assert.equal(isCorrectAnswer("GOES to school", "goes to school."), true);
assert.deepEqual(shuffle([1, 2, 3], () => 0), [2, 3, 1]);
assert.equal(sentenceGapAnswer({ prompt: "have breakfast", answer: "has breakfast", example: "She has breakfast before school.", gapSentence: "She _____ before school." }), "has breakfast");

const presentPerfectItem = {
  id: "present-perfect",
  prompt: "I _____ London twice.",
  answer: "have visited",
  example: "I have visited London twice.",
  gapSentence: "I _____ London twice.",
  distractors: ["visited", "visit", "has visited"],
};
const unrelatedItem = {
  id: "unrelated",
  prompt: "I _____ in a helicopter.",
  answer: "have never flown",
  example: "I have never flown in a helicopter.",
  gapSentence: "I _____ in a helicopter.",
  distractors: ["never flew", "never fly", "am never flying"],
};

assert.equal(sentenceGapAnswer(presentPerfectItem), "have visited");
assert.equal(shouldUseCuratedQuizDistractors(presentPerfectItem), true);

const safeQuizOptions = quizOptions(presentPerfectItem, [presentPerfectItem, unrelatedItem], () => 0);
assert.equal(safeQuizOptions.length, 4);
assert.ok(safeQuizOptions.includes("have visited"), "Quiz must always include the correct answer");
assert.ok(!safeQuizOptions.includes("have never flown"), "Grammar Quiz should prefer the item's curated distractors over unrelated answers");

const safeGapOptions = gapOptions(presentPerfectItem, [presentPerfectItem, unrelatedItem], () => 0);
assert.equal(safeGapOptions.length, 4);
assert.ok(safeGapOptions.includes("have visited"), "Gap Fill must always include the correct answer");
assert.ok(!safeGapOptions.includes("have never flown"), "Gap Fill should prefer the item's curated distractors over unrelated answers");

const translationItem = {
  id: "wake-up",
  prompt: "wake up",
  answer: "acordar",
  example: "I wake up at 6:30 every day.",
  gapSentence: "I _____ at 6:30 every day.",
  distractors: ["wakes up", "waking up", "woke up"],
};
const translationPool = [
  translationItem,
  { id: "brush", prompt: "brush my teeth", answer: "escovar os dentes", distractors: [] },
  { id: "breakfast", prompt: "have breakfast", answer: "tomar café da manhã", distractors: [] },
  { id: "school", prompt: "go to school", answer: "ir para a escola", distractors: [] },
];
assert.equal(shouldUseCuratedQuizDistractors(translationItem), false);
const translationQuizOptions = quizOptions(translationItem, translationPool, () => 0);
assert.ok(translationQuizOptions.includes("acordar"));
assert.ok(translationQuizOptions.includes("escovar os dentes"));
assert.ok(!translationQuizOptions.includes("wakes up"), "Translation Quiz should not reuse Gap Fill morphology distractors");

const conditionalItem = {
  id: "conditional",
  prompt: "rain tomorrow",
  answer: "If it rains tomorrow, we will stay home.",
  example: "If it rains tomorrow, we will stay home.",
  gapSentence: "If it rains tomorrow, we _____ home.",
  distractors: ["stay", "would stay", "stayed"],
};
const conditionalPool = [
  conditionalItem,
  { id: "study", prompt: "study hard", answer: "If you study hard, you will pass the test.", distractors: [] },
  { id: "bus", prompt: "miss the bus", answer: "If we miss the bus, we will be late.", distractors: [] },
  { id: "finish", prompt: "finish early", answer: "If she finishes early, she will call us.", distractors: [] },
];
assert.equal(shouldUseCuratedQuizDistractors(conditionalItem), false);
const conditionalQuizOptions = quizOptions(conditionalItem, conditionalPool, () => 0);
assert.ok(conditionalQuizOptions.includes("If it rains tomorrow, we will stay home."));
assert.ok(conditionalQuizOptions.every((option) => option.split(/\s+/).length >= 7), "Conditional Quiz should compare full conditional sentences, not isolated Gap Fill verbs");

const duplicateSafe = buildChoiceOptions("must", ["must", "might", "can't", "could"], ["should"], 4, () => 0);
assert.equal(duplicateSafe.filter((option) => normalizeAnswer(option) === "must").length, 1);
assert.ok(duplicateSafe.includes("must"));

assert.equal(
  sentenceGapAnswer({
    prompt: "mixed conditional",
    answer: "would be living",
    example: "If I had accepted the job, I would be living abroad now.",
    gapSentence: "If I _____ the job, I _____ abroad now.",
  }),
  "would be living",
  "Ambiguous legacy multi-gap data should fall back to its explicit answer instead of extracting nonsense",
);

assert.deepEqual(
  sentenceWords({ sentenceParts: ["She", "has breakfast", "before school."] }),
  ["She", "has", "breakfast", "before", "school."],
  "Sentence Builder should expose one draggable token per written word",
);
assert.deepEqual(
  sentenceWords({ sentenceParts: ["I", "don't have", "any coffee", "at home."] }),
  ["I", "don't", "have", "any", "coffee", "at", "home."],
  "Contractions should stay intact while multi-word chunks are split",
);

console.log("ClassPlay game engine smoke tests passed.");

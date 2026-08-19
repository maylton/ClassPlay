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

const safeQuizOptions = quizOptions(presentPerfectItem, [presentPerfectItem, unrelatedItem], () => 0);
assert.equal(safeQuizOptions.length, 4);
assert.ok(safeQuizOptions.includes("have visited"), "Quiz must always include the correct answer");
assert.ok(!safeQuizOptions.includes("have never flown"), "Quiz should prefer the item's curated distractors over unrelated answers");

const safeGapOptions = gapOptions(presentPerfectItem, [presentPerfectItem, unrelatedItem], () => 0);
assert.equal(safeGapOptions.length, 4);
assert.ok(safeGapOptions.includes("have visited"), "Gap Fill must always include the correct answer");
assert.ok(!safeGapOptions.includes("have never flown"), "Gap Fill should prefer the item's curated distractors over unrelated answers");

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

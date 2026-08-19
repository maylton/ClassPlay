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

async function importActivityIntelligence() {
  let source = await readFile(new URL("../src/lib/activity-intelligence.ts", import.meta.url), "utf8");
  source = source
    .replace(/^import .*english-phrase-matcher.*\n/m, "")
    .replace(/^import .*game-catalog.*\n/m, "")
    .replace(/^import type .*types.*\n/m, "");

  const prelude = `
const GAME_MODE_ORDER = ["flashcards","memory","matching","sentence-builder","gap-fill","quiz","space-blaster","word-maze"];
const GAME_MODE_CATALOG = Object.fromEntries(GAME_MODE_ORDER.map((mode) => [mode, { name: mode }]));
function findEnglishPhraseMatch(sentence, candidate) {
  const start = sentence.toLocaleLowerCase().indexOf(candidate.toLocaleLowerCase());
  return start < 0 ? null : { start, end: start + candidate.length, text: sentence.slice(start, start + candidate.length) };
}
`;

  const compiled = ts.transpileModule(`${prelude}\n${source}`, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return import(moduleUrl);
}

const { findEnglishPhraseMatch } = await importTypeScriptModule("../src/lib/english-phrase-matcher.ts");
const {
  MEMORY_MAX_PAIRS,
  chooseMemoryItems,
  memoryBoardPairCount,
} = await importTypeScriptModule("../src/lib/memory-board.ts");

function matchedText(sentence, target) {
  return findEnglishPhraseMatch(sentence, target)?.text ?? null;
}

assert.equal(matchedText("Marcel watches TV every evening.", "watch TV"), "watches TV");
assert.equal(matchedText("She studies English after lunch.", "study English"), "studies English");
assert.equal(matchedText("He goes to school by bus.", "go to school"), "goes to school");
assert.equal(matchedText("Anna has breakfast at seven.", "have breakfast"), "has breakfast");
assert.equal(matchedText("They watched TV last night.", "watch TV"), "watched TV");
assert.equal(matchedText("I am doing homework now.", "do homework"), "doing homework");
assert.equal(matchedText("She watches TV.", "watch"), "watches");
assert.equal(matchedText("The classroom is quiet.", "class"), null);

assert.equal(memoryBoardPairCount(2), 2);
assert.equal(memoryBoardPairCount(5), 4);
assert.equal(memoryBoardPairCount(7), 6);
assert.equal(memoryBoardPairCount(9), 8);
assert.equal(memoryBoardPairCount(11), 10);
assert.equal(memoryBoardPairCount(15), 12);
assert.equal(memoryBoardPairCount(18), 16);
assert.equal(memoryBoardPairCount(25), MEMORY_MAX_PAIRS);

const ninePairs = Array.from({ length: 9 }, (_, index) => ({ id: `pair-${index + 1}` }));
const firstBoard = chooseMemoryItems(ninePairs, [], () => 0);
const replayBoard = chooseMemoryItems(ninePairs, firstBoard.map((item) => item.id), () => 0);
assert.equal(firstBoard.length, 8);
assert.equal(replayBoard.length, 8);
assert.notDeepEqual(
  new Set(replayBoard.map((item) => item.id)),
  new Set(firstBoard.map((item) => item.id)),
  "Replay should swap in at least one unused pair when a larger pool exists.",
);

const intelligence = await importActivityIntelligence();

const lexicalItems = [
  { id: "lex-1", prompt: "A place where you borrow books.", answer: "library", example: "I study in the library." },
  { id: "lex-2", prompt: "A person in the same class as you.", answer: "classmate", example: "My classmate sits next to me." },
];
const lexical = intelligence.analyzeGameModes(lexicalItems, []);
assert.equal(lexical.find((entry) => entry.mode === "flashcards")?.status, "recommended");
assert.equal(lexical.find((entry) => entry.mode === "matching")?.status, "recommended");
assert.equal(lexical.find((entry) => entry.mode === "memory")?.status, "recommended");

const gapItems = [
  { id: "gap-1", prompt: "Ana _____ for a test now.", answer: "is studying", example: "Ana is studying for a test now.", gapSentence: "Ana _____ for a test now." },
  { id: "gap-2", prompt: "They _____ football.", answer: "are playing", example: "They are playing football.", gapSentence: "They _____ football." },
];
const gaps = intelligence.analyzeGameModes(gapItems, []);
assert.equal(gaps.find((entry) => entry.mode === "matching")?.status, "unavailable");
assert.equal(gaps.find((entry) => entry.mode === "flashcards")?.status, "unavailable");
assert.equal(gaps.find((entry) => entry.mode === "quiz")?.status, "recommended");
assert.equal(gaps.find((entry) => entry.mode === "gap-fill")?.status, "recommended");

const conditionalItems = [
  { id: "cond-1", prompt: "win the lottery", answer: "If I won the lottery, I would travel the world.", example: "If I won the lottery, I would travel the world." },
  { id: "cond-2", prompt: "have more time", answer: "If she had more time, she would learn Japanese.", example: "If she had more time, she would learn Japanese." },
];
const conditionals = intelligence.analyzeGameModes(conditionalItems, []);
assert.equal(conditionals.find((entry) => entry.mode === "matching")?.status, "recommended");
assert.equal(conditionals.find((entry) => entry.mode === "flashcards")?.status, "unavailable");
const conditionalMatches = intelligence.getPlayableItemsForMode(conditionalItems, "matching");
assert.match(conditionalMatches[0].prompt, /^If /);
assert.match(conditionalMatches[0].answer, /^…/);

const reportedItems = [
  { id: "rep-1", prompt: "“I am tired.” → She said that she ___ tired.", answer: "was", example: "She said that she was tired." },
  { id: "rep-2", prompt: "“We are studying.” → They said they ___ studying.", answer: "were", example: "They said they were studying." },
];
const reportedMatches = intelligence.getPlayableItemsForMode(reportedItems, "matching");
assert.equal(reportedMatches[0].prompt, "“I am tired.”");
assert.equal(reportedMatches[0].answer, "She said that she was tired.");

console.log("ClassPlay Smart Activity Builder regression tests passed.");

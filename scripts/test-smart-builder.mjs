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

console.log("ClassPlay Smart Activity Builder regression tests passed.");

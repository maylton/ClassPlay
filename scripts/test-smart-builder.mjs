import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/english-phrase-matcher.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { findEnglishPhraseMatch } = await import(moduleUrl);

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

console.log("ClassPlay Smart Activity Builder phrase matching tests passed.");

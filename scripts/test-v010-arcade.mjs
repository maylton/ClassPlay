import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function compileModule(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of replacements) source = source.replace(from, to);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}

const gameEngineUrl = await compileModule("../src/lib/game-engine.ts");
const derivedArcadeUrl = await compileModule("../src/lib/derived-arcade-engine.ts", [
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);
const wordTokenUrl = await compileModule("../src/lib/word-token-engine.ts", [
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);
const runnerUrl = await compileModule("../src/lib/grammar-runner-engine.ts", [
  ['from "./derived-arcade-engine"', `from "${derivedArcadeUrl}"`],
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);
const forgeUrl = await compileModule("../src/lib/phrase-forge-engine.ts", [
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
  ['from "./word-token-engine"', `from "${wordTokenUrl}"`],
]);

const runner = await import(runnerUrl);
const forge = await import(forgeUrl);
const wordTokens = await import(wordTokenUrl);

const items = [
  { id: "a", prompt: "watch TV", answer: "watches TV", example: "Marcel watches TV every evening.", gapSentence: "Marcel _____ every evening.", distractors: ["watch TV", "watching TV", "watched TV"], sentenceParts: ["Marcel", "watches", "TV", "every", "evening."] },
  { id: "b", prompt: "have breakfast", answer: "has breakfast", example: "Anna has breakfast at seven.", gapSentence: "Anna _____ at seven.", distractors: ["have breakfast", "having breakfast", "had breakfast"], sentenceParts: ["Anna", "has", "breakfast", "at", "seven."] },
  { id: "c", prompt: "go to school", answer: "goes to school", example: "Leo goes to school by bus.", gapSentence: "Leo _____ by bus.", distractors: ["go to school", "going to school", "went to school"], sentenceParts: ["Leo", "goes", "to", "school", "by", "bus."] },
  { id: "d", prompt: "study English", answer: "studies English", example: "Mia studies English after lunch.", gapSentence: "Mia _____ after lunch.", distractors: ["study English", "studying English", "studied English"], sentenceParts: ["Mia", "studies", "English", "after", "lunch."] },
];

assert.equal(runner.chooseGrammarRunnerSource("grammar", 4, 4), "gap-fill");
assert.equal(runner.chooseGrammarRunnerSource("vocabulary", 4, 4), "quiz");
assert.equal(runner.chooseGrammarRunnerSource("mixed", 4, 4), "quiz", "shared selector should resolve mixed ties consistently");
assert.equal(runner.grammarRunnerTravelMs(0), runner.GRAMMAR_RUNNER_MAX_TRAVEL_MS);
assert.equal(runner.grammarRunnerTravelMs(99), runner.GRAMMAR_RUNNER_MIN_TRAVEL_MS);
const fastGate = runner.resolveGrammarRunnerGate(true, 800, 2);
const lateGate = runner.resolveGrammarRunnerGate(true, 5000, 2);
const wrongGate = runner.resolveGrammarRunnerGate(false, 800, 3);
assert.equal(fastGate.perfect, true);
assert.ok(fastGate.points > lateGate.points);
assert.equal(wrongGate.nextStreak, 0);
for (const source of ["quiz", "gap-fill"]) {
  const rounds = runner.buildGrammarRunnerRounds(items, source, () => .33);
  assert.equal(rounds.length, items.length);
  for (const round of rounds) {
    assert.equal(round.gates.length, 3);
    assert.equal(round.gates.filter((gate) => gate.correct).length, 1);
    assert.ok(round.gates.some((gate) => gate.text === round.correctAnswer));
  }
}

const repeated = { id: "repeat", prompt: "", answer: "", sentenceParts: ["I", "really", "really", "like", "English."] };
const repeatedTokens = wordTokens.sentenceWordTokens(repeated, "test");
assert.equal(repeatedTokens.length, 5);
assert.equal(new Set(repeatedTokens.map((token) => token.id)).size, 5, "repeated words need unique positional IDs");
const moved = wordTokens.reorderWordTokens(repeatedTokens, repeatedTokens[2].id, repeatedTokens[1].id);
assert.equal(moved[1].sourceIndex, 2);

const forgeRounds = forge.buildPhraseForgeRounds([...items, repeated], () => .42);
const repeatedRound = forgeRounds.find((round) => round.itemId === "repeat");
assert.ok(repeatedRound);
assert.equal(new Set(repeatedRound.tokens.map((token) => token.id)).size, repeatedRound.tokens.length);
const ordered = [...repeatedRound.tokens].sort((a, b) => a.sourceIndex - b.sourceIndex);
assert.equal(forge.phraseForgeIsCorrect(ordered, repeatedRound.target), true);
assert.equal(forge.phraseForgeHeatLabel(34), "WARMING UP");
assert.equal(forge.phraseForgeHeatLabel(48), "HOT");
assert.equal(forge.phraseForgeHeatLabel(68), "BLAZING");
assert.equal(forge.phraseForgeHeatLabel(88), "MOLTEN");
const quickForge = forge.resolvePhraseForgeAttempt({ correct: true, responseMs: 1200, streak: 2, previousMistakes: 0, heat: 50 });
const slowForge = forge.resolvePhraseForgeAttempt({ correct: true, responseMs: 12000, streak: 2, previousMistakes: 0, heat: 50 });
const retryForge = forge.resolvePhraseForgeAttempt({ correct: true, responseMs: 1200, streak: 2, previousMistakes: 2, heat: 50 });
const wrongForge = forge.resolvePhraseForgeAttempt({ correct: false, responseMs: 2500, streak: 3, previousMistakes: 0, heat: 50 });
assert.ok(quickForge.points > slowForge.points);
assert.ok(quickForge.points > retryForge.points);
assert.equal(quickForge.masterForge, true);
assert.equal(wrongForge.points, 0);
assert.equal(wrongForge.nextStreak, 0);
assert.equal(wrongForge.nextHeat, 50 - forge.PHRASE_FORGE_WRONG_HEAT_LOSS);
assert.ok(quickForge.nextHeat > 50);

console.log("ClassPlay v0.10 Arcade regression tests passed.");

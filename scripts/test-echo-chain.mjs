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

function seeded(seed = 8317) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const gameEngineUrl = await compileModule("../src/lib/game-engine.ts");
const echoUrl = await compileModule("../src/lib/echo-chain-engine.ts", [
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);
const echo = await import(echoUrl);

const items = [
  { id: "a", prompt: "wake up", answer: "acordar", example: "I wake up at six every day." },
  { id: "b", prompt: "brush my teeth", answer: "escovar os dentes", sentenceParts: ["I", "brush", "my", "teeth", "after breakfast."] },
  { id: "c", prompt: "have breakfast", answer: "tomar café", gapSentence: "We _____ before school." },
  { id: "d", prompt: "go to school", answer: "ir à escola" },
  { id: "e", prompt: "have lunch", answer: "almoçar", example: "We have lunch at noon." },
  { id: "f", prompt: "do homework", answer: "fazer a tarefa", example: "They do homework after class." },
  { id: "g", prompt: "play games", answer: "jogar", example: "The children play games together." },
  { id: "h", prompt: "go to bed", answer: "ir dormir", example: "I go to bed at ten." },
  { id: "duplicate", prompt: "sleep", answer: "ir dormir", example: "I sleep at night." },
];

const ready = echo.buildEchoChainItems(items);
assert.equal(ready.length, 8, "duplicate tile labels must be removed");
assert.equal(ready.find((item) => item.itemId === "a").spokenText, "I wake up at six every day.", "full examples should be preferred");
assert.equal(ready.find((item) => item.itemId === "b").spokenText, "I brush my teeth after breakfast.", "sentence parts should become natural speech");
assert.equal(ready.find((item) => item.itemId === "c").spokenText, "have breakfast", "incomplete Gap Fill text must never be read aloud with a potentially wrong-language target");
assert.equal(ready.find((item) => item.itemId === "d").spokenText, "go to school", "the prompt should be the final source-language fallback");

assert.equal(echo.buildEchoChainGame(items.slice(0, 5), "easy", seeded()), null, "fewer than six pairs must not unlock listening mode");
for (const difficulty of ["easy", "medium", "challenge"]) {
  const game = echo.buildEchoChainGame(items, difficulty, seeded(91));
  assert.ok(game, `${difficulty} should build from listening-ready content`);
  assert.equal(game.board.length, 8);
  assert.equal(game.rounds.length, 6);
  assert.ok(game.rounds.every((round) => round.itemIds.length >= 1));
  assert.ok(game.rounds.every((round) => new Set(round.itemIds).size === round.itemIds.length), "a chain must not repeat a tile");
}

assert.equal(echo.echoChainMatches(["a", "b"], ["a", "b"]), true);
assert.equal(echo.echoChainMatches(["b", "a"], ["a", "b"]), false);
assert.equal(echo.echoChainMatches(["a"], ["a", "b"]), false);

const clean = echo.resolveEchoChainRound({ correct: true, responseMs: 1200, streak: 2, replays: 0, sequenceLength: 3, difficulty: "challenge" });
const replayed = echo.resolveEchoChainRound({ correct: true, responseMs: 1200, streak: 2, replays: 1, sequenceLength: 3, difficulty: "challenge" });
const slower = echo.resolveEchoChainRound({ correct: true, responseMs: 9000, streak: 2, replays: 0, sequenceLength: 3, difficulty: "challenge" });
const easy = echo.resolveEchoChainRound({ correct: true, responseMs: 1200, streak: 2, replays: 0, sequenceLength: 3, difficulty: "easy" });
assert.ok(clean.points > replayed.points, "replaying must reduce only the score bonus");
assert.ok(clean.points > slower.points, "faster listening recall should score more");
assert.ok(clean.points > easy.points, "Challenge must compensate for its longer memory load");
assert.deepEqual(echo.resolveEchoChainRound({ correct: false, responseMs: 500, streak: 4, replays: 0, sequenceLength: 2, difficulty: "medium" }), { points: 0, nextStreak: 0 });

const registry = await readFile(new URL("../src/components/games/game-registry.ts", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/lib/game-catalog.ts", import.meta.url), "utf8");
const readiness = await readFile(new URL("../src/lib/derived-arcade.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/games/EchoChainGame.tsx", import.meta.url), "utf8");
const tts = await readFile(new URL("../src/lib/tts.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/0021_echo_chain_practice_scores.sql", import.meta.url), "utf8");
assert.match(registry, /"echo-chain": EchoChainGame/);
assert.match(catalog, /"echo-chain"/);
assert.match(readiness, /"echo-chain": echoReady/);
assert.match(component, /Listen\. Hold the chain\. Tap it back\./);
assert.match(component, /prepareEnglishVoice/);
assert.match(tts, /ENHANCED_VOICE/);
assert.match(tts, /speakEnglishSequence/);
assert.match(migration, /practice_scores\.game_type = 'echo-chain'/);

console.log("Echo Chain engine, audio-quality and integration tests passed.");

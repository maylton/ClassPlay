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

function seeded(seed = 123456) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const gameEngineUrl = await compileModule("../src/lib/game-engine.ts");
const derivedUrl = await compileModule("../src/lib/derived-arcade-engine.ts", [
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);
const wordHuntUrl = await compileModule("../src/lib/word-hunt-engine.ts", [
  ['from "./derived-arcade-engine"', `from "${derivedUrl}"`],
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);
const typingRushUrl = await compileModule("../src/lib/typing-rush-engine.ts", [
  ['from "./derived-arcade-engine"', `from "${derivedUrl}"`],
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);
const hunt = await import(wordHuntUrl);
const typing = await import(typingRushUrl);

const items = [
  { id: "a", prompt: "A red or green fruit", answer: "apple", gapSentence: "I eat an ___ every day.", distractors: ["orange", "banana", "pear"] },
  { id: "b", prompt: "A place where students learn", answer: "school", gapSentence: "I go to ___ at 7:30.", distractors: ["home", "park", "market"] },
  { id: "c", prompt: "A hot drink", answer: "coffee", gapSentence: "My dad drinks ___ in the morning.", distractors: ["juice", "water", "milk"] },
  { id: "d", prompt: "A person you like spending time with", answer: "friend", gapSentence: "Leo is my best ___.", distractors: ["teacher", "student", "brother"] },
  { id: "e", prompt: "A person who helps you learn", answer: "teacher", gapSentence: "Our English ___ is funny.", distractors: ["doctor", "driver", "chef"] },
];

assert.equal(hunt.chooseWordHuntSource("vocabulary", 5, 5), "quiz");
assert.equal(hunt.chooseWordHuntSource("grammar", 5, 5), "gap-fill");
assert.equal(hunt.normalizeWordHuntTarget("ice-cream!"), "ICECREAM");
assert.equal(hunt.normalizeWordHuntTarget("café"), "CAFE");

const board = hunt.buildWordHuntBoard(items, "quiz", seeded(77));
assert.ok(board, "Word Hunt should build a board from eligible vocabulary");
assert.ok(board.targets.length >= 3);
assert.ok(board.size >= 9 && board.size <= 12);
for (const target of board.targets) {
  const letters = target.path.map((cell) => board.letters[cell.row][cell.col]).join("");
  assert.equal(letters, target.target, "placed path must spell its target");
  assert.equal(hunt.wordHuntSelectionMatches(target.path, target.path), true);
  assert.equal(hunt.wordHuntSelectionMatches([...target.path].reverse(), target.path), true);
}
const diagonal = hunt.wordHuntPathBetween({ row: 1, col: 1 }, { row: 4, col: 4 }, 9);
assert.equal(diagonal.length, 4);
assert.equal(hunt.wordHuntPathBetween({ row: 1, col: 1 }, { row: 3, col: 4 }, 9).length, 0);
assert.ok(hunt.resolveWordHuntFind(1200, 2, false).points > hunt.resolveWordHuntFind(1200, 2, true).points);
assert.ok(hunt.resolveWordHuntFind(1200, 2, false).points > hunt.resolveWordHuntFind(12000, 2, false).points);

assert.equal(typing.chooseTypingRushSource("vocabulary", 5, 5), "quiz");
assert.equal(typing.chooseTypingRushSource("grammar", 5, 5), "gap-fill");
const typingRounds = typing.buildTypingRushRounds(items, "quiz", seeded(99));
assert.equal(typingRounds.length, items.length);
assert.equal(typing.typingRushIsCorrect("  APPLE! ", "apple"), true);
assert.equal(typing.typingRushIsCorrect("ice cream", "ice-cream"), true);
assert.equal(typing.typingRushIsCorrect("dont", "don't"), true);
assert.equal(typing.typingRushIsCorrect("apples", "apple"), false);
assert.equal(typing.typingRushIsNearMiss("appl", "apple"), true);
assert.equal(typing.typingRushIsNearMiss("banana", "apple"), false);
assert.equal(typing.typingRushTimePercent(0), 100);
assert.equal(typing.typingRushTimePercent(typing.TYPING_RUSH_ROUND_MS), 0);
assert.ok(typing.resolveTypingRushCorrect(1000, 3, 1).points > typing.resolveTypingRushCorrect(10000, 3, 1).points);
assert.ok(typing.resolveTypingRushCorrect(1000, 3, 1).points > typing.resolveTypingRushCorrect(1000, 3, 2).points);

const registry = await readFile(new URL("../src/components/games/game-registry.ts", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/lib/game-catalog.ts", import.meta.url), "utf8");
const readiness = await readFile(new URL("../src/lib/derived-arcade.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/0020_word_hunt_typing_rush_practice_scores.sql", import.meta.url), "utf8");
assert.match(registry, /"word-hunt": WordHuntGame/);
assert.match(registry, /"typing-rush": TypingRushGame/);
assert.match(catalog, /"word-hunt"[\s\S]*"typing-rush"/);
assert.match(readiness, /"word-hunt": questionReady/);
assert.match(readiness, /"typing-rush": questionReady/);
assert.match(migration, /'word-hunt', 'typing-rush'/);

console.log("Word Hunt and Typing Rush engine + integration tests passed.");

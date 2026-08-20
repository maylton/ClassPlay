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
const towerUrl = await compileModule("../src/lib/tower-stack-engine.ts", [
  ['from "./derived-arcade-engine"', `from "${derivedArcadeUrl}"`],
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);
const tower = await import(towerUrl);

const items = [
  { id: "a", prompt: "watch TV", answer: "watches TV", example: "Marcel watches TV every evening.", gapSentence: "Marcel _____ every evening.", distractors: ["watch TV", "watching TV", "watched TV"] },
  { id: "b", prompt: "have breakfast", answer: "has breakfast", example: "Anna has breakfast at seven.", gapSentence: "Anna _____ at seven.", distractors: ["have breakfast", "having breakfast", "had breakfast"] },
  { id: "c", prompt: "go to school", answer: "goes to school", example: "Leo goes to school by bus.", gapSentence: "Leo _____ by bus.", distractors: ["go to school", "going to school", "went to school"] },
  { id: "d", prompt: "study English", answer: "studies English", example: "Mia studies English after lunch.", gapSentence: "Mia _____ after lunch.", distractors: ["study English", "studying English", "studied English"] },
];

assert.equal(tower.chooseTowerStackSource("grammar", 4, 4), "gap-fill");
assert.equal(tower.chooseTowerStackSource("vocabulary", 4, 4), "quiz");
assert.equal(tower.chooseTowerStackSource("mixed", 2, 2), null);

for (const source of ["quiz", "gap-fill"]) {
  const rounds = tower.buildTowerStackRounds(items, source, () => .37);
  assert.equal(rounds.length, items.length);
  for (const round of rounds) {
    assert.ok(round.options.includes(round.correctAnswer));
    assert.ok(round.options.length >= 3);
  }
}

assert.equal(tower.resolveTowerStackAnswer(false, 1000, 4).nextStreak, 0);
assert.equal(tower.resolveTowerStackAnswer(true, 900, 0).reward, "slow");
assert.equal(tower.resolveTowerStackAnswer(true, 4000, 2).reward, "wide");
assert.equal(tower.resolveTowerStackAnswer(true, 4000, 4).reward, "perfect");
assert.ok(tower.resolveTowerStackAnswer(true, 900, 1).points > tower.resolveTowerStackAnswer(true, 14000, 1).points);

assert.ok(tower.towerSweepDurationMs(12, "normal") < tower.towerSweepDurationMs(0, "normal"));
assert.ok(tower.towerSweepDurationMs(5, "slow") > tower.towerSweepDurationMs(5, "normal"));
const movingX = tower.towerMovingBlockX(800, 2400, 40);
assert.ok(movingX > 0 && movingX <= 60);

const base = { x: 20, width: 60 };
const perfect = tower.resolveTowerPlacement(base, { x: 20.5, width: 60 }, "normal");
assert.equal(perfect.landed, true);
assert.equal(perfect.perfect, true);
assert.equal(perfect.width, 60);

const cropped = tower.resolveTowerPlacement(base, { x: 44, width: 60 }, "normal");
assert.equal(cropped.landed, true);
assert.equal(cropped.perfect, false);
assert.ok(cropped.width < 60);

const missed = tower.resolveTowerPlacement(base, { x: 86, width: 14 }, "normal");
assert.equal(missed.landed, false);
assert.equal(missed.points, 0);

const recovered = tower.resolveTowerPlacement(base, { x: 14, width: 74 }, "wide");
assert.equal(recovered.landed, true);
assert.equal(recovered.recovered, true);
assert.ok(recovered.width > base.width);

const guaranteed = tower.resolveTowerPlacement({ x: 32, width: 34 }, { x: 0, width: 34 }, "perfect");
assert.deepEqual({ x: guaranteed.x, width: guaranteed.width }, { x: 32, width: 34 });
assert.equal(tower.towerHeightMeters(10), 42);
assert.equal(tower.towerRank(130), "Skyline Master");

console.log("Tower Stack engine regression tests passed.");

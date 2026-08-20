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
const bossUrl = await compileModule("../src/lib/boss-battle-engine.ts", [
  ['from "./derived-arcade-engine"', `from "${derivedArcadeUrl}"`],
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);
const bubbleUrl = await compileModule("../src/lib/bubble-burst-engine.ts", [
  ['from "./derived-arcade-engine"', `from "${derivedArcadeUrl}"`],
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);

const boss = await import(bossUrl);
const bubble = await import(bubbleUrl);

const items = [
  { id: "a", prompt: "watch TV", answer: "watches TV", example: "Marcel watches TV every evening.", gapSentence: "Marcel _____ every evening.", distractors: ["watch TV", "watching TV", "watched TV"] },
  { id: "b", prompt: "have breakfast", answer: "has breakfast", example: "Anna has breakfast at seven.", gapSentence: "Anna _____ at seven.", distractors: ["have breakfast", "having breakfast", "had breakfast"] },
  { id: "c", prompt: "go to school", answer: "goes to school", example: "Leo goes to school by bus.", gapSentence: "Leo _____ by bus.", distractors: ["go to school", "going to school", "went to school"] },
  { id: "d", prompt: "study English", answer: "studies English", example: "Mia studies English after lunch.", gapSentence: "Mia _____ after lunch.", distractors: ["study English", "studying English", "studied English"] },
];

assert.equal(boss.chooseBossBattleSource("grammar", 4, 4), "gap-fill");
assert.equal(boss.chooseBossBattleSource("vocabulary", 4, 4), "quiz");
assert.equal(boss.chooseBossBattleSource("mixed", 2, 2), null);
assert.equal(boss.bossForKind("grammar").name, "Ignis");
assert.equal(boss.bossForKind("vocabulary").name, "Ignis");
assert.equal(boss.bossForKind("mixed").name, "Ignis");
assert.ok(boss.bossMaxHp(4) >= 600);

const slowHit = boss.resolveBossBattleHit(true, 13000, 0);
const mediumHit = boss.resolveBossBattleHit(true, 6000, 0);
const criticalHit = boss.resolveBossBattleHit(true, 900, 3);
const wrongHit = boss.resolveBossBattleHit(false, 1200, 4);
assert.equal(slowHit.correct, true);
assert.equal(wrongHit.heartsLost, 1);
assert.equal(wrongHit.nextStreak, 0);
assert.equal(criticalHit.critical, true);
assert.ok(criticalHit.damage > mediumHit.damage);
assert.ok(mediumHit.damage > slowHit.damage);
assert.ok(criticalHit.points > 0);

for (const source of ["quiz", "gap-fill"]) {
  const rounds = boss.buildBossBattleRounds(items, source, () => .37);
  assert.equal(rounds.length, items.length);
  for (const round of rounds) {
    assert.ok(round.correctAnswer);
    assert.ok(round.options.includes(round.correctAnswer), "Boss Battle must never drop the correct answer");
    assert.equal(new Set(round.options).size, round.options.length);
  }
}

assert.equal(bubble.chooseBubbleBurstSource("grammar", 4, 4), "gap-fill");
assert.equal(bubble.chooseBubbleBurstSource("vocabulary", 4, 4), "quiz");
assert.equal(bubble.chooseBubbleBurstSource("mixed", 2, 2), null);
const quickPop = bubble.resolveBubbleBurstHit(900, 2);
const slowPop = bubble.resolveBubbleBurstHit(9000, 0);
assert.equal(quickPop.perfect, true);
assert.ok(quickPop.points > slowPop.points);
assert.equal(quickPop.nextStreak, 3);

const layout = bubble.createBubbleBurstLayout(4, () => .42);
assert.equal(layout.length, 4);
assert.equal(new Set(layout.map((entry) => `${Math.round(entry.x)},${Math.round(entry.y)}`)).size, 4);
for (const entry of layout) {
  assert.ok(entry.x >= 12 && entry.x <= 88);
  assert.ok(entry.y >= 18 && entry.y <= 82);
  assert.ok(entry.size >= 126 && entry.size <= 158);
}

for (const source of ["quiz", "gap-fill"]) {
  const rounds = bubble.buildBubbleBurstRounds(items, source, () => .31);
  assert.equal(rounds.length, items.length);
  for (const round of rounds) {
    assert.ok(round.correctAnswer);
    assert.ok(round.options.includes(round.correctAnswer), "Bubble Burst must never drop the correct answer");
    assert.equal(new Set(round.options).size, round.options.length);
  }
}

const catalog = await readFile(new URL("../src/lib/game-catalog.ts", import.meta.url), "utf8");
assert.match(catalog, /"boss-battle"/);
assert.match(catalog, /"bubble-burst"/);
const authorableStart = catalog.indexOf("export const GAME_MODE_ORDER");
const derivedStart = catalog.indexOf("export const DERIVED_ARCADE_MODE_ORDER");
const authorableOrder = catalog.slice(authorableStart, derivedStart);
assert.doesNotMatch(authorableOrder, /boss-battle|bubble-burst|grammar-runner|phrase-forge/, "Derived Arcade modes must stay out of authorable mode order");

const registry = await readFile(new URL("../src/components/games/game-registry.ts", import.meta.url), "utf8");
assert.match(registry, /"boss-battle": BossBattleGame/);
assert.match(registry, /"bubble-burst": BubbleBurstGame/);

const migration = await readFile(new URL("../supabase/migrations/0018_v010_derived_arcade_practice_scores.sql", import.meta.url), "utf8");
assert.match(migration, /'boss-battle'/);
assert.match(migration, /'bubble-burst'/);
assert.match(migration, /'grammar-runner'/);
assert.match(migration, /'phrase-forge'/);
assert.match(migration, /unlisted practice scores link submit/);

console.log("ClassPlay Arcade expansion regression tests passed.");

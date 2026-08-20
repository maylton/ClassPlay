import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hub = await readFile(new URL("../src/components/GameHub.tsx", import.meta.url), "utf8");
const stage = await readFile(new URL("../src/components/games/GameStage.tsx", import.meta.url), "utf8");
const registry = await readFile(new URL("../src/components/games/game-registry.ts", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/lib/game-catalog.ts", import.meta.url), "utf8");
const boss = await readFile(new URL("../src/lib/boss-battle-engine.ts", import.meta.url), "utf8");
const bubble = await readFile(new URL("../src/lib/bubble-burst-engine.ts", import.meta.url), "utf8");
const runner = await readFile(new URL("../src/lib/grammar-runner-engine.ts", import.meta.url), "utf8");
const tower = await readFile(new URL("../src/lib/tower-stack-engine.ts", import.meta.url), "utf8");
const sentence = await readFile(new URL("../src/components/games/SentenceBuilderGame.tsx", import.meta.url), "utf8");
const forge = await readFile(new URL("../src/components/games/PhraseForgeGame.tsx", import.meta.url), "utf8");

assert.match(stage, /GAME_COMPONENTS\[mode\]/, "GameStage should consume the shared game registry");
assert.match(hub, /GAME_COMPONENTS\[mode\]/, "GameHub should consume the shared game registry");
assert.doesNotMatch(hub, /import \{ (?:BossBattleGame|BubbleBurstGame|FlashcardsGame|GrammarRunnerGame|PhraseForgeGame|TowerStackGame)/, "GameHub must not rebuild the renderer registry with per-game imports");
assert.doesNotMatch(hub, /mode === "(?:flashcards|memory|matching|sentence-builder|gap-fill|quiz|space-blaster|word-maze|boss-battle|bubble-burst|grammar-runner|phrase-forge|tower-stack)"/, "GameHub must not rebuild the renderer registry with mode branches");
assert.doesNotMatch(hub, /const ARCADE_MODES/, "Arcade classification should live in game-catalog");
assert.doesNotMatch(hub, /bossReady|bubbleReady|runnerReady|forgeReady|towerReady/, "derived Arcade readiness should be generic");

for (const game of ["flashcards", "memory", "matching", "sentence-builder", "gap-fill", "quiz", "space-blaster", "word-maze", "boss-battle", "bubble-burst", "grammar-runner", "phrase-forge", "tower-stack"]) {
  assert.match(registry, new RegExp(`(?:^|\\n)\\s*"?${game}"?:`), `shared registry should contain ${game}`);
}

const authorableStart = catalog.indexOf("export const GAME_MODE_ORDER");
const derivedStart = catalog.indexOf("export const DERIVED_ARCADE_MODE_ORDER");
const authorable = catalog.slice(authorableStart, derivedStart);
for (const derived of ["boss-battle", "bubble-burst", "grammar-runner", "phrase-forge", "tower-stack"]) {
  assert.doesNotMatch(authorable, new RegExp(derived), `${derived} must stay runtime-derived`);
}

for (const [name, source] of [["Boss Battle", boss], ["Bubble Burst", bubble], ["Grammar Runner", runner], ["Tower Stack", tower]]) {
  assert.match(source, /from "\.\/derived-arcade-engine"/, `${name} should share the Quiz/Gap adapter`);
  assert.doesNotMatch(source, /gapOptions|quizOptions|shouldUseCuratedQuizDistractors/, `${name} must not duplicate choice-building logic`);
}
assert.match(sentence, /word-token-engine/, "Sentence Builder should use shared word tokens");
assert.match(forge, /word-token-engine/, "Phrase Forge should use shared word tokens");
assert.doesNotMatch(sentence, /type Token =/, "Sentence Builder must not define a parallel word-token model");

console.log("ClassPlay game architecture contract tests passed.");

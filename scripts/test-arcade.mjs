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
const arcadeUrl = await compileModule("../src/lib/arcade-engine.ts", [
  ['from "./game-engine"', `from "${gameEngineUrl}"`],
]);
const mazeChaseUrl = await compileModule("../src/lib/maze-chase.ts", [
  ['from "./arcade-engine"', `from "${arcadeUrl}"`],
]);
const arcade = await import(arcadeUrl);
const mazeChase = await import(mazeChaseUrl);
const wordMazeCss = await readFile(new URL("../src/app/word-maze.css", import.meta.url), "utf8");

const items = [
  { id: "a", prompt: "watch TV", answer: "", example: "Marcel watches TV every evening.", gapSentence: "Marcel _____ every evening." },
  { id: "b", prompt: "have breakfast", answer: "", example: "Anna has breakfast at seven.", gapSentence: "Anna _____ at seven." },
  { id: "c", prompt: "go to school", answer: "", example: "Leo goes to school by bus.", gapSentence: "Leo _____ by bus." },
  { id: "d", prompt: "study English", answer: "", example: "Mia studies English after lunch.", gapSentence: "Mia _____ after lunch." },
];

const round = arcade.buildArcadeRound(items[0], items, 4, () => 0.42);
assert.equal(round.correctAnswer, "watches TV");
assert.equal(round.prompt, "Marcel _____ every evening.");
assert.ok(round.options.includes("watches TV"));
assert.equal(new Set(round.options).size, round.options.length);
assert.ok(round.options.length >= 3 && round.options.length <= 4);

const rounds = arcade.buildArcadeRounds(items, 3, () => 0.31);
assert.equal(rounds.length, 4);
for (const candidate of rounds) assert.ok(candidate.options.includes(candidate.correctAnswer));

assert.equal(arcade.WORD_MAZE_TEMPLATES.length, 6);
assert.equal(new Set(arcade.WORD_MAZE_TEMPLATES.map((template) => template.id)).size, 6);

// Word Maze must adapt to viewport height, not only viewport width. Laptop
// layouts keep controls beside the board so the prompt and full maze remain
// visible together, while short/mobile viewports receive tighter fallbacks.
assert.match(wordMazeCss, /grid-template-areas:/, "desktop Word Maze should place controls beside the maze");
assert.match(wordMazeCss, /@media \(max-height: 900px\)/, "Word Maze should have a laptop-height breakpoint");
assert.match(wordMazeCss, /78dvh/, "Word Maze board sizing should respond to dynamic viewport height");
assert.match(wordMazeCss, /@media \(max-width: 620px\) and \(max-height: 720px\)/, "Word Maze should compact short mobile screens");
assert.match(wordMazeCss, /55dvh/, "short mobile Word Maze should reserve vertical space for prompt and controls");

function key(position) { return `${position.x},${position.y}`; }

// Every map is roomier, fully connected, and exposes only non-blocking answer zones.
for (const template of arcade.WORD_MAZE_TEMPLATES) {
  assert.ok(template.map.length >= 11, `${template.id} should have at least 11 rows`);
  assert.ok(template.map[0].length >= 15, `${template.id} should have at least 15 columns`);
  assert.ok(template.map.every((row) => row.length === template.map[0].length), `${template.id} rows should have equal width`);
  assert.equal(arcade.isMazeOpen(template.start, template.map), true, `${template.id} start should be open`);

  const reachable = arcade.reachableMazePositions(template.map, template.start);
  const openCells = template.map.flatMap((row, y) => [...row].map((cell, x) => cell === "#" ? null : { x, y })).filter(Boolean);
  assert.equal(reachable.length, openCells.length, `${template.id} should be one connected maze`);

  const candidates = arcade.mazePortalCandidates(template.map, template.start);
  assert.ok(candidates.length >= 7, `${template.id} should provide varied portal positions`);
  assert.equal(new Set(candidates.map(key)).size, candidates.length, `${template.id} portal candidates should be unique`);
  for (const position of candidates) {
    assert.equal(arcade.isMazeOpen(position, template.map), true);
    assert.equal(
      arcade.isMazePortalSafe(template.map, template.start, position),
      true,
      `${template.id} portal ${key(position)} must not be a mandatory corridor`,
    );
  }
}

// Consecutive early levels use different maps, place three escapable portals and scale the chase.
const levelRounds = Array.from({ length: 8 }, (_, index) => rounds[index % rounds.length]);
const levels = levelRounds.map((candidate, index) => arcade.buildMazeLevel(candidate, index, () => 0.37));
assert.equal(new Set(levels.slice(0, 6).map((level) => level.id.split("-").slice(1).join("-"))).size, 6);
for (const level of levels) {
  assert.equal(level.portals.length, 3);
  assert.equal(new Set(level.portals.map(key)).size, 3);
  for (const portal of level.portals) {
    assert.equal(arcade.isMazeOpen(portal, level.map), true);
    assert.equal(arcade.isMazePortalSafe(level.map, level.start, portal), true);
  }
  for (const monster of level.monsters) assert.equal(arcade.isMazeOpen(monster.position, level.map), true);
}
assert.equal(levels[0].monsters.length, 1);
assert.equal(levels[2].monsters.length, 2);
assert.equal(levels[6].monsters.length, 3);
assert.ok(levels[0].monsterIntervalMs > levels[3].monsterIntervalMs);
assert.ok(levels[3].monsterIntervalMs > levels[6].monsterIntervalMs);

// Maze movement still respects walls and dynamic portal lists.
const first = levels[0];
assert.deepEqual(arcade.moveMazePlayer(first.start, "down", first.map), first.start);
for (let index = 0; index < first.portals.length; index += 1) {
  assert.equal(arcade.mazePortalIndex(first.portals[index], first.portals), index);
}
assert.equal(arcade.mazePortalIndex(first.start, first.portals), -1);

// Chasers take a legal first step along a route toward the player.
const monster = first.monsters[0];
const chaseStep = arcade.nextMazeMonsterStep(first.map, monster.position, first.start);
assert.equal(arcade.isMazeOpen(chaseStep, first.map), true);
const movementDistance = Math.abs(chaseStep.x - monster.position.x) + Math.abs(chaseStep.y - monster.position.y);
assert.ok(movementDistance <= 1, "Monster should move at most one maze cell per tick");

// Once inside a corridor, a monster must finish the corridor before changing
// its mind. It may recalculate and turn back only after reaching the junction.
const commitmentMap = [
  "#########",
  "#.......#",
  "###.#####",
  "#...#####",
  "#########",
];
const corridorStep = mazeChase.nextCommittedMazeMonsterStep(
  commitmentMap,
  { x: 2, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: 1 },
);
assert.deepEqual(corridorStep, { x: 3, y: 1 }, "Monster should not U-turn in the middle of a corridor");

const junctionDecision = mazeChase.nextCommittedMazeMonsterStep(
  commitmentMap,
  { x: 3, y: 1 },
  { x: 2, y: 1 },
  { x: 1, y: 1 },
);
assert.deepEqual(junctionDecision, { x: 2, y: 1 }, "Monster may recalculate its route at a junction");

console.log("ClassPlay Arcade engine regression tests passed.");

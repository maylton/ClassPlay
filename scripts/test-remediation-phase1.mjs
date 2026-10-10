import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function compile(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

// 1.1 — post-auth redirects stay on the ClassPlay origin.
const { safeNextPath } = await compile(await read("src/lib/safe-redirect.ts"));
assert.equal(safeNextPath("/classes/abc?tab=1"), "/classes/abc?tab=1");
assert.equal(safeNextPath("/class/join?complete=1&code=AB12CD"), "/class/join?complete=1&code=AB12CD");
for (const hostile of ["//evil.example", "/\\evil.example", "/\t/evil.example", "https://evil.example", "evil.example", "", null, undefined]) {
  assert.equal(safeNextPath(hostile), "/dashboard", `must reject ${JSON.stringify(hostile)}`);
}
for (const file of ["src/app/auth/page.tsx", "src/app/auth/callback/route.ts"]) {
  const source = await read(file);
  assert.match(source, /safeNextPath\(/, `${file} must validate the next path`);
  assert.doesNotMatch(source, /startsWith\("\/"\)/, `${file} must not rely on startsWith("/")`);
}

// 1.2 — the teacher library is scoped to the signed-in owner.
const activityRepository = await read("src/lib/repositories/activity-repository.ts");
const listActivities = activityRepository.match(/export async function listActivities\(\)[\s\S]*?\n\}/)?.[0] ?? "";
assert.match(listActivities, /\.eq\("owner_id", context\.user\.id\)/, "listActivities must filter by owner_id");

// 1.5 — any run of 2+ underscores is a gap.
let intelligenceSource = await read("src/lib/activity-intelligence.ts");
intelligenceSource = intelligenceSource
  .replace(/^import .*english-phrase-matcher.*\n/m, "")
  .replace(/^import .*game-catalog.*\n/m, "")
  .replace(/^import type .*types.*\n/m, "");
const intelligence = await compile(`
const GAME_MODE_ORDER = ["flashcards","memory","matching","sentence-builder","gap-fill","quiz","space-blaster","word-maze"];
const GAME_MODE_CATALOG = Object.fromEntries(GAME_MODE_ORDER.map((mode) => [mode, { name: mode }]));
function findEnglishPhraseMatch(sentence, candidate) {
  const start = sentence.toLocaleLowerCase().indexOf(candidate.toLocaleLowerCase());
  return start < 0 ? null : { start, end: start + candidate.length, text: sentence.slice(start, start + candidate.length) };
}
${intelligenceSource}`);

assert.equal(intelligence.normalizeGapMarker("She ___ to school."), "She _____ to school.");
assert.equal(intelligence.normalizeGapMarker("She __ to school ________."), "She _____ to school _____.");

const typedBlanks = [
  { id: "g1", prompt: "go", answer: "goes", gapSentence: "She ___ to school." },
  { id: "g2", prompt: "play", answer: "plays", gapSentence: "He __ football." },
];
const playable = intelligence.getPlayableItemsForMode(typedBlanks, "gap-fill");
assert.equal(playable.length, 2, "Short teacher-typed blanks must stay playable in Gap Fill");
assert.deepEqual(playable.map((item) => item.gapSentence), ["She _____ to school.", "He _____ football."]);

const customGap = [{ id: "c1", prompt: "go", answer: "goes", example: "She goes to school by bus.", gapSentence: "She goes ___ school by bus." }];
assert.equal(
  intelligence.getPlayableItemsForMode([...customGap, ...typedBlanks], "gap-fill")[0].gapSentence,
  "She goes _____ school by bus.",
  "A teacher's own gap must not be replaced by the auto-generated one",
);
assert.equal(intelligence.normalizeItemsForModes(customGap, ["gap-fill"])[0].gapSentence, "She goes _____ school by bus.");

// 1.3, 1.4, 1.6 — database contracts.
const migration = await read("supabase/migrations/0023_phase1_integrity_fixes.sql");
const trigger = migration.match(/create or replace function public\.set_round_started_at\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
assert.match(trigger, /'itemId'/, "The round clock must restart when the question changes");
assert.match(trigger, /'dynamiteTurnId'/, "The round clock must restart when a Dynamite turn changes");
assert.doesNotMatch(trigger, /new\.current_question is distinct from old\.current_question/, "In-turn updates must not reset the round clock");

const normalize = migration.match(/create or replace function public\.classplay_normalize[\s\S]*?\$\$;/)?.[0] ?? "";
assert.match(normalize, /'\\s\+'/, "Whitespace must collapse with a real \\s+ regex");
assert.doesNotMatch(normalize, /'\\\\s\+'/, "The literal-backslash regex from 0001 must be gone");
assert.match(normalize, /’/, "Typographic apostrophes must be folded");

const join = migration.match(/create or replace function public\.join_classroom_account[\s\S]*?\$\$;/)?.[0] ?? "";
assert.match(join, /not v_existing\.active/, "Removed members must be refused");
assert.doesNotMatch(join, /active = true\s*\n\s*returning/, "Rejoining must not reactivate a removed member");

console.log("Remediation phase 1 checks passed.");

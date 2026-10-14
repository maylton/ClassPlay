import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function compileModule(path, replacements = []) {
  let source = await read(path);
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

const gameEngineUrl = await compileModule("src/lib/game-engine.ts");
const derivedUrl = await compileModule("src/lib/derived-arcade-engine.ts", [['from "./game-engine"', `from "${gameEngineUrl}"`]]);
const withEngines = [['from "./derived-arcade-engine"', `from "${derivedUrl}"`], ['from "./game-engine"', `from "${gameEngineUrl}"`]];
const typing = await import(await compileModule("src/lib/typing-rush-engine.ts", withEngines));
const hunt = await import(await compileModule("src/lib/word-hunt-engine.ts", withEngines));
const engine = await import(gameEngineUrl);
const matcher = await import(await compileModule("src/lib/english-phrase-matcher.ts"));
const quality = await import(await compileModule("src/lib/activity-quality.ts", [['from "./game-engine"', `from "${gameEngineUrl}"`]]));
const languages = await import(await compileModule("src/lib/languages.ts"));

// 5.2 typed answers work in any script.
assert.equal(typing.typingRushIsCorrect("  Здравствуйте! ", "здравствуйте"), true, "Cyrillic answers can be typed");
assert.equal(typing.typingRushIsCorrect("がっこう", "がっこう"), true, "Japanese answers can be typed");
assert.equal(typing.typingRushIsCorrect("かっこう", "がっこう"), false, "Dakuten is not an accent: か ≠ が");
assert.equal(typing.typingRushIsCorrect("dont", "don't"), true, "English behaviour is unchanged");
assert.equal(typing.typingRushIsCorrect("don’t", "don't"), true, "Typographic apostrophes are accepted");

// 5.3 strict accents.
assert.equal(typing.typingRushIsCorrect("esta", "está"), true, "Accents are forgiven by default");
assert.equal(typing.typingRushIsCorrect("esta", "está", { strictAccents: true }), false, "Strict mode requires the accent");
assert.equal(typing.typingRushIsCorrect("ESTÁ", "está", { strictAccents: true }), true, "Strict mode still ignores case");

// 5.4 accepted answers.
assert.equal(typing.typingRushIsCorrect("large", "big", { acceptedAnswers: ["large", "huge"] }), true);
assert.equal(typing.typingRushIsNearMiss("larg", "big", { acceptedAnswers: ["large"] }), true, "Near misses also consider accepted answers");
const options = engine.buildChoiceOptions("big", ["large", "small", "tiny"], ["red", "tall"], 4, seeded(5), ["large"]);
assert.ok(options.includes("big") && !options.includes("large"), "An accepted answer is never offered as a wrong option");
const quizOptions = engine.quizOptions(
  { id: "a", prompt: "grande", answer: "big", acceptedAnswers: ["large"] },
  [{ id: "b", prompt: "enorme", answer: "large" }, { id: "c", prompt: "pequeño", answer: "small" }, { id: "d", prompt: "rojo", answer: "red" }],
  seeded(9),
);
assert.ok(!quizOptions.includes("large"), "Another item's answer that is accepted here is not a distractor");

// 5.2 Word Hunt in other scripts.
assert.equal(hunt.normalizeWordHuntTarget("ice-cream!"), "ICECREAM");
assert.equal(hunt.normalizeWordHuntTarget("café"), "CAFE");
assert.equal(hunt.normalizeWordHuntTarget("está", true), "ESTÁ", "Strict accents keep accented letters in the grid");
assert.deepEqual(hunt.wordHuntLetters(hunt.normalizeWordHuntTarget("がっこう")), ["が", "っ", "こ", "う"], "Dakuten stays with its letter");
const russian = [
  { id: "a", prompt: "dog", answer: "собака" },
  { id: "b", prompt: "cat", answer: "кошка" },
  { id: "c", prompt: "house", answer: "дом" },
  { id: "d", prompt: "water", answer: "вода" },
];
const board = hunt.buildWordHuntBoard(russian, "quiz", "easy", seeded(42));
assert.ok(board && board.targets.length >= 3, "A Russian deck produces a Word Hunt board");
for (const target of board.targets) {
  assert.equal(target.path.map((cell) => board.letters[cell.row][cell.col]).join(""), target.target, "Each path spells its target");
}
assert.ok(board.letters.flat().every((letter) => /\p{Script=Cyrillic}/u.test(letter)), "Filler letters come from the deck's own alphabet");

// 5.x gap generation tokenizes accented words whole.
assert.equal(matcher.findEnglishPhraseMatch("Ella está en casa.", "está")?.text, "está");
assert.equal(matcher.findEnglishPhraseMatch("I don’t know.", "don't")?.text, "don’t");
assert.equal(matcher.findEnglishPhraseMatch("Marcel watches TV every evening.", "watch TV")?.text, "watches TV", "English inflection still works");

// 5.5 quality check.
const warnings = quality.analyzeActivityQuality([
  { id: "1", prompt: "to go", answer: "ir" },
  { id: "2", prompt: "to leave", answer: "ir" },
  { id: "3", prompt: "The word library means biblioteca", answer: "library" },
  { id: "4", prompt: "big", answer: "grande", hint: "Starts with grande", distractors: ["enorme"], acceptedAnswers: ["enorme"] },
  { id: "5", prompt: "orphan", answer: "" },
  { id: "6", prompt: "I ___ to school.", answer: "go" },
]).map((warning) => warning.message);
assert.ok(warnings.some((m) => /Items 1 and 2 share the answer/.test(m)), "Duplicate answers are flagged");
assert.ok(warnings.some((m) => /Item 3: the answer “library” appears in the prompt/.test(m)), "Answer in prompt is flagged");
assert.ok(warnings.some((m) => /Item 4: the hint gives away/.test(m)), "Answer in hint is flagged");
assert.ok(warnings.some((m) => /Item 4: the distractor “enorme” is also a correct answer/.test(m)), "Distractor that is also correct is flagged");
assert.ok(warnings.some((m) => /Item 5 has only one side/.test(m)), "Incomplete items are flagged");
assert.ok(!warnings.some((m) => /Item 6/.test(m)), "Gap prompts are not flagged");
assert.equal(languages.languageLabel("es"), "Español");
assert.equal(languages.languageLabel("pt-BR"), "Português");

// Phase 4 wiring.
const repo = await read("src/lib/repositories/activity-repository.ts");
assert.match(repo, /rpc\("get_practice_activity"/, "Practice links load through the exact-ID RPC");
assert.match(repo, /rpc\("save_activity"/, "Saves are a single transactional RPC");
assert.match(repo, /isMissingRpc/, "The client tolerates the migration not being applied yet");
assert.match(repo, /adoptImages/, "Copies take their images along");
const editor = await read("src/components/ActivityEditor.tsx");
assert.doesNotMatch(editor, /visibility: "private",/, "Editing must not reset a shared activity to private");
assert.match(editor, /analyzeActivityQuality/);
assert.match(await read("next.config.ts"), /frame-ancestors 'none'/);
assert.match(await read("src/components/AuthClient.tsx"), /password\.length < 8/);
const flashcards = await read("src/components/games/FlashcardsGame.tsx");
assert.match(flashcards, /MAX_REVIEWS_PER_CARD/, "Review again re-queues the card");
assert.doesNotMatch(flashcards, /"ENGLISH"/, "Flashcards label the activity's language");

console.log("Remediation phase 4 + 5 checks passed.");

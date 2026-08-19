import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const schema = read("supabase/migrations/0007_classes_assignments.sql");
const secureAttempts = read("supabase/migrations/0008_secure_assignment_attempts.sql");
const rlsFix = read("supabase/migrations/0009_fix_classroom_rls_recursion.sql");
const repository = read("src/lib/repositories/classroom-repository.ts");
const secureRepository = read("src/lib/repositories/assignment-attempt-repository.ts");
const stage = read("src/components/games/GameStage.tsx");
const join = read("src/components/classes/JoinClassClient.tsx");
const teacher = read("src/components/classes/ClassDetailClient.tsx");

for (const table of ["classrooms", "class_members", "assignments", "assignment_attempts"]) {
  assert.match(schema, new RegExp(`create table public\\.${table}`), `${table} must exist`);
  assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
}

assert.match(schema, /join_code text not null unique check \(join_code ~ '\^\[A-Z0-9\]\{6\}\$'\)/, "class keys must be six uppercase alphanumeric characters");
assert.match(schema, /security definer\s+set search_path = ''/s, "join-by-code RPC must use a locked search_path");
assert.match(schema, /revoke execute on function public\.join_classroom\(text, text\) from public, anon/, "join RPC must not be callable while unauthenticated");
assert.match(schema, /is_anonymous/, "teacher-authored writes must distinguish anonymous student sessions");

assert.match(secureAttempts, /submit_assignment_attempt/, "assignment completion must use a server-side RPC");
assert.match(secureAttempts, /v_assignment\.attempts_limit/, "the database must enforce attempts limits");
assert.match(secureAttempts, /p_game_type <> v_assignment\.game_type/, "the database must enforce fixed game modes");
assert.match(secureAttempts, /activity_games/, "student-choice assignments must verify enabled game modes");
assert.match(secureAttempts, /revoke insert on table public\.assignment_attempts from authenticated/, "students must not insert attempts directly");

assert.match(rlsFix, /create schema if not exists private/, "authorization helpers must stay outside the exposed public schema");
assert.match(rlsFix, /private\.is_class_member/, "student class access must use a non-recursive membership helper");
assert.match(rlsFix, /private\.can_read_assigned_activity/, "private activity access must be assignment-scoped");
assert.doesNotMatch(rlsFix, /using \(id in \(select classroom_id from public\.class_members/, "classroom policies must not reintroduce recursive direct subqueries");

assert.match(repository, /signInAnonymously\(\)/, "v0.4 keeps a temporary no-email student session until the v0.5 account upgrade");
assert.match(repository, /rpc\("join_classroom"/, "students must join through the scoped join RPC");
assert.match(secureRepository, /rpc\("submit_assignment_attempt"/, "assignment results must use the secure RPC client");

for (const mode of ["flashcards", "memory", "matching", "sentence-builder", "gap-fill", "quiz", "space-blaster", "word-maze"]) {
  assert.match(stage, new RegExp(`mode === \"${mode}\"|return <WordMazeGame`), `GameStage must support ${mode}`);
}

assert.match(join, /Class key/, "student join UI must ask for the class key");
assert.match(join, /Your name/, "v0.4 student join UI must capture a display name");
assert.match(teacher, /Assign activity/, "teacher class workspace must expose assignment creation");
assert.match(teacher, /Student chooses/, "assignments must allow student-selected game modes");
assert.match(teacher, /attempts/, "teacher must be able to configure attempts");

console.log("Classes & Assignments contracts: OK");

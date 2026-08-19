import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const schema = read("supabase/migrations/0007_classes_assignments.sql");
const secureAttempts = read("supabase/migrations/0008_secure_assignment_attempts.sql");
const rlsFix = read("supabase/migrations/0009_fix_classroom_rls_recursion.sql");
const studentAccount = read("src/lib/repositories/student-account-repository.ts");
const secureRepository = read("src/lib/repositories/assignment-attempt-repository.ts");
const stage = read("src/components/games/GameStage.tsx");
const join = read("src/components/classes/JoinClassClient.tsx");
const classes = read("src/components/classes/ClassesClient.tsx");
const teacher = read("src/components/classes/ClassDetailClient.tsx");

for (const table of ["classrooms", "class_members", "assignments", "assignment_attempts"]) {
  assert.match(schema, new RegExp(`create table public\\.${table}`), `${table} must exist`);
  assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
}

assert.match(schema, /join_code text not null unique check \(join_code ~ '\^\[A-Z0-9\]\{6\}\$'\)/, "class keys must be six uppercase alphanumeric characters");
assert.match(schema, /security definer\s+set search_path = ''/s, "join-by-code RPC must use a locked search_path");
assert.match(schema, /revoke execute on function public\.join_classroom\(text, text\) from public, anon/, "legacy join RPC must not be callable while unauthenticated");
assert.match(schema, /is_anonymous/, "v0.4 schema must distinguish its transitional anonymous student sessions");

assert.match(secureAttempts, /submit_assignment_attempt/, "assignment completion must use a server-side RPC");
assert.match(secureAttempts, /v_assignment\.attempts_limit/, "the database must enforce attempts limits");
assert.match(secureAttempts, /p_game_type <> v_assignment\.game_type/, "the database must enforce fixed game modes");
assert.match(secureAttempts, /activity_games/, "student-choice assignments must verify enabled game modes");
assert.match(secureAttempts, /revoke insert on table public\.assignment_attempts from authenticated/, "students must not insert attempts directly");

assert.match(rlsFix, /create schema if not exists private/, "authorization helpers must stay outside the exposed public schema");
assert.match(rlsFix, /private\.is_class_member/, "student class access must use a non-recursive membership helper");
assert.match(rlsFix, /private\.can_read_assigned_activity/, "private activity access must be assignment-scoped");
assert.doesNotMatch(rlsFix, /using \(id in \(select classroom_id from public\.class_members/, "classroom policies must not reintroduce recursive direct subqueries");

assert.match(studentAccount, /rpc\("join_classroom_account"/, "v0.5 students must join through the permanent-account join RPC");
assert.doesNotMatch(studentAccount, /signInAnonymously/, "the active v0.5 student account flow must not use anonymous auth");
assert.match(secureRepository, /rpc\("submit_assignment_attempt"/, "assignment results must use the secure RPC client");

for (const mode of ["flashcards", "memory", "matching", "sentence-builder", "gap-fill", "quiz", "space-blaster", "word-maze"]) {
  assert.match(stage, new RegExp(`mode === \"${mode}\"|return <WordMazeGame`), `GameStage must support ${mode}`);
}

assert.match(join, /Class key/, "student join UI must ask for the class key when joining a class");
assert.match(join, /Username/, "student onboarding must capture a durable display identity");
assert.match(join, /Email/, "student onboarding must capture an email account");
assert.match(classes, /const formElement = event\.currentTarget;/, "class creation must capture the form before awaiting cloud writes");
assert.match(classes, /formElement\.reset\(\)/, "class creation must reset the captured form safely");
assert.doesNotMatch(classes, /event\.currentTarget\.reset\(\)/, "class creation must not dereference currentTarget after an await");
assert.match(teacher, /Assign activity/, "teacher class workspace must expose assignment creation");
assert.match(teacher, /Student chooses/, "assignments must allow student-selected game modes");
assert.match(teacher, /attempts/, "teacher must be able to configure attempts");
assert.match(teacher, /const formElement = event\.currentTarget;/, "assignment creation must capture the form before awaiting cloud writes");
assert.match(teacher, /formElement\.reset\(\)/, "assignment creation must reset the captured form safely");
assert.doesNotMatch(teacher, /event\.currentTarget\.reset\(\)/, "assignment creation must not dereference currentTarget after an await");

console.log("Classes & Assignments contracts: OK");

import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../supabase/migrations/0022_dynamite_anti_guessing.sql", import.meta.url), "utf8");
const studentStage = fs.readFileSync(new URL("../src/components/live/StudentDynamiteStage.tsx", import.meta.url), "utf8");

assert.match(migration, /v_penalty_seconds constant integer := 3/i, "Each distinct wrong Dynamite answer must cost three seconds.");
assert.match(migration, /v_wrong_attempts >= 3/i, "The third wrong answer must force an explosion.");
assert.match(migration, /round_started_at = v_penalized_started_at/i, "The time penalty must change the authoritative server clock.");
assert.match(migration, /dynamiteAttemptedAnswers/i, "The server must remember attempted answers within the turn.");
assert.match(migration, /duplicateAttempt/i, "Repeated clicks on the same wrong option must not consume another attempt.");
assert.match(migration, /security definer[\s\S]*set search_path = ''/i, "The hardened RPC must keep a locked search path.");
assert.match(migration, /grant execute[\s\S]*to anon, authenticated/i, "Live browser roles must retain access to the Dynamite RPC.");

assert.match(studentStage, /remaining - wrongOptions\.length \* 3/, "The active student's fuse must visibly reflect each three-second penalty immediately.");
assert.match(studentStage, /Wrong answer: −3 seconds/i, "The phone UI must explain the wrong-answer time penalty.");
assert.match(studentStage, /effectiveRemaining <= 0/, "The penalized fuse must disable further guesses when it reaches zero.");

console.log("Dynamite anti-guessing checks passed.");

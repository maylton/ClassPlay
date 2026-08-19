import assert from "node:assert/strict";
import fs from "node:fs";

function normalizeRoomCode(value) {
  return value.replace(/\D/g, "").slice(0, 6);
}
function validateNickname(value) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  if (normalized.length < 2) return { ok: false, message: "Use at least 2 characters." };
  if (normalized.length > 24) return { ok: false, message: "Use 24 characters or fewer." };
  return { ok: true, nickname: normalized };
}
function teamScore(players, teamId) {
  return players.filter((player) => player.teamId === teamId).reduce((sum, player) => sum + player.score, 0);
}
function publicQuestion(question) {
  const copy = { ...question };
  delete copy.correctAnswer;
  return copy;
}

assert.equal(normalizeRoomCode("Room 12-34 56!!!"), "123456");
assert.deepEqual(validateNickname("  Ana   Maria  "), { ok: true, nickname: "Ana Maria" });
assert.equal(validateNickname("A").ok, false);
assert.equal(validateNickname("x".repeat(25)).ok, false);
assert.equal(teamScore([{ teamId: "a", score: 100 }, { teamId: "b", score: 90 }, { teamId: "a", score: 140 }], "a"), 240);
const safe = publicQuestion({ itemId: "item", prompt: "She _____ home.", options: ["goes", "go"], correctAnswer: "goes" });
assert.equal("correctAnswer" in safe, false, "Student question payload must not leak the answer before reveal.");

const liveEngine = fs.readFileSync(new URL("../src/lib/live/live-engine.ts", import.meta.url), "utf8");
const liveSetup = fs.readFileSync(new URL("../src/components/live/LiveSessionSetup.tsx", import.meta.url), "utf8");
const liveHost = fs.readFileSync(new URL("../src/components/live/HostRoomClient.tsx", import.meta.url), "utf8");
const liveStudent = fs.readFileSync(new URL("../src/components/live/StudentJoinClient.tsx", import.meta.url), "utf8");

for (const mode of ["gap-fill", "quiz", "space-blaster"]) {
  assert.match(liveEngine, new RegExp(`\\"${mode}\\"`), `${mode} must be a supported live game mode`);
  assert.match(liveSetup, new RegExp(`mode: \\"${mode}\\"`), `${mode} must appear in the teacher live-mode picker`);
}
assert.match(liveSetup, /settings:\s*\{\s*\.\.\.settings,\s*liveGameMode\s*\}/, "The selected live game mode must be persisted in room settings.");
assert.match(liveHost, /buildLiveQuestion\(activity,\s*index,\s*liveGameMode\)/, "The host must build each round using the selected live mode.");
assert.match(liveEngine, /gameMode === "gap-fill" \|\| gameMode === "space-blaster"/, "Fill the Gaps and Space Blaster must use sentence-gap targets.");
assert.match(liveEngine, /usesGap \? gapOptions\(item, items\) : quizOptions\(item, items\)/, "Live modes must reuse the safe multiple-choice engines.");
assert.match(liveStudent, /function StudentLiveSpaceBlaster/, "Students must receive a dedicated live Space Blaster renderer.");
assert.match(liveStudent, /> FIRE</, "Live Space Blaster must submit the aimed answer only when the student fires.");
assert.match(liveStudent, /question\.gameMode === "space-blaster"/, "Student UI must switch renderers from the live question mode.");
assert.match(liveEngine, /delete publicQuestion\.correctAnswer/, "Live question broadcasts must continue hiding the answer before reveal.");

const sql = fs.readFileSync(new URL("../supabase/migrations/0001_connected_classroom.sql", import.meta.url), "utf8");
for (const table of ["profiles", "activity_sets", "activity_items", "activity_games", "game_sessions", "teams", "players", "answers", "game_results"]) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must have RLS enabled`);
}
assert.match(sql, /revoke execute on function public\.submit_classplay_answer[\s\S]*from public/i);
assert.match(sql, /v_response_ms\s*:=\s*greatest\(0,\s*floor\(extract\(epoch from \(now\(\) - v_session\.round_started_at\)\)/i, "Speed scoring must use server time.");
const submitFunction = sql.match(/create or replace function public\.submit_classplay_answer[\s\S]*?\n\$\$;/i)?.[0] ?? "";
assert.ok(submitFunction, "submit_classplay_answer RPC must exist");
assert.doesNotMatch(submitFunction, /return jsonb_build_object\([^\n]*correctAnswer/i, "Answer submission must not return the hidden answer.");
assert.match(submitFunction, /current_question->>'correctAnswer'/i, "Server scoring must honor the current live question target for Gap Fill and Space Blaster.");
assert.match(sql, /'revealedAnswer', case when v_session\.state = 'round_results'/i, "Reconnect during reveal must restore the revealed answer.");

console.log("ClassPlay live engine + security contract smoke tests passed.");

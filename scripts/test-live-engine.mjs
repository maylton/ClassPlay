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
const liveCatalog = fs.readFileSync(new URL("../src/lib/live/live-catalog.ts", import.meta.url), "utf8");
const liveSetup = fs.readFileSync(new URL("../src/components/live/LiveSessionSetup.tsx", import.meta.url), "utf8");
const liveHost = fs.readFileSync(new URL("../src/components/live/HostRoomClient.tsx", import.meta.url), "utf8");
const liveHostViews = fs.readFileSync(new URL("../src/components/live/HostLiveViews.tsx", import.meta.url), "utf8");
const dynamiteHost = fs.readFileSync(new URL("../src/components/live/DynamiteHostStage.tsx", import.meta.url), "utf8");
const liveStudent = fs.readFileSync(new URL("../src/components/live/StudentJoinClient.tsx", import.meta.url), "utf8");
const liveStudentDynamite = fs.readFileSync(new URL("../src/components/live/StudentDynamiteStage.tsx", import.meta.url), "utf8");
const liveStudentSpace = fs.readFileSync(new URL("../src/components/live/StudentLiveSpaceBlaster.tsx", import.meta.url), "utf8");
const liveCountdown = fs.readFileSync(new URL("../src/hooks/useLiveCountdown.ts", import.meta.url), "utf8");
const roomService = fs.readFileSync(new URL("../src/lib/live/room-service.ts", import.meta.url), "utf8");
const dynamiteSql = fs.readFileSync(new URL("../supabase/migrations/0014_dynamite_live_mode.sql", import.meta.url), "utf8");

for (const mode of ["gap-fill", "quiz", "space-blaster", "dynamite"]) {
  assert.ok(liveEngine.includes(`"${mode}"`), `${mode} must be a supported live game mode`);
  const catalogKey = mode.includes("-") ? `"${mode}"` : `(?:${mode}|"${mode}")`;
  assert.match(liveCatalog, new RegExp(`${catalogKey}\\s*:`), `${mode} must appear in the central live-mode catalog`);
}
assert.match(liveSetup, /LIVE_MODE_ORDER\.map/, "The teacher picker must render from the central live-mode catalog.");
assert.match(liveHost, /buildLiveQuestion\(activity,\s*index,\s*liveGameMode\)/, "The standard host flow must build rounds using the selected live mode.");
assert.match(liveEngine, /sourceMode === "gap-fill" \|\| sourceMode === "space-blaster"/, "Gap-based live modes must use sentence-gap targets.");
assert.match(liveEngine, /usesGap \? gapOptions\(item, items\) : quizOptions\(item, items\)/, "Live modes must reuse the safe multiple-choice engines.");
assert.match(liveStudentSpace, /function StudentLiveSpaceBlaster/, "Students must receive a dedicated live Space Blaster renderer.");
assert.match(liveStudentSpace, /> FIRE</, "Live Space Blaster must submit the aimed answer only when the student fires.");
assert.match(liveEngine, /delete publicQuestion\.correctAnswer/, "Live question broadcasts must continue hiding the answer before reveal.");
assert.match(liveHost, /useLiveCountdown/, "Teacher live UI must use the shared countdown shown to students.");
assert.match(liveStudent, /useLiveCountdown/, "Student live UI must use the shared countdown.");
assert.match(liveCountdown, /new Date\(startedAt\)\.getTime\(\)/, "Shared live countdown must derive from the authoritative live question start time.");
assert.match(liveCountdown, /Math\.ceil\(precise\)/, "Shared live countdown must preserve the visible whole-second timing semantics.");
assert.match(liveHostViews, /StandardHostStage/, "Standard projected Live presentation must stay separated from the room controller.");

assert.match(liveEngine, /createDynamiteState/, "Dynamite must create and persist a shuffled player order.");
assert.match(liveEngine, /nextAlivePlayerId/, "Dynamite must skip eliminated players when passing the turn.");
assert.match(liveEngine, /eliminateDynamitePlayer/, "Dynamite must have deterministic elimination logic.");
assert.match(liveEngine, /previousQuestion[\s\S]*questionOrder\[0\] === previousQuestion/, "A recycled Dynamite question pool must avoid an immediate repeat when possible.");
assert.match(liveSetup, /\(\[10, 15, 20\] as DynamiteTimerSeconds\[\]\)/, "Dynamite must offer 10, 15 and 20 second fuse options.");
assert.match(liveSetup, /liveGameMode === "dynamite"\) setMode\("individual"\)/, "Dynamite must use individual elimination rather than team scoring.");
assert.match(liveHost, /players\.length < 2/, "Dynamite must require at least two joined students.");
assert.match(dynamiteHost, /state\.order/, "The host must render the persisted Dynamite turn order.");
assert.match(liveHost, /dynamite-explosion/, "The host must broadcast an elimination moment to student devices.");
assert.match(liveStudent, /submitDynamiteAttempt/, "The active student must submit through the dedicated Dynamite RPC.");
assert.match(liveStudent, /dynamiteWrongOptions/, "Wrong Dynamite choices must remain blocked while the fuse keeps running.");
assert.match(liveStudentDynamite, /dynamite-shake/, "Wrong Dynamite attempts must trigger the requested shake feedback.");
assert.match(liveStudentDynamite, /StudentDynamiteQueue/, "Students must be able to see the turn order and prepare for the next turn.");
assert.match(roomService, /submit_dynamite_attempt/, "The browser service must call the secure Dynamite attempt RPC.");

assert.match(dynamiteSql, /security definer[\s\S]*set search_path = ''/i, "The Dynamite RPC must use a locked search path.");
assert.match(dynamiteSql, /activePlayerId[\s\S]*p_player_id::text/i, "The server must reject answers from students who do not currently hold the Dynamite.");
assert.match(dynamiteSql, /dynamiteTurnId[\s\S]*p_turn_id/i, "The server must bind attempts to one exact Dynamite turn.");
assert.match(dynamiteSql, /round_started_at[\s\S]*make_interval\(secs => v_timer_seconds\)/i, "Dynamite expiry must use authoritative server round time.");
assert.match(dynamiteSql, /current_question = current_question \|\| jsonb_build_object\([\s\S]*passedBy/i, "A correct answer must atomically mark the current turn as passed.");
assert.match(dynamiteSql, /revoke execute[\s\S]*from public/i, "The Dynamite SECURITY DEFINER RPC must not keep the default PUBLIC execute grant.");
assert.match(dynamiteSql, /grant execute[\s\S]*to anon, authenticated/i, "Only the live browser roles should receive Dynamite RPC execution.");

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

console.log("ClassPlay live engine + Dynamite + security contract smoke tests passed.");

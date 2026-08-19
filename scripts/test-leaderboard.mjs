import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/0006_persistent_practice_leaderboards.sql", import.meta.url), "utf8");
const repository = await readFile(new URL("../src/lib/repositories/leaderboard-repository.ts", import.meta.url), "utf8");
const gameHub = await readFile(new URL("../src/components/GameHub.tsx", import.meta.url), "utf8");
const host = await readFile(new URL("../src/components/live/HostRoomClient.tsx", import.meta.url), "utf8");
const student = await readFile(new URL("../src/components/live/StudentJoinClient.tsx", import.meta.url), "utf8");

// Persistent scores exist only for direct-link practice and are protected by RLS.
assert.match(migration, /create table if not exists public\.practice_scores/i);
assert.match(migration, /alter table public\.practice_scores enable row level security/i);
assert.match(migration, /grant select, insert on table public\.practice_scores to anon, authenticated/i);
assert.doesNotMatch(migration, /grant all on table public\.practice_scores to anon/i);
assert.match(migration, /visibility = 'unlisted'/i);
assert.doesNotMatch(migration, /visibility = 'public'/i);
assert.match(migration, /g\.game_type = practice_scores\.game_type/i);

// The practice repository is scoped by activity + game and exposes only Top 10.
assert.match(repository, /\.eq\("activity_set_id", activityId\)/);
assert.match(repository, /\.eq\("game_type", game\)/);
assert.match(repository, /\.order\("score", \{ ascending: false \}\)/);
assert.match(repository, /Math\.min\(10, limit\)/);
assert.match(repository, /char|cleanPracticePlayerName|slice\(0, 24\)/i);

// All local game modes flow through one shared practice completion overlay.
assert.match(gameHub, /PracticeLeaderboard/);
assert.match(gameHub, /practiceCompletion/);
assert.match(gameHub, /publishActivityForPractice/);
assert.match(gameHub, /\/practice\/\$\{saved\.id\}/);

// Connected Classroom sends only a temporary realtime snapshot; it must never
// write to the persistent practice table/repository.
assert.match(host, /send\("final", \{ state: "final_results", leaderboardKind: session\.mode, leaderboard \}\)/);
assert.match(host, /\.slice\(0, 10\)/);
assert.doesNotMatch(host, /practice_scores|submitPracticeScore|leaderboard-repository/);
assert.match(student, /finalLeaderboard/);
assert.match(student, /This ranking belongs only to this live room and disappears after the session\./);
assert.doesNotMatch(student, /practice_scores|submitPracticeScore|leaderboard-repository/);

console.log("ClassPlay leaderboard and persistence contract tests passed.");

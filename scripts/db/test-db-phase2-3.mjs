import assert from "node:assert/strict";
import { as, createDb, createUser } from "./harness.mjs";
import { expectError, join, seedSession, seedTeacherWithActivity, uuid } from "./fixtures.mjs";

const db = await createDb();

// --- 2.1 practice leaderboard -------------------------------------------------
const teacherA = await seedTeacherWithActivity(db, { items: 4, visibility: "unlisted" });
const teacherB = await seedTeacherWithActivity(db, { items: 4 });
const insertScore = (name, score, correct, total, game = "quiz") => as(db, { role: "anon" }, (tx) => tx.query(
  `insert into public.practice_scores(activity_set_id, game_type, player_name, score, correct, total) values ($1, $2, $3, $4, $5, $6) returning id, player_name`,
  [teacherA.activityId, game, name, score, correct, total],
));

const ok = await insertScore("  Ana   Clara ", 400, 3, 4);
assert.equal(ok.rows[0].player_name, "Ana Clara", "Names are trimmed and whitespace collapsed");
await expectError(insertScore("xXfuckXx", 100, 1, 4), /different name/, "run-together profanity");
await expectError(insertScore("Ana Puta", 100, 1, 4), /different name/, "whole-word profanity");
await expectError(insertScore("Merd4", 100, 1, 4), /different name/, "leetspeak profanity");
assert.equal((await insertScore("Lucas Cunha", 100, 1, 4)).rows.length, 1, "Ordinary names must pass");
assert.equal((await insertScore("Dickson", 100, 1, 4)).rows.length, 1, "Whole-word terms must not block longer names");
await expectError(insertScore("Bia", 500, 5, 5), /could not be verified/, "more correct answers than items");
await expectError(insertScore("Bia", 10000, 3, 4), /could not be verified/, "score above the per-answer cap");
assert.equal((await insertScore("Bia", 2800, 1, 30, "quiz")).rows.length, 1, "High but plausible scores pass");

for (let i = 0; i < 5; i += 1) await insertScore("Spam", 100, 1, 4);
await expectError(insertScore("Spam", 100, 1, 4), /several scores in a row/, "per-name flood limit");

const scoreId = ok.rows[0].id;
const deleteAs = (userId) => as(db, { role: "authenticated", userId }, (tx) => tx.query(`delete from public.practice_scores where id = $1 returning id`, [scoreId]));
assert.equal((await deleteAs(teacherB.ownerId)).rows.length, 0, "Another teacher cannot delete scores");
await expectError(as(db, { role: "anon" }, (tx) => tx.query(`delete from public.practice_scores where id = $1`, [scoreId])), /permission denied/, "anon delete");
assert.equal((await deleteAs(teacherA.ownerId)).rows.length, 1, "The activity owner can delete scores");

// --- 2.2 assignments ------------------------------------------------------------
const classId = uuid();
await db.query(`insert into public.classrooms(id, owner_id, name, join_code) values ($1, $2, 'Class', 'QWE234')`, [classId, teacherA.ownerId]);
const studentId = uuid();
await createUser(db, studentId, "st@t.test");
await db.query(`insert into public.student_profiles(user_id, username) values ($1, 'student.two')`, [studentId]);
const memberId = (await db.query(`insert into public.class_members(classroom_id, user_id, display_name) values ($1, $2, 'Student') returning id`, [classId, studentId])).rows[0].id;
const lateAssignment = (await db.query(`insert into public.assignments(classroom_id, activity_set_id, title, game_type, due_at) values ($1, $2, 'Late', 'quiz', now() - interval '1 day') returning id`, [classId, teacherA.activityId])).rows[0].id;
const onTimeAssignment = (await db.query(`insert into public.assignments(classroom_id, activity_set_id, title, game_type, due_at) values ($1, $2, 'On time', 'quiz', now() + interval '1 day') returning id`, [classId, teacherA.activityId])).rows[0].id;
const submitAttempt = (assignmentId, score, correct, total) => as(db, { role: "authenticated", userId: studentId }, (tx) => tx.query(
  `select * from public.submit_assignment_attempt($1, $2, 'quiz', $3, $4, $5)`, [assignmentId, memberId, score, correct, total],
));
assert.equal((await submitAttempt(lateAssignment, 300, 3, 4)).rows[0].submitted_late, true, "Submissions after due_at are flagged late");
assert.equal((await submitAttempt(onTimeAssignment, 300, 3, 4)).rows[0].submitted_late, false);
await expectError(submitAttempt(onTimeAssignment, 900, 9, 9), /could not be verified/, "assignment correct above item count");
await expectError(submitAttempt(onTimeAssignment, 50000, 4, 4), /could not be verified/, "assignment score above cap");

// --- 2.4 live room creation -------------------------------------------------------
const createRoom = (userId, activityId) => as(db, { role: "authenticated", userId }, (tx) => tx.query(
  `insert into public.game_sessions(activity_set_id, host_id, room_code) values ($1, $2, $3) returning id`,
  [activityId, userId, String(200000 + Math.floor(Math.random() * 700000))],
));
await expectError(createRoom(teacherB.ownerId, teacherA.activityId), /row-level security/, "room for another teacher's activity");
assert.equal((await createRoom(teacherA.ownerId, teacherA.activityId)).rows.length, 1, "Hosting your own activity works");
const ownRoom = (await createRoom(teacherB.ownerId, teacherB.activityId)).rows[0].id;
await expectError(
  as(db, { role: "authenticated", userId: teacherB.ownerId }, (tx) => tx.query(`update public.game_sessions set activity_set_id = $2 where id = $1`, [ownRoom, teacherA.activityId])),
  /row-level security/, "re-pointing a room at another teacher's activity",
);

// --- 2.5 live join ------------------------------------------------------------------
const room = await seedSession(db, { ownerId: teacherA.ownerId, activityId: teacherA.activityId });
await expectError(join(db, room.roomCode, "B1tch"), /different nickname/, "blocked nickname");
const kicked = await join(db, room.roomCode, "Pedro");
await db.query(`update public.players set removed = true where id = $1`, [kicked.player_id]);
await expectError(join(db, room.roomCode, "pedro"), /removed this name/, "removed nickname rejoining");
assert.ok((await join(db, room.roomCode, "Pedro Henrique")).player_id, "Other names still join");
await db.query(`insert into public.players(session_id, nickname) select $1, 'bot ' || g from generate_series(1, 99) g`, [room.sessionId]);
await expectError(join(db, room.roomCode, "Latecomer"), /room is full/, "room capacity");

// --- 3.1 authoritative final ranking -------------------------------------------------
async function finishedRoom({ mode = "individual", settings = {}, teams = [] }) {
  const s = await seedSession(db, { ownerId: teacherA.ownerId, activityId: teacherA.activityId, mode, settings });
  const teamIds = [];
  for (const [index, name] of teams.entries()) {
    teamIds.push((await db.query(`insert into public.teams(session_id, name, color, sort_order) values ($1, $2, '#000', $3) returning id`, [s.sessionId, name, index])).rows[0].id);
  }
  const players = [];
  for (const [name, score] of [["Ana", 300], ["Bruno", 500], ["Caio", 100]]) players.push({ ...(await join(db, s.roomCode, name)), score });
  for (const p of players) await db.query(`update public.players set score = $2 where id = $1`, [p.player_id, p.score]);
  await as(db, { role: "authenticated", userId: teacherA.ownerId }, (tx) => tx.query(`select public.finalize_classplay_session($1)`, [s.sessionId]));
  const resume = await as(db, { role: "anon" }, (tx) => tx.query(`select public.resume_classplay_player($1, $2) as r`, [players[0].player_id, players[0].player_token]));
  return { snapshot: resume.rows[0].r, teamIds, players };
}

const individual = await finishedRoom({});
assert.equal(individual.snapshot.state, "final_results");
assert.equal(individual.snapshot.leaderboardKind, "individual");
assert.deepEqual(individual.snapshot.leaderboard.map((e) => [e.name, e.score]), [["Bruno", 500], ["Ana", 300], ["Caio", 100]]);

const hidden = await finishedRoom({ settings: { leaderboardEnabled: false } });
assert.deepEqual(hidden.snapshot.leaderboard, [], "Disabled leaderboards stay hidden");

const teamRoom = await finishedRoom({ mode: "team", teams: ["Foxes", "Owls"] });
assert.equal(teamRoom.snapshot.leaderboardKind, "team");
assert.equal(teamRoom.snapshot.leaderboard.reduce((sum, e) => sum + e.score, 0), 900, "Team scores add up player scores");

const dynamite = await finishedRoom({ settings: { liveGameMode: "dynamite" } });
assert.deepEqual(dynamite.snapshot.leaderboard, [], "Dynamite has no points ranking");

const grid = await seedSession(db, { ownerId: teacherA.ownerId, activityId: teacherA.activityId, mode: "team" });
const gridTeams = [];
for (const name of ["Reds", "Blues"]) gridTeams.push((await db.query(`insert into public.teams(session_id, name, color) values ($1, $2, '#000') returning id`, [grid.sessionId, name])).rows[0].id);
const gridPlayer = await join(db, grid.roomCode, "Duda");
const gridState = {
  phase: "finished",
  teamScores: { [gridTeams[0]]: 40, [gridTeams[1]]: 70 },
  tiles: [{ number: 1, questionIndex: 0, wildcard: { type: "jackpot" }, opened: true, resolved: true }],
};
await db.query(`update public.game_sessions set settings = $2 where id = $1`, [grid.sessionId, JSON.stringify({ liveGameMode: "wildcard-grid", wildcardGridState: gridState })]);
await as(db, { role: "authenticated", userId: teacherA.ownerId }, (tx) => tx.query(`select public.finalize_classplay_session($1)`, [grid.sessionId]));
const gridSnapshot = (await as(db, { role: "anon" }, (tx) => tx.query(`select public.resume_classplay_player($1, $2) as r`, [gridPlayer.player_id, gridPlayer.player_token]))).rows[0].r;
assert.deepEqual(gridSnapshot.leaderboard.map((e) => [e.name, e.score]), [["Blues", 70], ["Reds", 40]]);
assert.equal(gridSnapshot.settings.wildcardGridState.tiles[0].wildcard, null, "Hidden wildcards stay hidden");

// While playing, the correct answer never reaches students.
const live = await seedSession(db, { ownerId: teacherA.ownerId, activityId: teacherA.activityId });
const livePlayer = await join(db, live.roomCode, "Eva");
await db.query(`update public.game_sessions set state = 'playing', current_question = $2 where id = $1`, [live.sessionId, JSON.stringify({ itemId: teacherA.itemIds[0], index: 0, options: ["a", "b"], correctAnswer: "a" })]);
const liveSnapshot = (await as(db, { role: "anon" }, (tx) => tx.query(`select public.resume_classplay_player($1, $2) as r`, [livePlayer.player_id, livePlayer.player_token]))).rows[0].r;
assert.equal(liveSnapshot.currentQuestion.correctAnswer, undefined);
assert.equal(liveSnapshot.revealedAnswer, null);
assert.deepEqual(liveSnapshot.leaderboard, []);

console.log("Phase 2 + 3 database behaviour: OK");

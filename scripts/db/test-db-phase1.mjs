import assert from "node:assert/strict";
import { as, createDb, createUser } from "./harness.mjs";
import { expectError, join, seedSession, seedTeacherWithActivity, uuid } from "./fixtures.mjs";

const db = await createDb();

// 1.6 normalization
const { rows: norm } = await db.query(`select public.classplay_normalize($1) as v`, ["  Don’t   Stop\tNow "]);
assert.equal(norm[0].v, "don't stop now");

// 1.4 Dynamite penalty survives the round-clock trigger
const { ownerId, activityId, itemIds } = await seedTeacherWithActivity(db);
const { sessionId, roomCode } = await seedSession(db, { ownerId, activityId, settings: { liveGameMode: "dynamite", dynamiteTimerSeconds: 10 } });
const p1 = await join(db, roomCode, "Ana");
const question = { itemId: itemIds[0], index: 0, dynamiteTurnId: "turn-1", activePlayerId: p1.player_id, correctAnswer: "answer 0", options: ["answer 0", "answer 1", "answer 2", "answer 3"] };
await db.query(`update public.game_sessions set state = 'playing', current_question = $2 where id = $1`, [sessionId, JSON.stringify(question)]);
const before = (await db.query(`select round_started_at as t from public.game_sessions where id = $1`, [sessionId])).rows[0].t;
assert.ok(before, "Publishing a new turn must start the round clock");

const submit = (answer) => as(db, { role: "anon" }, (tx) => tx.query(
  `select public.submit_dynamite_attempt($1, $2, $3, 'turn-1', $4) as r`, [p1.player_id, p1.player_token, itemIds[0], answer],
));
const wrong1 = (await submit("answer 1")).rows[0].r;
assert.equal(wrong1.correct, false);
const after1 = (await db.query(`select round_started_at as t from public.game_sessions where id = $1`, [sessionId])).rows[0].t;
assert.equal(before.getTime() - after1.getTime(), 3000, "A wrong answer must move the server clock back 3 seconds");

await submit("answer 2");
const third = (await submit("answer 3")).rows[0].r;
assert.equal(third.timeUp, true, "The third wrong answer must force the explosion");
const late = (await submit("answer 0")).rows[0].r;
assert.equal(late.timeUp, true, "After the forced explosion the server must refuse even the correct answer");
assert.equal(late.correct, false);

// A new turn restarts the clock.
await db.query(`update public.game_sessions set current_question = $2 where id = $1`, [sessionId, JSON.stringify({ ...question, dynamiteTurnId: "turn-2" })]);
const after2 = (await db.query(`select round_started_at as t from public.game_sessions where id = $1`, [sessionId])).rows[0].t;
assert.ok(after2.getTime() > after1.getTime(), "A new turn must restart the round clock");

// 1.3 removed students cannot rejoin with the class key
const classId = uuid();
await db.query(`insert into public.classrooms(id, owner_id, name, join_code) values ($1, $2, 'Class', 'ABC234')`, [classId, ownerId]);
const studentId = uuid();
await createUser(db, studentId, "s@t.test");
await db.query(`insert into public.student_profiles(user_id, username) values ($1, 'student.one')`, [studentId]);
const joinClass = () => as(db, { role: "authenticated", userId: studentId }, (tx) => tx.query(`select * from public.join_classroom_account('abc234')`));
assert.equal((await joinClass()).rows.length, 1);
await db.query(`update public.class_members set active = false where user_id = $1`, [studentId]);
await expectError(joinClass(), /removed from this class/, "rejoin after removal");
await db.query(`update public.class_members set active = true where user_id = $1`, [studentId]);
assert.equal((await joinClass()).rows.length, 1, "A readmitted student can open the class again");

console.log("Phase 1 database behaviour: OK");

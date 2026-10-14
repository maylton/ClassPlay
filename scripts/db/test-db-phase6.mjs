import assert from "node:assert/strict";
import { as, createDb, createUser } from "./harness.mjs";
import { expectError, join, seedSession, seedTeacherWithActivity, uuid } from "./fixtures.mjs";

const db = await createDb();
const anon = (sql, params) => as(db, { role: "anon" }, (tx) => tx.query(sql, params));
const asUser = (userId, sql, params) => as(db, { role: "authenticated", userId }, (tx) => tx.query(sql, params));
const count = async (userId, sql, params) => (await asUser(userId, sql, params)).rows.length;

// --- 5.7 derived Arcade modes come from the stored list ---------------------------------
const tiny = await seedTeacherWithActivity(db, { items: 1, visibility: "unlisted" });
const rich = await seedTeacherWithActivity(db, { items: 4, visibility: "unlisted" });
const score = (activityId, game) => anon(
  `insert into public.practice_scores(activity_set_id, game_type, player_name, score, correct, total) values ($1, $2, 'Ana', 100, 1, 1) returning id`,
  [activityId, game],
);
await expectError(score(tiny.activityId, "boss-battle"), /row-level security/, "legacy rule: one item is not enough");
await db.query(`update public.activity_sets set derived_modes = '{boss-battle}' where id = $1`, [tiny.activityId]);
assert.equal((await score(tiny.activityId, "boss-battle")).rows.length, 1, "A stored derived mode unlocks the leaderboard");
assert.equal((await score(rich.activityId, "boss-battle")).rows.length, 1, "Without a stored list the legacy rules still apply");
await db.query(`update public.activity_sets set derived_modes = '{word-hunt}' where id = $1`, [rich.activityId]);
await expectError(score(rich.activityId, "boss-battle"), /row-level security/, "the stored list wins over the legacy rules");
assert.equal((await score(rich.activityId, "quiz")).rows.length, 1, "Enabled core games are always allowed");
await expectError(
  db.query(`update public.activity_sets set derived_modes = '{not-a-mode}' where id = $1`, [rich.activityId]),
  /derived_modes_check/, "unknown derived mode",
);

const savedId = uuid();
await asUser(rich.ownerId, `select public.save_activity($1)`, [JSON.stringify({ id: savedId, title: "Deck", items: [{ id: uuid(), prompt: "a", answer: "b" }], games: ["quiz"], derived_modes: ["typing-rush"] })]);
assert.deepEqual((await db.query(`select derived_modes from public.activity_sets where id = $1`, [savedId])).rows[0].derived_modes, ["typing-rush"], "save_activity stores the derived modes");
await asUser(rich.ownerId, `select public.save_activity($1)`, [JSON.stringify({ id: savedId, title: "Deck", items: [], games: [] })]);
assert.equal((await db.query(`select derived_modes from public.activity_sets where id = $1`, [savedId])).rows[0].derived_modes, null, "Old clients (no list) fall back to the legacy rules");

// --- Classes and assignments: who can see what -------------------------------------------
const teacherA = await seedTeacherWithActivity(db, { items: 3 });
const teacherB = await seedTeacherWithActivity(db, { items: 1 });
const classId = uuid();
await db.query(`insert into public.classrooms(id, owner_id, name, join_code) values ($1, $2, 'A class', 'RLS234')`, [classId, teacherA.ownerId]);
async function student(name) {
  const id = uuid();
  await createUser(db, id, `${name}@t.test`);
  await db.query(`insert into public.student_profiles(user_id, username) values ($1, $2)`, [id, name]);
  return id;
}
const member = await student("member.one");
const outsider = await student("outsider.one");
await asUser(member, `select * from public.join_classroom_account('RLS234')`);
const memberId = (await db.query(`select id from public.class_members where user_id = $1`, [member])).rows[0].id;
const published = (await db.query(`insert into public.assignments(classroom_id, activity_set_id, title, game_type) values ($1, $2, 'Homework', 'quiz') returning id`, [classId, teacherA.activityId])).rows[0].id;
await db.query(`insert into public.assignments(classroom_id, activity_set_id, title, published) values ($1, $2, 'Draft', false)`, [classId, teacherA.activityId]);

assert.equal(await count(teacherB.ownerId, `select id from public.classrooms where id = $1`, [classId]), 0, "Other teachers cannot see the class");
assert.equal(await count(teacherB.ownerId, `select id from public.class_members where classroom_id = $1`, [classId]), 0, "…nor its students");
assert.equal(await count(teacherB.ownerId, `select id from public.assignments where classroom_id = $1`, [classId]), 0, "…nor its assignments");
assert.equal(await count(member, `select id from public.classrooms where id = $1`, [classId]), 1, "Members see their class");
assert.equal(await count(member, `select id from public.assignments where classroom_id = $1`, [classId]), 1, "Members see only published assignments");
assert.equal(await count(member, `select id from public.activity_items where activity_set_id = $1`, [teacherA.activityId]), 3, "Members can play the assigned activity");
assert.equal(await count(outsider, `select id from public.classrooms where id = $1`, [classId]), 0, "Non-members see nothing");
assert.equal(await count(outsider, `select id from public.activity_items where activity_set_id = $1`, [teacherA.activityId]), 0, "Non-members cannot read the assigned activity");
await expectError(
  asUser(member, `insert into public.assignment_attempts(assignment_id, member_id, game_type, score, correct, total) values ($1, $2, 'quiz', 1, 1, 1)`, [published, memberId]),
  /permission denied/, "direct attempt insert",
);
assert.equal((await asUser(member, `update public.class_members set display_name = 'Hacker' where id = $1 returning id`, [memberId])).rows.length, 0, "Students cannot edit their membership");
await expectError(
  asUser(member, `insert into public.activity_sets(owner_id, title) values ($1, 'Mine')`, [member]),
  /row-level security/, "student account authoring",
);
await db.query(`update public.assignments set published = false where id = $1`, [published]);
assert.equal(await count(member, `select id from public.activity_items where activity_set_id = $1`, [teacherA.activityId]), 0, "Unpublishing revokes access to the activity");
await db.query(`update public.assignments set published = true where id = $1`, [published]);
await asUser(member, `select * from public.submit_assignment_attempt($1, $2, 'quiz', 200, 2, 3)`, [published, memberId]);

// --- 4.5 export and delete ----------------------------------------------------------------
await expectError(anon(`select public.export_my_data()`), /permission denied/, "anonymous export");
const studentExport = (await asUser(member, `select public.export_my_data() as d`)).rows[0].d;
assert.equal(studentExport.account.id, member);
assert.equal(studentExport.student_profile.username, "member.one");
assert.equal(studentExport.class_memberships.length, 1);
assert.equal(studentExport.class_memberships[0].classroom_name, "A class");
assert.equal(studentExport.class_memberships[0].attempts.length, 1, "The export includes the student's results");
assert.deepEqual(studentExport.activities, [], "Students own no activities");
const teacherExport = (await asUser(teacherA.ownerId, `select public.export_my_data() as d`)).rows[0].d;
assert.equal(teacherExport.activities.length, 1);
assert.equal(teacherExport.activities[0].items.length, 3);
assert.equal(teacherExport.classes_taught[0].members.length, 1);
assert.equal(teacherExport.classes_taught[0].assignments.find((a) => a.title === "Homework").attempts.length, 1);
assert.equal(JSON.stringify(teacherExport).includes(teacherB.ownerId), false, "Exports never include other users' data");

await expectError(anon(`select public.delete_my_account()`), /permission denied/, "anonymous delete");
await asUser(member, `select public.delete_my_account()`);
assert.equal((await db.query(`select count(*)::int as n from auth.users where id = $1`, [member])).rows[0].n, 0, "The account is gone");
assert.equal((await db.query(`select count(*)::int as n from public.class_members where user_id = $1`, [member])).rows[0].n, 0, "…with its memberships");
assert.equal((await db.query(`select count(*)::int as n from public.assignment_attempts`)).rows[0].n, 0, "…and its results");
assert.equal((await db.query(`select count(*)::int as n from public.classrooms where id = $1`, [classId])).rows[0].n, 1, "The teacher's class stays");
await asUser(teacherA.ownerId, `select public.delete_my_account()`);
assert.equal((await db.query(`select count(*)::int as n from public.activity_sets where owner_id = $1`, [teacherA.ownerId])).rows[0].n, 0, "A deleted teacher's activities go");
assert.equal((await db.query(`select count(*)::int as n from public.classrooms where id = $1`, [classId])).rows[0].n, 0, "…and their classes");
assert.equal((await db.query(`select count(*)::int as n from auth.users where id = $1`, [teacherB.ownerId])).rows[0].n, 1, "Other accounts are untouched");

// --- Live answers: timing, duplicates, removed players ----------------------------------------
const live = await seedTeacherWithActivity(db, { items: 2 });
const room = await seedSession(db, { ownerId: live.ownerId, activityId: live.activityId, settings: { timerEnabled: true, timerSeconds: 10 } });
const player = await join(db, room.roomCode, "Rita");
const kicked = await join(db, room.roomCode, "Caio");
await db.query(`update public.game_sessions set state = 'playing', current_question = $2 where id = $1`, [room.sessionId, JSON.stringify({ itemId: live.itemIds[0], index: 0, prompt: "p", options: ["answer 0", "x"], correctAnswer: "answer 0" })]);
const answer = (p, text) => anon(`select public.submit_classplay_answer($1, $2, $3, $4, 0) as r`, [p.player_id, p.player_token, live.itemIds[0], text]);
const first = (await answer(player, "Answer 0")).rows[0].r;
assert.equal(first.correct, true, "Answers are case-insensitive");
assert.ok(first.points >= 100);
assert.equal((await answer(player, "x")).rows[0].r.alreadyAnswered, true, "A second answer cannot change the first");
await expectError(answer({ ...player, player_token: uuid() }, "answer 0"), /Player session is invalid/, "forged player token");
await db.query(`update public.players set removed = true where id = $1`, [kicked.player_id]);
await expectError(answer(kicked, "answer 0"), /Player session is invalid/, "removed player answering");
await db.query(`update public.game_sessions set round_started_at = now() - interval '20 seconds' where id = $1`, [room.sessionId]);
const late = await join(db, room.roomCode, "Late").catch((error) => error);
assert.ok(late instanceof Error, "Rooms that already started do not accept new players");
const other = (await db.query(`insert into public.players(session_id, nickname) values ($1, 'Bea') returning id, player_token`, [room.sessionId])).rows[0];
await expectError(answer({ player_id: other.id, player_token: other.player_token }, "answer 0"), /Time is up/, "answers after the timer");

console.log("Phase 6 database behaviour: OK");

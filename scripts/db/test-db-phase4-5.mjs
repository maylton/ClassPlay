import assert from "node:assert/strict";
import { as, createDb } from "./harness.mjs";
import { expectError, join, seedSession, seedTeacherWithActivity, uuid } from "./fixtures.mjs";

const db = await createDb();
const anon = (sql, params) => as(db, { role: "anon" }, (tx) => tx.query(sql, params));
const asUser = (userId, sql, params) => as(db, { role: "authenticated", userId }, (tx) => tx.query(sql, params));

// --- 4.1 practice links are not enumerable -----------------------------------------
const practiceOnly = await seedTeacherWithActivity(db, { items: 4, visibility: "unlisted" });
const listed = await seedTeacherWithActivity(db, { items: 3, visibility: "unlisted" });
const privateDeck = await seedTeacherWithActivity(db, { items: 3 });
await db.query(`insert into public.community_listings(activity_set_id, owner_id, author_name) values ($1, $2, 'Teacher C')`, [listed.activityId, listed.ownerId]);

assert.deepEqual((await anon(`select id from public.activity_sets`)).rows.map((r) => r.id), [listed.activityId], "Anon sees only Community-listed activities");
assert.equal((await anon(`select id from public.activity_items where activity_set_id = $1`, [practiceOnly.activityId])).rows.length, 0, "Practice-only items are not readable directly");
assert.equal((await asUser(privateDeck.ownerId, `select id from public.activity_sets where id = $1`, [practiceOnly.activityId])).rows.length, 0, "Other teachers cannot read practice-only decks either");
assert.equal((await anon(`select activity_set_id from public.community_catalog`)).rows.length, 1, "The Community catalog still works for visitors");
assert.equal((await anon(`select id from public.activity_items where activity_set_id = $1`, [listed.activityId])).rows.length, 3, "Listed activity items stay public");

const practice = (await anon(`select public.get_practice_activity($1) as a`, [practiceOnly.activityId])).rows[0].a;
assert.equal(practice.id, practiceOnly.activityId, "The exact practice link still opens");
assert.equal(practice.owner_id, undefined, "The practice payload hides the owner");
assert.equal(practice.activity_items.length, 4);
assert.deepEqual(practice.activity_games.map((g) => g.game_type), ["quiz"]);
assert.equal(practice.target_language, "en");
assert.equal((await anon(`select public.get_practice_activity($1) as a`, [privateDeck.activityId])).rows[0].a, null, "Private decks are not served");

await anon(`insert into public.practice_scores(activity_set_id, game_type, player_name, score, correct, total) values ($1, 'quiz', 'Ana', 300, 3, 4)`, [practiceOnly.activityId]);
assert.equal((await anon(`select id from public.practice_scores where activity_set_id = $1`, [practiceOnly.activityId])).rows.length, 1, "Practice leaderboards keep working");
await expectError(
  anon(`insert into public.practice_scores(activity_set_id, game_type, player_name, score, correct, total) values ($1, 'quiz', 'Ana', 100, 1, 3)`, [privateDeck.activityId]),
  /row-level security/, "scores for a private deck",
);

// --- 4.2 shared images ---------------------------------------------------------------------
async function attachImage({ ownerId, activityId, itemIds }) {
  const name = `${ownerId}/${activityId}/${itemIds[0]}/${uuid()}.png`;
  await db.query(`insert into storage.objects(bucket_id, name) values ('activity-media', $1)`, [name]);
  await db.query(`update public.activity_items set image_url = $2 where id = $1`, [itemIds[0], `storage:activity-media/${name}`]);
  return name;
}
const practiceImage = await attachImage(practiceOnly);
const privateImage = await attachImage(privateDeck);
const canSee = async (role, userId, name) => (await as(db, { role, userId }, (tx) => tx.query(`select id from storage.objects where name = $1`, [name]))).rows.length === 1;
assert.equal(await canSee("anon", null, practiceImage), true, "Practice-link images are visible to students");
assert.equal(await canSee("anon", null, privateImage), false, "Private-deck images stay private");
assert.equal(await canSee("authenticated", privateDeck.ownerId, privateImage), true, "Owners keep access");

// A teacher who copied a deck keeps seeing the images their copy references.
const copier = await seedTeacherWithActivity(db, { items: 1 });
assert.equal(await canSee("authenticated", copier.ownerId, practiceImage), true, "Practice images are visible to any viewer");
await db.query(`update public.activity_sets set visibility = 'private' where id = $1`, [practiceOnly.activityId]);
assert.equal(await canSee("authenticated", copier.ownerId, practiceImage), false);
await db.query(`update public.activity_items set image_url = $2 where id = $1`, [copier.itemIds[0], `storage:activity-media/${practiceImage}`]);
assert.equal(await canSee("authenticated", copier.ownerId, practiceImage), true, "Copied activities keep their images");
await db.query(`update public.activity_sets set visibility = 'unlisted' where id = $1`, [practiceOnly.activityId]);

// --- 4.4 live answers survive item deletion ------------------------------------------------
const room = await seedSession(db, { ownerId: listed.ownerId, activityId: listed.activityId });
const player = await join(db, room.roomCode, "Eva");
await db.query(`update public.game_sessions set state = 'playing', current_question = $2 where id = $1`, [room.sessionId, JSON.stringify({ itemId: listed.itemIds[0], index: 0, prompt: "prompt 0", options: ["answer 0", "x"], correctAnswer: "answer 0" })]);
await anon(`select public.submit_classplay_answer($1, $2, $3, 'answer 0', 0)`, [player.player_id, player.player_token, listed.itemIds[0]]);
await asUser(listed.ownerId, `delete from public.activity_items where id = $1`, [listed.itemIds[0]]);
const kept = (await db.query(`select item_id, is_correct, answer_payload from public.answers where player_id = $1`, [player.player_id])).rows;
assert.equal(kept.length, 1, "Editing the deck no longer deletes live answers");
assert.equal(kept[0].item_id, null);
assert.equal(kept[0].answer_payload.prompt, "prompt 0", "The answer remembers the question text");

// --- 4.4 transactional save ------------------------------------------------------------------
const teacher = await seedTeacherWithActivity(db, { items: 0 });
const deckId = uuid();
const [i1, i2, i3] = [uuid(), uuid(), uuid()];
const save = (userId, activity) => asUser(userId, `select public.save_activity($1) as id`, [JSON.stringify(activity)]);
const base = { id: deckId, title: "Saludos", kind: "vocabulary", target_language: "es", strict_accents: true };
await save(teacher.ownerId, {
  ...base,
  items: [
    { id: i1, prompt: "hello", answer: "hola", accepted_answers: ["¡hola!"] },
    { id: i2, prompt: "goodbye", answer: "adiós", distractors: ["hola"] },
  ],
  games: ["quiz", "flashcards"],
});
let saved = (await db.query(`select a.target_language, a.strict_accents, (select json_agg(i.answer order by i.sort_order) from public.activity_items i where i.activity_set_id = a.id) as answers, (select json_agg(g.game_type order by g.game_type) from public.activity_games g where g.activity_set_id = a.id) as games from public.activity_sets a where a.id = $1`, [deckId])).rows[0];
assert.deepEqual([saved.target_language, saved.strict_accents, saved.answers, saved.games], ["es", true, ["hola", "adiós"], ["flashcards", "quiz"]]);
assert.deepEqual((await db.query(`select accepted_answers from public.activity_items where id = $1`, [i1])).rows[0].accepted_answers, ["¡hola!"]);

await save(teacher.ownerId, { ...base, items: [{ id: i3, prompt: "thanks", answer: "gracias" }, { id: i1, prompt: "hello", answer: "hola" }], games: ["quiz"] });
saved = (await db.query(`select (select json_agg(i.id order by i.sort_order) from public.activity_items i where i.activity_set_id = $1) as ids, (select json_agg(g.game_type) from public.activity_games g where g.activity_set_id = $1) as games`, [deckId])).rows[0];
assert.deepEqual(saved.ids, [i3, i1], "Removed items are deleted and order follows the payload");
assert.deepEqual(saved.games, ["quiz"]);

await expectError(save(listed.ownerId, { ...base, title: "Hijacked", items: [], games: [] }), /row-level security/, "saving over another teacher's activity");
await expectError(anon(`select public.save_activity($1)`, [JSON.stringify(base)]), /permission denied/, "anonymous save");
await expectError(save(teacher.ownerId, { ...base, id: uuid(), target_language: "english", items: [], games: [] }), /target_language_check/, "invalid language code");
assert.equal((await db.query(`select title from public.activity_sets where id = $1`, [deckId])).rows[0].title, "Saludos", "A rejected save changes nothing");

// A failure halfway through rolls the whole save back.
await expectError(save(teacher.ownerId, { ...base, title: "Half saved", items: [{ id: uuid(), prompt: "x", answer: "y" }], games: ["not-a-game"] }), /game_type_check/, "invalid game type");
assert.equal((await db.query(`select title from public.activity_sets where id = $1`, [deckId])).rows[0].title, "Saludos", "No partial save");
assert.equal((await db.query(`select count(*)::int as n from public.activity_items where activity_set_id = $1`, [deckId])).rows[0].n, 2);

// --- 4.5 retention -----------------------------------------------------------------------------
const old = await seedSession(db, { ownerId: listed.ownerId, activityId: listed.activityId });
await join(db, old.roomCode, "Old player");
await db.query(`update public.game_sessions set expires_at = now() - interval '100 days' where id = $1`, [old.sessionId]);
const purged = (await db.query(`select private.purge_expired_live_sessions(90) as n`)).rows[0].n;
assert.equal(purged, 1, "Only rooms older than the retention window are purged");
assert.equal((await db.query(`select count(*)::int as n from public.players where session_id = $1`, [old.sessionId])).rows[0].n, 0, "Their players go with them");
assert.equal((await db.query(`select count(*)::int as n from public.game_sessions where id = $1`, [room.sessionId])).rows[0].n, 1, "Recent rooms stay");
await expectError(anon(`select private.purge_expired_live_sessions(0)`), /permission denied/, "anonymous purge");

console.log("Phase 4 + 5 database behaviour: OK");

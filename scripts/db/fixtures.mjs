import { randomUUID } from "node:crypto";
import { as, createUser } from "./harness.mjs";

export const uuid = () => randomUUID();

export async function seedTeacherWithActivity(db, { items = 4, visibility = "private", ownerId = uuid() } = {}) {
  await createUser(db, ownerId, `${ownerId}@t.test`);
  const activityId = uuid();
  await db.query(`insert into public.activity_sets(id, owner_id, title, visibility) values ($1, $2, 'Deck', $3)`, [activityId, ownerId, visibility]);
  const itemIds = [];
  for (let i = 0; i < items; i += 1) {
    const id = uuid();
    itemIds.push(id);
    await db.query(`insert into public.activity_items(id, activity_set_id, sort_order, prompt, answer) values ($1, $2, $3, $4, $5)`, [id, activityId, i, `prompt ${i}`, `answer ${i}`]);
  }
  await db.query(`insert into public.activity_games(activity_set_id, game_type) values ($1, 'quiz')`, [activityId]);
  return { ownerId, activityId, itemIds };
}

export async function seedSession(db, { ownerId, activityId, mode = "individual", settings = {}, state = "lobby", roomCode = String(100000 + Math.floor(Math.random() * 899999)) }) {
  const sessionId = uuid();
  await db.query(
    `insert into public.game_sessions(id, activity_set_id, host_id, room_code, mode, state, settings) values ($1, $2, $3, $4, $5, $6, $7)`,
    [sessionId, activityId, ownerId, roomCode, mode, state, JSON.stringify(settings)],
  );
  return { sessionId, roomCode };
}

export async function join(db, roomCode, nickname) {
  const { rows } = await as(db, { role: "anon" }, (tx) => tx.query(`select * from public.join_classplay_room($1, $2)`, [roomCode, nickname]));
  return rows[0];
}

export async function expectError(promise, pattern, label) {
  try {
    await promise;
  } catch (error) {
    if (pattern && !pattern.test(error.message)) throw new Error(`${label}: unexpected error "${error.message}"`);
    return error;
  }
  throw new Error(`${label}: expected an error`);
}

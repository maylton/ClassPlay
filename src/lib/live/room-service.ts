"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type {
  ActivitySet,
  ClassroomSettings,
  DynamiteAttemptResult,
  GameSession,
  JoinRoomResult,
  LiveAnswerResult,
  LivePlayer,
  LiveQuestion,
  ResumeRoomResult,
  SessionMode,
  SessionState,
  Team,
} from "@/lib/types";

function requireSupabase() {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) throw new Error("Live rooms require a configured Supabase project.");
  return supabase;
}

function mapSession(row: Record<string, unknown>): GameSession {
  return {
    id: String(row.id),
    activitySetId: String(row.activity_set_id),
    hostId: String(row.host_id),
    roomCode: String(row.room_code),
    mode: row.mode as SessionMode,
    state: row.state as SessionState,
    settings: row.settings as ClassroomSettings,
    locked: Boolean(row.locked),
    expiresAt: String(row.expires_at),
    currentItemIndex: Number(row.current_item_index ?? 0),
    currentQuestion: (row.current_question ?? null) as LiveQuestion | null,
    createdAt: String(row.created_at),
    endedAt: row.ended_at ? String(row.ended_at) : null,
  };
}

function mapPlayer(row: Record<string, unknown>): LivePlayer {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    nickname: String(row.nickname),
    teamId: row.team_id ? String(row.team_id) : null,
    score: Number(row.score ?? 0),
    correctCount: Number(row.correct_count ?? 0),
    totalAnswers: Number(row.total_answers ?? 0),
    connectedAt: String(row.connected_at),
    lastSeenAt: String(row.last_seen_at),
    removed: Boolean(row.removed),
  };
}

function mapTeam(row: Record<string, unknown>): Team {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    name: String(row.name),
    color: String(row.color),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function randomRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const TEAM_PRESETS = [
  ["Green Foxes", "#2e8b68"],
  ["Blue Owls", "#4d7fd8"],
  ["Purple Comets", "#8a66cf"],
  ["Orange Tigers", "#df8a45"],
  ["Pink Stars", "#d86591"],
  ["Teal Waves", "#3a9e9d"],
  ["Gold Bees", "#c99a28"],
  ["Red Rockets", "#c85b5b"],
] as const;

export async function createLiveSession(activity: ActivitySet, options: {
  mode: SessionMode;
  teamCount?: number;
  settings: ClassroomSettings;
}): Promise<GameSession> {
  const supabase = requireSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in before hosting a live room.");

  let sessionRow: Record<string, unknown> | null = null;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = randomRoomCode();
    const { data, error } = await supabase.from("game_sessions").insert({
      activity_set_id: activity.id,
      host_id: user.id,
      room_code: roomCode,
      mode: options.mode,
      state: "lobby",
      settings: options.settings,
      locked: false,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    }).select("*").single();
    if (!error && data) {
      sessionRow = data as Record<string, unknown>;
      break;
    }
    lastError = error ? new Error(error.message) : new Error("Could not create room.");
    if (!error?.message.toLowerCase().includes("duplicate")) break;
  }
  if (!sessionRow) throw lastError ?? new Error("Could not create room code.");

  if (options.mode === "team") {
    const count = Math.min(8, Math.max(2, options.teamCount ?? 4));
    const payload = TEAM_PRESETS.slice(0, count).map(([name, color], index) => ({
      session_id: String(sessionRow!.id),
      name,
      color,
      sort_order: index,
    }));
    const { error } = await supabase.from("teams").insert(payload);
    if (error) throw error;
  }

  return mapSession(sessionRow);
}

export async function getHostRoom(sessionId: string) {
  const supabase = requireSupabase();
  const [sessionResponse, playersResponse, teamsResponse, answersResponse] = await Promise.all([
    supabase.from("game_sessions").select("*").eq("id", sessionId).single(),
    supabase.from("players").select("*").eq("session_id", sessionId).eq("removed", false).order("connected_at"),
    supabase.from("teams").select("*").eq("session_id", sessionId).order("sort_order"),
    supabase.from("answers").select("player_id,item_id").eq("session_id", sessionId),
  ]);
  if (sessionResponse.error) throw sessionResponse.error;
  if (playersResponse.error) throw playersResponse.error;
  if (teamsResponse.error) throw teamsResponse.error;
  if (answersResponse.error) throw answersResponse.error;
  return {
    session: mapSession(sessionResponse.data as Record<string, unknown>),
    players: (playersResponse.data ?? []).map((row) => mapPlayer(row as Record<string, unknown>)),
    teams: (teamsResponse.data ?? []).map((row) => mapTeam(row as Record<string, unknown>)),
    answers: (answersResponse.data ?? []).map((row) => ({ playerId: String(row.player_id), itemId: String(row.item_id) })),
  };
}

export async function joinLiveRoom(roomCode: string, nickname: string): Promise<JoinRoomResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("join_classplay_room", { p_room_code: roomCode, p_nickname: nickname });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Room not found.");
  return {
    sessionId: row.session_id,
    playerId: row.player_id,
    playerToken: row.player_token,
    activityTitle: row.activity_title,
    mode: row.mode,
    state: row.state,
    teamId: row.team_id,
    teamName: row.team_name,
    teamColor: row.team_color,
  };
}

export async function resumeLiveRoom(playerId: string, playerToken: string): Promise<ResumeRoomResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("resume_classplay_player", { p_player_id: playerId, p_player_token: playerToken });
  if (error) throw error;
  const payload = data as Record<string, unknown>;
  if (!payload?.sessionId) throw new Error("This live-session connection is no longer valid.");
  return payload as unknown as ResumeRoomResult;
}

export async function submitLiveAnswer(playerId: string, playerToken: string, question: LiveQuestion, answer: string, responseMs: number): Promise<LiveAnswerResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("submit_classplay_answer", {
    p_player_id: playerId,
    p_player_token: playerToken,
    p_item_id: question.itemId,
    p_answer_text: answer,
    p_response_ms: Math.max(0, Math.round(responseMs)),
  });
  if (error) throw error;
  return data as LiveAnswerResult;
}

export async function submitDynamiteAttempt(playerId: string, playerToken: string, question: LiveQuestion, answer: string): Promise<DynamiteAttemptResult> {
  if (!question.dynamiteTurnId) throw new Error("This Dynamite turn is missing its server token.");
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("submit_dynamite_attempt", {
    p_player_id: playerId,
    p_player_token: playerToken,
    p_item_id: question.itemId,
    p_turn_id: question.dynamiteTurnId,
    p_answer_text: answer,
  });
  if (error) throw error;
  return data as DynamiteAttemptResult;
}

export async function updateHostSession(sessionId: string, patch: Partial<{
  state: SessionState;
  locked: boolean;
  current_item_index: number;
  current_question: LiveQuestion | null;
  round_started_at: string | null;
  settings: ClassroomSettings;
}>) {
  const supabase = requireSupabase();
  const { error } = await supabase.from("game_sessions").update(patch).eq("id", sessionId);
  if (error) throw error;
}

export async function movePlayerToTeam(playerId: string, teamId: string | null) {
  const supabase = requireSupabase();
  const { error } = await supabase.from("players").update({ team_id: teamId }).eq("id", playerId);
  if (error) throw error;
}

export async function removeLivePlayer(playerId: string) {
  const supabase = requireSupabase();
  const { error } = await supabase.from("players").update({ removed: true }).eq("id", playerId);
  if (error) throw error;
}

export async function finalizeLiveSession(sessionId: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("finalize_classplay_session", { p_session_id: sessionId });
  if (error) throw error;
  return data;
}

export function openLiveChannel(sessionId: string, presenceKey: string): RealtimeChannel {
  const supabase = requireSupabase();
  return supabase.channel(`classplay:${sessionId}`, { config: { presence: { key: presenceKey } } });
}

export async function broadcastRoomEvent(channel: RealtimeChannel, event: string, payload: Record<string, unknown>) {
  await channel.send({ type: "broadcast", event, payload });
}

export function subscribeHostChanges(sessionId: string, onChange: () => void) {
  const supabase = requireSupabase();
  const channel = supabase
    .channel(`classplay-host-db:${sessionId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `session_id=eq.${sessionId}` }, onChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter: `session_id=eq.${sessionId}` }, onChange)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_sessions", filter: `id=eq.${sessionId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

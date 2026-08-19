"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { GameType } from "@/lib/types";

export interface PracticeLeaderboardEntry {
  id: string;
  activityId: string;
  game: GameType;
  playerName: string;
  score: number;
  correct: number;
  total: number;
  createdAt: string;
}

function mapEntry(row: Record<string, unknown>): PracticeLeaderboardEntry {
  return {
    id: String(row.id),
    activityId: String(row.activity_set_id),
    game: String(row.game_type) as GameType,
    playerName: String(row.player_name),
    score: Number(row.score ?? 0),
    correct: Number(row.correct ?? 0),
    total: Number(row.total ?? 0),
    createdAt: String(row.created_at),
  };
}

export function cleanPracticePlayerName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}

export async function loadPracticeLeaderboard(
  activityId: string,
  game: GameType,
  limit = 10,
): Promise<PracticeLeaderboardEntry[]> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("practice_scores")
    .select("id, activity_set_id, game_type, player_name, score, correct, total, created_at")
    .eq("activity_set_id", activityId)
    .eq("game_type", game)
    .order("score", { ascending: false })
    .order("correct", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(10, limit)));

  if (error) throw error;
  return (data ?? []).map((row) => mapEntry(row as unknown as Record<string, unknown>));
}

export async function submitPracticeScore(input: {
  activityId: string;
  game: GameType;
  playerName: string;
  score: number;
  correct: number;
  total: number;
}): Promise<PracticeLeaderboardEntry> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) throw new Error("This ClassPlay installation is not connected to the cloud leaderboard.");

  const playerName = cleanPracticePlayerName(input.playerName);
  if (!playerName) throw new Error("Enter your name before saving the score.");

  const score = Math.max(0, Math.min(1_000_000, Math.round(input.score)));
  const total = Math.max(0, Math.round(input.total));
  const correct = Math.max(0, Math.min(total, Math.round(input.correct)));

  const { data, error } = await supabase
    .from("practice_scores")
    .insert({
      activity_set_id: input.activityId,
      game_type: input.game,
      player_name: playerName,
      score,
      correct,
      total,
    })
    .select("id, activity_set_id, game_type, player_name, score, correct, total, created_at")
    .single();

  if (error) throw error;
  return mapEntry(data as unknown as Record<string, unknown>);
}

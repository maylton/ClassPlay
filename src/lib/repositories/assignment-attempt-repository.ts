"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { GameType } from "@/lib/types";
import type { AssignmentAttemptRecord, AssignmentRecord, ClassMemberRecord } from "./classroom-repository";

function clientOrThrow() {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) throw new Error("ClassPlay cloud setup is required for assignments.");
  return supabase;
}

function mapAttempt(row: Record<string, unknown>): AssignmentAttemptRecord {
  return {
    id: String(row.id),
    assignmentId: String(row.assignment_id),
    memberId: String(row.member_id),
    gameType: String(row.game_type) as GameType,
    score: Number(row.score ?? 0),
    correct: Number(row.correct ?? 0),
    total: Number(row.total ?? 0),
    completedAt: String(row.completed_at),
  };
}

export async function submitSecureAssignmentAttempt(input: {
  assignment: AssignmentRecord;
  member: ClassMemberRecord;
  game: GameType;
  score: number;
  correct: number;
  total: number;
}): Promise<AssignmentAttemptRecord> {
  const supabase = clientOrThrow();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user || input.member.userId !== user.id) throw new Error("Student session mismatch.");

  const { data, error } = await supabase.rpc("submit_assignment_attempt", {
    p_assignment_id: input.assignment.id,
    p_member_id: input.member.id,
    p_game_type: input.game,
    p_score: Math.max(0, Math.round(input.score)),
    p_correct: Math.max(0, Math.round(input.correct)),
    p_total: Math.max(0, Math.round(input.total)),
  });
  if (error) throw error;
  if (!data) throw new Error("Your result could not be saved.");
  return mapAttempt(data as unknown as Record<string, unknown>);
}

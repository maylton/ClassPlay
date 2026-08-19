"use client";

import { ensureCloudActivity, listActivities } from "@/lib/repositories/activity-repository";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ActivitySet, GameType } from "@/lib/types";

export interface CommunityActivity {
  activityId: string;
  authorName: string;
  publishedAt: string;
  title: string;
  description: string;
  subject: string;
  topic: string;
  level: string;
  grade: string;
  kind: ActivitySet["kind"];
  coverImageUrl?: string;
  itemCount: number;
  gameModes: GameType[];
}

export interface CommunityTeacherState {
  teacher: boolean;
  library: ActivitySet[];
  publishedIds: Set<string>;
}

export function emptyCommunityTeacherState(): CommunityTeacherState {
  return { teacher: false, library: [], publishedIds: new Set() };
}

function clientOrThrow() {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) throw new Error("ClassPlay cloud setup is required for Community.");
  return supabase;
}

function mapCatalog(row: Record<string, unknown>): CommunityActivity {
  return {
    activityId: String(row.activity_set_id),
    authorName: String(row.author_name ?? "Teacher"),
    publishedAt: String(row.published_at),
    title: String(row.title ?? "Untitled activity"),
    description: String(row.description ?? ""),
    subject: String(row.subject ?? "English"),
    topic: String(row.topic ?? "English practice"),
    level: String(row.cefr_level ?? "Class"),
    grade: String(row.grade ?? "Class"),
    kind: String(row.kind ?? "mixed") as ActivitySet["kind"],
    coverImageUrl: row.cover_image_url ? String(row.cover_image_url) : undefined,
    itemCount: Number(row.item_count ?? 0),
    gameModes: Array.isArray(row.game_modes) ? row.game_modes.map((mode) => String(mode) as GameType) : [],
  };
}

export async function listCommunityActivities(): Promise<CommunityActivity[]> {
  const supabase = clientOrThrow();
  const { data, error } = await supabase
    .from("community_catalog")
    .select("activity_set_id,author_name,published_at,title,description,subject,topic,cefr_level,grade,kind,cover_image_url,item_count,game_modes")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapCatalog(row as unknown as Record<string, unknown>));
}

export async function loadCommunityTeacherState(): Promise<CommunityTeacherState> {
  const supabase = clientOrThrow();

  // Community is public. An absent auth session is the normal visitor state,
  // not an authentication error. getUser() throws AuthSessionMissingError when
  // there is no session, so inspect the local session first and only load
  // teacher-only data when a signed-in user actually exists.
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user) return emptyCommunityTeacherState();

  const user = session.user;
  const { data: studentProfile, error: studentError } = await supabase
    .from("student_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (studentError) throw studentError;
  if (studentProfile) return emptyCommunityTeacherState();

  const [library, listings] = await Promise.all([
    listActivities(),
    supabase.from("community_listings").select("activity_set_id").eq("owner_id", user.id),
  ]);
  if (listings.error) throw listings.error;
  return { teacher: true, library, publishedIds: new Set((listings.data ?? []).map((row) => String(row.activity_set_id))) };
}

export async function publishActivityToCommunity(activity: ActivitySet): Promise<string> {
  const cloud = await ensureCloudActivity(activity);
  const supabase = clientOrThrow();
  const { error } = await supabase.rpc("publish_community_activity", { p_activity_id: cloud.id });
  if (error) throw error;
  return cloud.id;
}

export async function removeActivityFromCommunity(activityId: string) {
  const supabase = clientOrThrow();
  const { error } = await supabase.rpc("remove_community_activity", { p_activity_id: activityId });
  if (error) throw error;
}

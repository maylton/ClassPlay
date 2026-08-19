"use client";

import { compatibleEnabledGames } from "@/lib/activity-intelligence";
import { ensureCloudActivity, listActivities } from "@/lib/repositories/activity-repository";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ActivityItem, ActivitySet, GameType } from "@/lib/types";

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
  aiGenerated: boolean;
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
    aiGenerated: row.ai_generated === true,
  };
}

function mapCommunityItem(row: Record<string, unknown>): ActivityItem {
  return {
    id: String(row.id),
    prompt: String(row.prompt ?? ""),
    answer: String(row.answer ?? ""),
    hint: row.hint ? String(row.hint) : undefined,
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    example: row.example ? String(row.example) : undefined,
    gapSentence: row.gap_sentence ? String(row.gap_sentence) : undefined,
    distractors: Array.isArray(row.distractors) ? row.distractors.map(String) : [],
    sentenceParts: Array.isArray(row.sentence_parts) ? row.sentence_parts.map(String) : [],
  };
}

export async function listCommunityActivities(): Promise<CommunityActivity[]> {
  const supabase = clientOrThrow();
  const { data, error } = await supabase
    .from("community_catalog")
    .select("activity_set_id,author_name,published_at,title,description,subject,topic,cefr_level,grade,kind,cover_image_url,item_count,game_modes,ai_generated")
    .order("published_at", { ascending: false });
  if (error) throw error;

  const catalog = (data ?? []).map((row) => mapCatalog(row as unknown as Record<string, unknown>));
  const activityIds = catalog.map((activity) => activity.activityId);
  if (!activityIds.length) return catalog;

  // Community cards should advertise the same modes the student will actually
  // see after opening the deck. One batched item query lets old published decks
  // benefit from the current compatibility engine without rewriting them first.
  const { data: itemRows, error: itemError } = await supabase
    .from("activity_items")
    .select("id,activity_set_id,prompt,answer,hint,image_url,example,gap_sentence,distractors,sentence_parts")
    .in("activity_set_id", activityIds);
  if (itemError) throw itemError;

  const itemsByActivity = new Map<string, ActivityItem[]>();
  for (const raw of itemRows ?? []) {
    const row = raw as unknown as Record<string, unknown>;
    const activityId = String(row.activity_set_id);
    const items = itemsByActivity.get(activityId) ?? [];
    items.push(mapCommunityItem(row));
    itemsByActivity.set(activityId, items);
  }

  return catalog.map((activity) => ({
    ...activity,
    gameModes: compatibleEnabledGames(itemsByActivity.get(activity.activityId) ?? [], activity.gameModes),
  }));
}

export async function loadCommunityTeacherState(): Promise<CommunityTeacherState> {
  const supabase = clientOrThrow();
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

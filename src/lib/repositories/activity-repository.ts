"use client";

import { SAMPLE_ACTIVITY } from "@/lib/sample-data";
import {
  deleteActivity as deleteLocalActivity,
  duplicateActivity as duplicateLocalActivity,
  getActivities as getLocalActivities,
  getActivity as getLocalActivity,
  saveActivity as saveLocalActivity,
} from "@/lib/storage";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ActivityItem, ActivitySet, GameType } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
}

async function cloudContext() {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

function mapCloudActivity(row: Record<string, unknown>): ActivitySet {
  const itemRows = ((row.activity_items ?? []) as Record<string, unknown>[]).slice().sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  const games = ((row.activity_games ?? []) as Record<string, unknown>[]).map((game) => String(game.game_type) as GameType);
  return {
    id: String(row.id),
    ownerId: row.owner_id ? String(row.owner_id) : undefined,
    sourceLocalId: row.source_local_id ? String(row.source_local_id) : undefined,
    title: String(row.title ?? "Untitled activity"),
    description: String(row.description ?? ""),
    subject: String(row.subject ?? "English"),
    topic: String(row.topic ?? "English practice"),
    level: String(row.cefr_level ?? "A1–A2"),
    grade: String(row.grade ?? "Class"),
    kind: (row.kind ?? "mixed") as ActivitySet["kind"],
    visibility: (row.visibility ?? "private") as ActivitySet["visibility"],
    items: itemRows.map((item): ActivityItem => ({
      id: String(item.id),
      prompt: String(item.prompt ?? ""),
      answer: String(item.answer ?? ""),
      hint: item.hint ? String(item.hint) : undefined,
      imageUrl: item.image_url ? String(item.image_url) : undefined,
      example: item.example ? String(item.example) : undefined,
      gapSentence: item.gap_sentence ? String(item.gap_sentence) : undefined,
      distractors: Array.isArray(item.distractors) ? item.distractors.map(String) : [],
      sentenceParts: Array.isArray(item.sentence_parts) ? item.sentence_parts.map(String) : [],
    })),
    enabledGames: games,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const SELECT_GRAPH = `
  id, owner_id, source_local_id, title, description, subject, topic, cefr_level, grade, kind, visibility, created_at, updated_at,
  activity_items ( id, sort_order, prompt, answer, hint, image_url, example, gap_sentence, distractors, sentence_parts ),
  activity_games ( game_type, settings )
`;

export async function listActivities(): Promise<ActivitySet[]> {
  const context = await cloudContext();
  if (!context) return getLocalActivities();

  const { data, error } = await context.supabase
    .from("activity_sets")
    .select(SELECT_GRAPH)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const cloud = (data ?? []).map((row) => mapCloudActivity(row as unknown as Record<string, unknown>));
  const hasCloudDemo = cloud.some((activity) => activity.id === SAMPLE_ACTIVITY.id || activity.sourceLocalId === SAMPLE_ACTIVITY.id);
  return hasCloudDemo ? cloud : [...cloud, SAMPLE_ACTIVITY];
}

export async function loadActivity(id: string): Promise<ActivitySet | undefined> {
  if (id === SAMPLE_ACTIVITY.id) return SAMPLE_ACTIVITY;
  const context = await cloudContext();
  if (!context || !isUuid(id)) return getLocalActivity(id);

  const { data, error } = await context.supabase.from("activity_sets").select(SELECT_GRAPH).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapCloudActivity(data as unknown as Record<string, unknown>) : undefined;
}

async function persistCloudActivity(activity: ActivitySet, sourceLocalId?: string): Promise<ActivitySet> {
  const context = await cloudContext();
  if (!context) throw new Error("Teacher session required for cloud save.");
  const { supabase, user } = context;

  const resolvedSourceLocalId = sourceLocalId ?? activity.sourceLocalId ?? (!isUuid(activity.id) ? activity.id : undefined);
  let id = isUuid(activity.id) ? activity.id : "";

  // Local/demo activities should converge on one cloud record instead of creating
  // a fresh UUID on every retry. This is especially important if a child write
  // fails after the parent activity row has already been created.
  if (!id && resolvedSourceLocalId) {
    const { data: existing, error: existingError } = await supabase
      .from("activity_sets")
      .select("id")
      .eq("owner_id", user.id)
      .eq("source_local_id", resolvedSourceLocalId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) id = String(existing.id);
  }
  if (!id) id = crypto.randomUUID();

  const now = new Date().toISOString();
  const { error: setError } = await supabase.from("activity_sets").upsert({
    id,
    owner_id: user.id,
    source_local_id: resolvedSourceLocalId ?? null,
    title: activity.title,
    description: activity.description,
    subject: activity.subject,
    topic: activity.topic,
    cefr_level: activity.level,
    grade: activity.grade,
    kind: activity.kind,
    visibility: activity.visibility ?? "private",
    created_at: activity.createdAt || now,
    updated_at: now,
  });
  if (setError) throw setError;

  const itemPayload = activity.items.map((item, index) => ({
    id: isUuid(item.id) ? item.id : crypto.randomUUID(),
    activity_set_id: id,
    sort_order: index,
    prompt: item.prompt,
    answer: item.answer,
    hint: item.hint || null,
    image_url: item.imageUrl || null,
    example: item.example || null,
    gap_sentence: item.gapSentence || null,
    distractors: item.distractors ?? [],
    sentence_parts: item.sentenceParts ?? [],
  }));

  // Write the desired children first. Only remove stale rows after the upsert
  // succeeds, so a validation/network error cannot wipe the last good version.
  if (itemPayload.length) {
    const { error } = await supabase.from("activity_items").upsert(itemPayload, { onConflict: "id" });
    if (error) throw error;
  }

  const { data: existingItems, error: existingItemsError } = await supabase
    .from("activity_items")
    .select("id")
    .eq("activity_set_id", id);
  if (existingItemsError) throw existingItemsError;
  const desiredItemIds = new Set(itemPayload.map((item) => item.id));
  const staleItemIds = (existingItems ?? []).map((item) => String(item.id)).filter((itemId) => !desiredItemIds.has(itemId));
  if (staleItemIds.length) {
    const { error } = await supabase.from("activity_items").delete().eq("activity_set_id", id).in("id", staleItemIds);
    if (error) throw error;
  }

  const gamePayload = activity.enabledGames.map((game) => ({ activity_set_id: id, game_type: game, settings: {} }));
  if (gamePayload.length) {
    const { error } = await supabase.from("activity_games").upsert(gamePayload, { onConflict: "activity_set_id,game_type" });
    if (error) throw error;
  }

  const { data: existingGames, error: existingGamesError } = await supabase
    .from("activity_games")
    .select("game_type")
    .eq("activity_set_id", id);
  if (existingGamesError) throw existingGamesError;
  const desiredGames = new Set(activity.enabledGames);
  const staleGames = (existingGames ?? []).map((game) => String(game.game_type) as GameType).filter((game) => !desiredGames.has(game));
  if (staleGames.length) {
    const { error } = await supabase.from("activity_games").delete().eq("activity_set_id", id).in("game_type", staleGames);
    if (error) throw error;
  }

  const saved = await loadActivity(id);
  if (!saved) throw new Error("Activity saved but could not be reloaded.");
  return saved;
}

export async function saveActivity(activity: ActivitySet): Promise<ActivitySet> {
  const context = await cloudContext();
  if (!context) {
    saveLocalActivity(activity);
    return activity;
  }
  return persistCloudActivity(activity);
}

export async function removeActivity(id: string) {
  const context = await cloudContext();
  if (!context || !isUuid(id)) {
    deleteLocalActivity(id);
    return;
  }
  const { error } = await context.supabase.from("activity_sets").delete().eq("id", id);
  if (error) throw error;
}

export async function cloneActivity(id: string): Promise<ActivitySet | undefined> {
  const context = await cloudContext();
  if (!context) return duplicateLocalActivity(id);
  const source = await loadActivity(id);
  if (!source) return undefined;
  const now = new Date().toISOString();
  const copy: ActivitySet = {
    ...source,
    id: crypto.randomUUID(),
    ownerId: context.user.id,
    sourceLocalId: undefined,
    title: `${source.title} (Copy)`,
    items: source.items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    createdAt: now,
    updatedAt: now,
  };
  return persistCloudActivity(copy);
}

export interface MigrationReport {
  imported: number;
  skipped: number;
  failed: number;
}

export function getMigratableLocalActivities() {
  return getLocalActivities().filter((activity) => activity.id !== SAMPLE_ACTIVITY.id);
}

export async function migrateLocalActivitiesToCloud(): Promise<MigrationReport> {
  const context = await cloudContext();
  if (!context) throw new Error("Sign in before importing local activities.");
  const locals = getMigratableLocalActivities();
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const activity of locals) {
    const { data: existing } = await context.supabase
      .from("activity_sets")
      .select("id")
      .eq("owner_id", context.user.id)
      .eq("source_local_id", activity.id)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }
    try {
      await persistCloudActivity({
        ...activity,
        id: crypto.randomUUID(),
        sourceLocalId: activity.id,
        items: activity.items.map((item) => ({ ...item, id: crypto.randomUUID() })),
      }, activity.id);
      imported += 1;
    } catch {
      failed += 1;
    }
  }
  return { imported, skipped, failed };
}

export async function ensureCloudActivity(activity: ActivitySet): Promise<ActivitySet> {
  const context = await cloudContext();
  if (!context) throw new Error("Connect ClassPlay to Supabase and sign in to host a live room.");
  if (isUuid(activity.id) && activity.ownerId === context.user.id) return activity;

  const sourceId = activity.sourceLocalId ?? activity.id;
  const { data } = await context.supabase.from("activity_sets").select("id").eq("owner_id", context.user.id).eq("source_local_id", sourceId).maybeSingle();
  if (data?.id) {
    const existing = await loadActivity(String(data.id));
    if (existing) return existing;
  }

  return persistCloudActivity({
    ...activity,
    id: crypto.randomUUID(),
    sourceLocalId: sourceId,
    items: activity.items.map((item) => ({ ...item, id: crypto.randomUUID() })),
  }, sourceId);
}

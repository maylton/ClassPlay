"use client";

import { SAMPLE_ACTIVITY } from "./sample-data";
import type { ActivitySet, GameResult, TeacherProfile } from "./types";

const ACTIVITIES_KEY = "classplay.activities.v1";
const PROFILE_KEY = "classplay.profile.v1";
const RESULTS_KEY = "classplay.results.v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getActivities(): ActivitySet[] {
  if (!canUseStorage()) return [SAMPLE_ACTIVITY];
  const raw = localStorage.getItem(ACTIVITIES_KEY);
  if (!raw) {
    localStorage.setItem(ACTIVITIES_KEY, JSON.stringify([SAMPLE_ACTIVITY]));
    return [SAMPLE_ACTIVITY];
  }
  try {
    const parsed = JSON.parse(raw) as ActivitySet[];
    return parsed.length ? parsed : [SAMPLE_ACTIVITY];
  } catch {
    localStorage.setItem(ACTIVITIES_KEY, JSON.stringify([SAMPLE_ACTIVITY]));
    return [SAMPLE_ACTIVITY];
  }
}

export function getActivity(id: string): ActivitySet | undefined { return getActivities().find((activity) => activity.id === id); }
export function saveActivity(activity: ActivitySet) {
  const activities = getActivities();
  const index = activities.findIndex((item) => item.id === activity.id);
  if (index >= 0) activities[index] = activity; else activities.unshift(activity);
  localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(activities));
}
export function deleteActivity(id: string) { localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(getActivities().filter((activity) => activity.id !== id))); }
export function duplicateActivity(id: string): ActivitySet | undefined {
  const source = getActivity(id); if (!source) return undefined;
  const now = new Date().toISOString();
  const copy: ActivitySet = { ...source, id: `${source.id}-copy-${Date.now()}`, title: `${source.title} (Copy)`, createdAt: now, updatedAt: now, items: source.items.map((item) => ({ ...item, id: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` })) };
  saveActivity(copy); return copy;
}
export function getProfile(): TeacherProfile {
  if (!canUseStorage()) return { name: "Teacher" };
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "") as TeacherProfile; } catch { return { name: "Teacher" }; }
}
export function saveProfile(profile: TeacherProfile) { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
export function addGameResult(result: GameResult) { if (!canUseStorage()) return; const results = getGameResults(); results.unshift(result); localStorage.setItem(RESULTS_KEY, JSON.stringify(results.slice(0, 100))); }
export function getGameResults(): GameResult[] { if (!canUseStorage()) return []; try { return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? "[]") as GameResult[]; } catch { return []; } }

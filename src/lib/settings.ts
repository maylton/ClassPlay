"use client";

import type { ClassroomSettings } from "./types";

const SETTINGS_KEY = "classplay.settings.v2";

export const DEFAULT_CLASSROOM_SETTINGS: ClassroomSettings = {
  reducedMotion: false,
  largeText: false,
  highContrast: false,
  timerEnabled: true,
  timerSeconds: 30,
  soundEnabled: true,
  leaderboardEnabled: true,
  readAloud: false,
};

export function getLocalClassroomSettings(): ClassroomSettings {
  if (typeof window === "undefined") return DEFAULT_CLASSROOM_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_CLASSROOM_SETTINGS;
    return { ...DEFAULT_CLASSROOM_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CLASSROOM_SETTINGS;
  }
}

export function saveLocalClassroomSettings(settings: ClassroomSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function applyClassroomSettings(settings: ClassroomSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("cp-reduced-motion", settings.reducedMotion);
  root.classList.toggle("cp-large-text", settings.largeText);
  root.classList.toggle("cp-high-contrast", settings.highContrast);
}

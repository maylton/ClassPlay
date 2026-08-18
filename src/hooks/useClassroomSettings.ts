"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { applyClassroomSettings, DEFAULT_CLASSROOM_SETTINGS, getLocalClassroomSettings, saveLocalClassroomSettings } from "@/lib/settings";
import type { ClassroomSettings } from "@/lib/types";

export function useClassroomSettings() {
  const [settings, setSettingsState] = useState<ClassroomSettings>(DEFAULT_CLASSROOM_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hydrate = window.setTimeout(() => {
      if (cancelled) return;
      const local = getLocalClassroomSettings();
      setSettingsState(local);
      applyClassroomSettings(local);

      void (async () => {
        const supabase = getBrowserSupabaseClient();
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("profiles").select("classroom_settings").eq("id", user.id).maybeSingle();
        if (!cancelled && data?.classroom_settings) {
          const cloud = { ...local, ...(data.classroom_settings as Partial<ClassroomSettings>) };
          setSettingsState(cloud);
          saveLocalClassroomSettings(cloud);
          applyClassroomSettings(cloud);
        }
      })().finally(() => !cancelled && setReady(true));
    }, 0);

    return () => { cancelled = true; window.clearTimeout(hydrate); };
  }, []);

  const setSettings = useCallback((next: ClassroomSettings | ((current: ClassroomSettings) => ClassroomSettings)) => {
    setSettingsState((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      saveLocalClassroomSettings(resolved);
      applyClassroomSettings(resolved);
      const supabase = getBrowserSupabaseClient();
      if (supabase) {
        void supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) void supabase.from("profiles").update({ classroom_settings: resolved }).eq("id", user.id);
        });
      }
      return resolved;
    });
  }, []);

  return { settings, setSettings, ready };
}

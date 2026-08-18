"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

let browserClient: SupabaseClient | null | undefined;

export function getBrowserSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (browserClient !== undefined) return browserClient;
  browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return browserClient;
}

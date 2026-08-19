"use client";

import { cloneActivity } from "@/lib/repositories/activity-repository";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export async function copyCommunityActivityToLibrary(activityId: string) {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) throw new Error("ClassPlay cloud setup is required.");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Sign in as a teacher to add activities to your Library.");

  const { data: studentProfile, error: studentError } = await supabase
    .from("student_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (studentError) throw studentError;
  if (studentProfile) throw new Error("Student accounts can play Community activities but cannot add them to a teacher Library.");

  const copy = await cloneActivity(activityId);
  if (!copy) throw new Error("Could not add this activity to your Library.");
  return copy;
}

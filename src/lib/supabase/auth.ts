import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./config";
import { getServerSupabaseClient } from "./server";

export async function getTeacherUser() {
  if (!isSupabaseConfigured) return null;
  const supabase = await getServerSupabaseClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

export async function requireTeacher(nextPath = "/dashboard", authMode: "signin" | "signup" = "signin") {
  if (!isSupabaseConfigured) return null;
  const user = await getTeacherUser();
  if (!user) {
    redirect(`/auth?mode=${authMode}&next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

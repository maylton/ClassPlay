import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./config";
import { getServerSupabaseClient } from "./server";

async function currentAccount() {
  if (!isSupabaseConfigured) return { user: null, student: false };
  const supabase = await getServerSupabaseClient();
  if (!supabase) return { user: null, student: false };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, student: false };
  const { data: studentProfile } = await supabase
    .from("student_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return { user, student: Boolean(studentProfile) };
}

export async function getTeacherUser() {
  const account = await currentAccount();
  return account.user && !account.student ? account.user : null;
}

export async function getStudentUser() {
  const account = await currentAccount();
  return account.user && account.student ? account.user : null;
}

export async function requireTeacher(nextPath = "/dashboard", authMode: "signin" | "signup" = "signin") {
  if (!isSupabaseConfigured) return null;
  const account = await currentAccount();
  if (account.student) redirect("/student");
  if (!account.user) {
    redirect(`/auth?mode=${authMode}&next=${encodeURIComponent(nextPath)}`);
  }
  return account.user;
}

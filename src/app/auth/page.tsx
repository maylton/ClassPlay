import { redirect } from "next/navigation";
import { AuthClient } from "@/components/AuthClient";
import { getStudentUser, getTeacherUser } from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string }> }) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/dashboard";
  const initialMode = params.mode === "signup" ? "signup" : "signin";
  if (isSupabaseConfigured) {
    if (await getStudentUser()) redirect("/student");
    if (await getTeacherUser()) redirect(nextPath);
  }
  return <AuthClient nextPath={nextPath} initialMode={initialMode} />;
}

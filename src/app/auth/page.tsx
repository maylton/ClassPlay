import { redirect } from "next/navigation";
import { AuthClient } from "@/components/AuthClient";
import { getTeacherUser } from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/dashboard";
  if (isSupabaseConfigured && await getTeacherUser()) redirect(nextPath);
  return <AuthClient nextPath={nextPath} />;
}

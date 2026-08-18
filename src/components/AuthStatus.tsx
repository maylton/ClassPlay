"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function AuthStatus() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data: { user } }) => setEmail(user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <span className="cloud-status local">Local mode</span>;
  if (!email) return <Link href="/auth" className="cloud-status">Sign in</Link>;
  return (
    <button className="cloud-status connected" onClick={async () => { await getBrowserSupabaseClient()?.auth.signOut(); router.push("/"); router.refresh(); }} title={email}>
      ● Cloud · Sign out
    </button>
  );
}

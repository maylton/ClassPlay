"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type AuthMode = "signin" | "signup";

export function AuthClient({ nextPath = "/dashboard", initialMode = "signin" }: { nextPath?: string; initialMode?: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return setMessage("Supabase is not configured yet. Local mode remains available.");
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name.trim() || "Teacher" },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          },
        });
        if (error) throw error;

        if (data.session) {
          router.push(nextPath);
          router.refresh();
          return;
        }

        setMessage("Account created. Check your email to confirm your address, then sign in to continue.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(nextPath);
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function magicLink() {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return setMessage("Supabase is not configured yet.");
    if (!email.trim()) return setMessage("Enter your email first.");
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}` },
    });
    setBusy(false);
    setMessage(error ? error.message : "Magic link sent. Open your email to continue.");
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand"><b>C</b><span>ClassPlay</span></div>
        <span className="eyebrow">Teacher account</span>
        <h1>{mode === "signin" ? "Welcome back." : "Create your teacher account."}</h1>
        <p>{mode === "signin"
          ? "Sign in to create, edit and sync your activities across devices."
          : "Create an account to build activities, keep them in the cloud and host live classroom games."}</p>
        <form onSubmit={submit} className="auth-form">
          {mode === "signup" && <label className="field"><span>Your name</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Teacher Maylton" /></label>}
          <label className="field"><span>Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teacher@example.com" /></label>
          <label className="field"><span>Password</span><input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>
          <button disabled={busy} className="button button-primary button-large">{busy ? "Working…" : mode === "signin" ? "Sign in →" : "Create account →"}</button>
          <button type="button" disabled={busy} className="button button-soft" onClick={magicLink}>✉ Send a magic link</button>
        </form>
        {message && <div className="auth-message">{message}</div>}
        <button className="auth-switch" onClick={() => {
          setMode((current) => current === "signin" ? "signup" : "signin");
          setMessage("");
        }}>{mode === "signin" ? "New to ClassPlay? Create an account" : "Already have an account? Sign in"}</button>
        {!isSupabaseConfigured && <a href="/dashboard" className="auth-local-link">Continue with local mode</a>}
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { requestStudentPasswordReset, updateStudentPassword } from "@/lib/repositories/student-account-repository";

export function StudentPasswordClient({ mode }: { mode: "request" | "update" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "request") {
        await requestStudentPasswordReset(email);
        setMessage("If that email belongs to a ClassPlay account, a password-reset link has been sent.");
      } else {
        if (password !== confirm) throw new Error("Passwords do not match.");
        await updateStudentPassword(password);
        setMessage("Password updated. You can return to your classes now.");
        window.setTimeout(() => router.push("/student"), 900);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your password.");
    } finally { setBusy(false); }
  }

  return (
    <main className="student-class-screen">
      <section className="student-class-join-card student-auth-card">
        <Link href="/" className="student-brand"><b>C</b><span>ClassPlay</span></Link>
        <span className="student-class-join-icon"><AppIcon name="key-fill" /></span>
        <span className="eyebrow">Student security</span>
        <h1>{mode === "request" ? "Reset your password." : "Choose a new password."}</h1>
        <p>{mode === "request" ? "Enter the email used for your student account. We’ll send a secure reset link." : "Use at least 8 characters for your new ClassPlay password."}</p>
        <form className="student-class-join-form" onSubmit={submit}>
          {mode === "request" ? <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label> : <><label><span>New password</span><input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label><label><span>Confirm password</span><input type="password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required /></label></>}
          {message && <div className="student-auth-message"><AppIcon name="check2-circle" /> {message}</div>}
          {error && <div className="student-error">{error}</div>}
          <button className="button button-primary button-large" disabled={busy}>{busy ? "Working…" : mode === "request" ? "Send reset link" : "Update password"}</button>
        </form>
        <Link className="student-class-secondary" href="/class/join">Back to student sign in</Link>
      </section>
    </main>
  );
}

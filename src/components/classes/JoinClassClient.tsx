"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { joinClassroom } from "@/lib/repositories/classroom-repository";

export function JoinClassClient({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode.toUpperCase().slice(0, 6));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.trim().length !== 6) return setError("Enter the six-character class key.");
    if (!name.trim()) return setError("Enter your name.");
    setBusy(true); setError("");
    try {
      const classroom = await joinClassroom(code, name);
      router.push(`/student/classes/${classroom.classroomId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join this class.");
    } finally { setBusy(false); }
  }

  return (
    <main className="student-class-screen">
      <section className="student-class-join-card">
        <Link href="/" className="student-brand"><b>C</b><span>ClassPlay</span></Link>
        <span className="student-class-join-icon"><AppIcon name="people-fill" /></span>
        <span className="eyebrow">Join a class</span>
        <h1>Your homework lives here.</h1>
        <p>Enter the class key from your teacher. No email address or password is required.</p>
        <form onSubmit={submit} className="student-class-join-form">
          <label><span>Class key</span><input value={code} maxLength={6} autoCapitalize="characters" autoCorrect="off" onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())} placeholder="AB23CD" required /></label>
          <label><span>Your name</span><input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="Ana" autoComplete="name" required /></label>
          {error && <div className="student-error">{error}</div>}
          <button className="button button-primary button-large" disabled={busy}>{busy ? "Joining…" : <>Join class <AppIcon name="arrow-right" /></>}</button>
        </form>
        <div className="student-session-note"><AppIcon name="phone" /><span>This browser remembers your student session, so you can come back to your assignments later.</span></div>
        <Link className="student-class-secondary" href="/student">Already joined? Open my classes</Link>
      </section>
    </main>
  );
}

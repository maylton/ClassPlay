"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import {
  completeStudentSignup,
  createStudentAccount,
  getStudentAuthState,
  joinClassroomWithAccount,
  registerStudentProfile,
  signInStudent,
  signOutStudent,
  type StudentAuthState,
} from "@/lib/repositories/student-account-repository";

export function JoinClassClient({
  initialCode = "",
  completionUsername = "",
  completeSignup = false,
}: {
  initialCode?: string;
  completionUsername?: string;
  completeSignup?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode.toUpperCase().slice(0, 6));
  const [username, setUsername] = useState(completionUsername);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signup" | "signin">(initialCode ? "signup" : "signin");
  const [authState, setAuthState] = useState<StudentAuthState | null>(null);
  const [busy, setBusy] = useState(completeSignup);
  const [message, setMessage] = useState(completeSignup ? "Finishing your student account…" : "");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const state = await getStudentAuthState();
        if (!active) return;
        setAuthState(state);
        if (completeSignup && initialCode && completionUsername && state.signedIn) {
          const classroom = await completeStudentSignup(initialCode, completionUsername);
          if (active) router.replace(`/student/classes/${classroom.classroomId}`);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not finish student sign-in.");
      } finally {
        if (active) setBusy(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [completeSignup, completionUsername, initialCode, router]);

  function cleanCode(value: string) {
    setCode(value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6));
  }

  function classKeyField(required = true) {
    return <label><span>{required ? "Class key" : "Class key (optional)"}</span><input value={code} maxLength={6} autoCapitalize="characters" autoCorrect="off" onChange={(event) => cleanCode(event.target.value)} placeholder={required ? "AB23CD" : "Only for a new class"} required={required} /></label>;
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await createStudentAccount({ email, password, username, joinCode: code });
      if (result.status === "confirm-email") {
        setMessage("Account created. Check your email and confirm your address. ClassPlay will bring you back here to finish joining the class.");
        return;
      }
      router.push(`/student/classes/${result.classroom.classroomId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the student account.");
    } finally { setBusy(false); }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const classroom = await signInStudent({ email, password, joinCode: code || undefined });
      router.push(classroom ? `/student/classes/${classroom.classroomId}` : "/student");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally { setBusy(false); }
  }

  async function finishProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await registerStudentProfile(username);
      const classroom = await joinClassroomWithAccount(code);
      router.push(`/student/classes/${classroom.classroomId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not finish your student profile.");
    } finally { setBusy(false); }
  }

  async function joinExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const classroom = await joinClassroomWithAccount(code);
      router.push(`/student/classes/${classroom.classroomId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join this class.");
    } finally { setBusy(false); }
  }

  async function handleUseAnotherAccount() {
    setBusy(true); setError("");
    try {
      await signOutStudent();
      setAuthState({ signedIn: false, profile: null });
      setAuthMode("signin");
      setMessage("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    } finally { setBusy(false); }
  }

  return (
    <main className="student-class-screen">
      <section className="student-class-join-card student-auth-card">
        <Link href="/" className="student-brand"><b>C</b><span>ClassPlay</span></Link>
        <span className="student-class-join-icon"><AppIcon name="shield-lock-fill" /></span>
        <span className="eyebrow">Student account</span>
        <h1>{initialCode ? "Join your class securely." : "Welcome back."}</h1>
        <p>{initialCode ? "Your class key connects you to the teacher. Your ClassPlay account keeps your classes, homework and results available when you come back." : "Sign in to open your classes and homework, or use a class key to join a new class."}</p>

        {!authState && <div className="student-auth-loading">Checking your ClassPlay account…</div>}

        {authState?.profile && (
          <>
            <div className="student-signed-in"><span>{authState.profile.username.slice(0, 1).toUpperCase()}</span><div><small>Signed in as</small><strong>{authState.profile.username}</strong><em>{authState.email}</em></div><button onClick={() => void handleUseAnotherAccount()} disabled={busy}>Use another account</button></div>
            <form onSubmit={joinExisting} className="student-class-join-form">
              {classKeyField(true)}
              {error && <div className="student-error">{error}</div>}
              <button className="button button-primary button-large" disabled={busy}>{busy ? "Joining…" : <>Join class <AppIcon name="arrow-right" /></>}</button>
            </form>
            <Link className="student-class-secondary" href="/student">Open my classes</Link>
          </>
        )}

        {authState?.signedIn && !authState.profile && (
          <form onSubmit={finishProfile} className="student-class-join-form">
            <div className="student-auth-callout"><AppIcon name="person-badge" /><span>Your email is confirmed. Choose the username your teacher and classmates will see.</span></div>
            {classKeyField(true)}
            <label><span>Username</span><input value={username} minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,23}" onChange={(event) => setUsername(event.target.value)} placeholder="ana.silva" autoComplete="username" required /></label>
            {error && <div className="student-error">{error}</div>}
            <button className="button button-primary button-large" disabled={busy}>{busy ? "Finishing…" : <>Finish profile & join <AppIcon name="arrow-right" /></>}</button>
            <button type="button" className="student-auth-text-button" onClick={() => void handleUseAnotherAccount()} disabled={busy}>Use another account</button>
          </form>
        )}

        {authState && !authState.signedIn && (
          <>
            <div className="student-auth-tabs"><button className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setError(""); setMessage(""); }}>First time here</button><button className={authMode === "signin" ? "active" : ""} onClick={() => { setAuthMode("signin"); setError(""); setMessage(""); }}>I have an account</button></div>
            <form onSubmit={authMode === "signup" ? createAccount : signIn} className="student-class-join-form">
              {classKeyField(authMode === "signup")}
              {authMode === "signup" && <label><span>Username</span><input value={username} minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,23}" onChange={(event) => setUsername(event.target.value)} placeholder="ana.silva" autoComplete="username" required /></label>}
              <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" autoComplete="email" required /></label>
              <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} placeholder="At least 8 characters" autoComplete={authMode === "signup" ? "new-password" : "current-password"} required /></label>
              {authMode === "signin" && <Link className="student-auth-forgot" href="/student/forgot-password">Forgot password?</Link>}
              {message && <div className="student-auth-message"><AppIcon name="envelope-check" /> {message}</div>}
              {error && <div className="student-error">{error}</div>}
              <button className="button button-primary button-large" disabled={busy}>{busy ? "Working…" : authMode === "signup" ? <>Create account & join <AppIcon name="arrow-right" /></> : <>{code ? "Sign in & join" : "Sign in"} <AppIcon name="arrow-right" /></>}</button>
            </form>
            <p className="student-auth-privacy"><AppIcon name="lock" /> Your teacher sees your username and learning progress, not your password.</p>
          </>
        )}
      </section>
    </main>
  );
}

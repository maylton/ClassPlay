"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { listStudentClassrooms, type StudentClassSummary } from "@/lib/repositories/classroom-repository";
import { getStudentAuthState, signOutStudent, type StudentProfile } from "@/lib/repositories/student-account-repository";

export function StudentHomeClient() {
  const router = useRouter();
  const [classes, setClasses] = useState<StudentClassSummary[]>([]);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([getStudentAuthState(), listStudentClassrooms()])
      .then(([auth, rows]) => { if (active) { setSignedIn(auth.signedIn); setProfile(auth.profile); setClasses(rows); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load your classes."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function signOut() {
    try {
      await signOutStudent();
      router.push("/class/join");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    }
  }

  if (!loading && (!signedIn || !profile)) {
    return <main className="student-class-screen"><section className="student-class-join-card"><span className="student-class-join-icon"><AppIcon name="person-lock" /></span><span className="eyebrow">Student workspace</span><h1>Sign in to your classes.</h1><p>Your ClassPlay student account keeps homework and progress connected across visits.</p>{error && <div className="student-error">{error}</div>}<Link className="button button-primary button-large student-home-login" href="/class/join">Sign in or join a class <AppIcon name="arrow-right" /></Link><Link className="student-class-secondary" href="/community">Browse Community games</Link></section></main>;
  }

  return (
    <main className="student-class-screen student-home-screen">
      <section className="student-home-shell">
        <header className="student-home-header"><Link href="/" className="student-brand"><b>C</b><span>ClassPlay</span></Link><div className="student-home-actions"><Link className="button button-soft button-small" href="/community"><AppIcon name="globe2" /> Community</Link><Link className="button button-soft button-small" href="/class/join"><AppIcon name="plus-lg" /> Join class</Link>{profile && <button className="student-account-pill" onClick={() => void signOut()} title="Sign out"><span>{profile.username.slice(0, 1).toUpperCase()}</span><b>{profile.username}</b><AppIcon name="box-arrow-right" /></button>}</div></header>
        <section className="student-home-hero"><span className="eyebrow">Student workspace</span><h1>My classes</h1><p>Open a class to see homework and practice assigned by your teacher.</p></section>
        {error && <div className="student-error">{error}</div>}
        {loading ? <div className="student-class-empty">Loading your classes…</div> : classes.length ? (
          <div className="student-class-grid">
            {classes.map((classroom) => <Link className="student-class-card" href={`/student/classes/${classroom.classroomId}`} key={classroom.memberId}><span><AppIcon name="people-fill" /></span><small>{classroom.schoolYear}</small><h2>{classroom.name}</h2><p>Signed in as <b>{profile?.username ?? classroom.displayName}</b></p><strong>Open class <AppIcon name="arrow-right" /></strong></Link>)}
          </div>
        ) : <div className="student-class-empty"><span><AppIcon name="people" /></span><h2>You haven’t joined a class yet.</h2><p>Ask your teacher for the six-character class key.</p><Link className="button button-primary" href="/class/join">Join a class</Link></div>}
      </section>
    </main>
  );
}

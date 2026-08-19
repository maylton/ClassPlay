"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { createClassroom, listTeacherClassrooms, type ClassroomSummary } from "@/lib/repositories/classroom-repository";

export function ClassesClient() {
  const [classes, setClasses] = useState<ClassroomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [defaultSchoolYear] = useState(() => String(new Date().getFullYear()));

  async function refresh() {
    try {
      setClasses(await listTeacherClassrooms());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load classes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void listTeacherClassrooms()
      .then((rows) => { if (active) setClasses(rows); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load classes."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCreating(true); setError("");
    try {
      await createClassroom(String(form.get("name") ?? ""), String(form.get("schoolYear") ?? ""));
      event.currentTarget.reset();
      setShowForm(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create class.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="classes-workspace">
      <section className="classes-hero">
        <div>
          <span className="eyebrow">Classes & assignments</span>
          <h1>Your classes, one place.</h1>
          <p>Create a persistent class, share one join key, and send ClassPlay activities as homework without asking students for email accounts.</p>
        </div>
        <button className="button button-primary button-large" onClick={() => setShowForm((value) => !value)}><AppIcon name="plus-lg" /> Create class</button>
      </section>

      {showForm && (
        <form className="class-create-panel" onSubmit={create}>
          <div><span className="eyebrow">New class</span><h2>Set up the classroom.</h2><p>ClassPlay will generate a six-character join key automatically.</p></div>
          <label><span>Class name</span><input name="name" maxLength={80} placeholder="7º Ano A" autoFocus required /></label>
          <label><span>School year</span><input name="schoolYear" maxLength={20} defaultValue={defaultSchoolYear} required /></label>
          <div className="class-create-actions"><button type="button" className="button button-soft" onClick={() => setShowForm(false)}>Cancel</button><button className="button button-primary" disabled={creating}>{creating ? "Creating…" : "Create class"}</button></div>
        </form>
      )}

      {error && <div className="alert-error">{error}</div>}

      <section className="classes-section">
        <div className="section-toolbar"><div><span className="eyebrow">Teacher workspace</span><h2>Active classes</h2><p className="section-subcopy">Each class keeps its members, assignments and progress across lessons.</p></div><Link className="button button-soft" href="/class/join"><AppIcon name="box-arrow-in-right" /> Student join page</Link></div>
        {loading ? <div className="classes-empty">Loading classes…</div> : classes.length ? (
          <div className="class-card-grid">
            {classes.map((classroom) => (
              <Link href={`/classes/${classroom.id}`} className="class-card" key={classroom.id}>
                <div className="class-card-top"><span className="class-icon"><AppIcon name="people-fill" /></span><span className={`class-status ${classroom.joinEnabled ? "open" : ""}`}>{classroom.joinEnabled ? "Joining open" : "Joining closed"}</span></div>
                <small>{classroom.schoolYear}</small>
                <h3>{classroom.name}</h3>
                <div className="class-code-preview"><span>Class key</span><strong>{classroom.joinCode}</strong></div>
                <div className="class-card-metrics"><span><b>{classroom.memberCount}</b> students</span><span><b>{classroom.assignmentCount}</b> assignments</span></div>
                <span className="class-open-link">Open class <AppIcon name="arrow-right" /></span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="classes-empty"><span><AppIcon name="people" /></span><h3>No classes yet.</h3><p>Create your first class and ClassPlay will give you a join key to share with students.</p><button className="button button-primary" onClick={() => setShowForm(true)}>Create first class</button></div>
        )}
      </section>
    </main>
  );
}

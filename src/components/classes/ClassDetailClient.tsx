"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { GAME_MODE_CATALOG, GAME_MODE_ORDER } from "@/lib/game-catalog";
import {
  createAssignment,
  deleteAssignment,
  loadTeacherClassroom,
  removeClassMember,
  setClassJoining,
  type TeacherClassDetail,
} from "@/lib/repositories/classroom-repository";
import type { GameType } from "@/lib/types";

export function ClassDetailClient({ classroomId }: { classroomId: string }) {
  const [detail, setDetail] = useState<TeacherClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAssignment, setShowAssignment] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [saving, setSaving] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setDetail(await loadTeacherClassroom(classroomId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this class.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadTeacherClassroom(classroomId)
      .then((loaded) => { if (active) setDetail(loaded); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load this class."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [classroomId]);

  const activeMembers = useMemo(() => detail?.members.filter((member) => member.active) ?? [], [detail]);
  const selectedActivity = detail?.activities.find((activity) => activity.id === selectedActivityId) ?? detail?.activities[0];

  async function copyJoin() {
    if (!detail) return;
    const url = `${window.location.origin}/class/join?code=${detail.classroom.joinCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("Join link copied.");
    } catch {
      setShareMessage(url);
    }
  }

  async function toggleJoining() {
    if (!detail) return;
    setSaving(true); setError("");
    try {
      await setClassJoining(classroomId, !detail.classroom.joinEnabled);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update joining.");
    } finally { setSaving(false); }
  }

  async function removeMember(memberId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this class?`)) return;
    try { await removeClassMember(memberId); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove student."); }
  }

  async function addAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    const activity = detail.activities.find((item) => item.id === String(form.get("activity")));
    if (!activity) return setError("Choose an activity.");
    const gameValue = String(form.get("gameType") ?? "");
    const attemptsValue = String(form.get("attempts") ?? "").trim();
    const dueValue = String(form.get("dueAt") ?? "").trim();
    setSaving(true); setError("");
    try {
      await createAssignment({
        classroomId,
        activity,
        title: String(form.get("title") ?? activity.title),
        instructions: String(form.get("instructions") ?? ""),
        gameType: gameValue ? gameValue as GameType : null,
        dueAt: dueValue ? new Date(dueValue).toISOString() : null,
        attemptsLimit: attemptsValue ? Number(attemptsValue) : null,
      });
      setShowAssignment(false);
      event.currentTarget.reset();
      setSelectedActivityId("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create assignment.");
    } finally { setSaving(false); }
  }

  async function removeAssignmentItem(id: string) {
    if (!window.confirm("Delete this assignment and its submitted attempts?")) return;
    try { await deleteAssignment(id); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete assignment."); }
  }

  if (loading) return <main className="classes-workspace"><div className="classes-empty">Opening class…</div></main>;
  if (!detail) return <main className="not-found"><span><AppIcon name="exclamation-triangle" /></span><h1>Class unavailable</h1><p>{error}</p><Link className="button button-primary" href="/classes">Back to classes</Link></main>;

  return (
    <main className="classes-workspace class-detail-workspace">
      <div className="class-detail-back"><Link href="/classes"><AppIcon name="arrow-left" /> All classes</Link></div>
      <section className="class-detail-hero">
        <div>
          <span className="eyebrow">{detail.classroom.schoolYear} · Class workspace</span>
          <h1>{detail.classroom.name}</h1>
          <p>{activeMembers.length} students · {detail.assignments.length} assignments</p>
        </div>
        <div className="class-key-panel">
          <small>CLASS KEY</small><strong>{detail.classroom.joinCode}</strong>
          <span>{detail.classroom.joinEnabled ? "Students can join now" : "Joining is closed"}</span>
          <div><button className="button button-primary button-small" onClick={() => void copyJoin()}><AppIcon name="link-45deg" /> Copy join link</button><button className="button button-soft button-small" disabled={saving} onClick={() => void toggleJoining()}>{detail.classroom.joinEnabled ? "Close joining" : "Open joining"}</button></div>
          {shareMessage && <em>{shareMessage}</em>}
        </div>
      </section>
      {error && <div className="alert-error">{error}</div>}

      <section className="class-detail-grid">
        <div className="class-main-column">
          <div className="class-section-heading"><div><span className="eyebrow">Assignments</span><h2>Homework & practice</h2><p>Assign one game mode or let students choose how they want to practise.</p></div><button className="button button-primary" onClick={() => setShowAssignment((value) => !value)}><AppIcon name="plus-lg" /> Assign activity</button></div>

          {showAssignment && (
            <form className="assignment-form" onSubmit={addAssignment}>
              <div className="assignment-form-grid">
                <label className="wide"><span>Activity</span><select name="activity" required value={selectedActivityId || selectedActivity?.id || ""} onChange={(event) => setSelectedActivityId(event.target.value)}>{detail.activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label>
                <label className="wide"><span>Assignment title</span><input name="title" placeholder={selectedActivity?.title ?? "Practice assignment"} /></label>
                <label><span>Game mode</span><select name="gameType"><option value="">Student chooses</option>{GAME_MODE_ORDER.filter((game) => selectedActivity?.enabledGames.includes(game)).map((game) => <option key={game} value={game}>{GAME_MODE_CATALOG[game].name}</option>)}</select></label>
                <label><span>Due date</span><input name="dueAt" type="datetime-local" /></label>
                <label><span>Attempts</span><input name="attempts" type="number" min="1" max="20" placeholder="Unlimited" /></label>
                <label className="wide"><span>Instructions</span><textarea name="instructions" maxLength={1000} placeholder="Complete the activity before our next class." /></label>
              </div>
              <div className="assignment-form-actions"><button type="button" className="button button-soft" onClick={() => setShowAssignment(false)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? "Assigning…" : "Assign to class"}</button></div>
            </form>
          )}

          <div className="assignment-list">
            {detail.assignments.map((assignment) => {
              const attempts = assignment.attempts ?? [];
              const completedIds = new Set(attempts.map((attempt) => attempt.memberId));
              const average = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length) : 0;
              const due = assignment.dueAt ? new Date(assignment.dueAt) : null;
              return (
                <article className="assignment-card" key={assignment.id}>
                  <div className="assignment-card-icon"><AppIcon name={assignment.gameType ? GAME_MODE_CATALOG[assignment.gameType].icon : "collection-play"} /></div>
                  <div className="assignment-card-copy"><small>{assignment.activityTitle ?? "Activity"}</small><h3>{assignment.title}</h3><p>{assignment.instructions || (assignment.gameType ? `${GAME_MODE_CATALOG[assignment.gameType].name} assigned` : "Students can choose any enabled game mode.")}</p><div className="assignment-meta"><span><AppIcon name="calendar3" /> {due ? due.toLocaleDateString() : "No due date"}</span><span><AppIcon name="arrow-repeat" /> {assignment.attemptsLimit ? `${assignment.attemptsLimit} attempts` : "Unlimited attempts"}</span></div></div>
                  <div className="assignment-progress"><strong>{completedIds.size}/{activeMembers.length || 0}</strong><span>completed</span><b>{attempts.length ? `${average} avg pts` : "No scores yet"}</b></div>
                  <div className="assignment-actions"><Link className="button button-soft button-small" href={`/assignment/${assignment.id}`}>Preview</Link><button className="text-danger" onClick={() => void removeAssignmentItem(assignment.id)}>Delete</button></div>
                </article>
              );
            })}
            {!detail.assignments.length && <div className="classes-empty compact"><span><AppIcon name="clipboard2-plus" /></span><h3>No homework yet.</h3><p>Assign any activity from your Library to start tracking student practice.</p></div>}
          </div>
        </div>

        <aside className="class-student-column">
          <div className="class-section-heading compact"><div><span className="eyebrow">Students</span><h2>{activeMembers.length} enrolled</h2></div></div>
          <div className="class-member-list">
            {activeMembers.map((member) => {
              const completed = new Set(detail.assignments.flatMap((assignment) => (assignment.attempts ?? []).filter((attempt) => attempt.memberId === member.id).map((attempt) => attempt.assignmentId))).size;
              return <div className="class-member-row" key={member.id}><span>{member.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{completed}/{detail.assignments.length} assignments completed</small></div><button aria-label={`Remove ${member.displayName}`} onClick={() => void removeMember(member.id, member.displayName)}><AppIcon name="x-lg" /></button></div>;
            })}
            {!activeMembers.length && <div className="class-members-empty"><AppIcon name="person-plus" /><p>Share the join link. Student names will appear here.</p></div>}
          </div>
        </aside>
      </section>
    </main>
  );
}

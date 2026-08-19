"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { GAME_MODE_CATALOG } from "@/lib/game-catalog";
import { loadStudentClass, type AssignmentRecord, type ClassMemberRecord } from "@/lib/repositories/classroom-repository";

type StudentClassData = {
  member: ClassMemberRecord;
  classroom: { id: string; name: string; schoolYear: string };
  assignments: AssignmentRecord[];
};

export function StudentClassClient({ classroomId }: { classroomId: string }) {
  const [data, setData] = useState<StudentClassData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    void loadStudentClass(classroomId)
      .then((result) => { if (active) setData(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load this class."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [classroomId]);

  const dueAssignments = useMemo(() => data?.assignments.slice().sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return b.createdAt.localeCompare(a.createdAt);
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.localeCompare(b.dueAt);
  }) ?? [], [data]);

  if (loading) return <main className="student-class-screen"><div className="student-class-empty">Opening class…</div></main>;
  if (!data) return <main className="student-class-screen"><section className="student-class-join-card"><span className="student-class-join-icon"><AppIcon name="exclamation-triangle" /></span><h1>Class unavailable</h1><p>{error}</p><Link className="button button-primary" href="/student">My classes</Link></section></main>;

  return (
    <main className="student-class-screen student-home-screen">
      <section className="student-home-shell">
        <header className="student-home-header"><Link href="/student" className="student-brand"><b>C</b><span>ClassPlay</span></Link><Link className="button button-soft button-small" href="/class/join"><AppIcon name="plus-lg" /> Join another class</Link></header>
        <section className="student-class-hero"><div><span className="eyebrow">{data.classroom.schoolYear} · My class</span><h1>{data.classroom.name}</h1><p>Hi, {data.member.displayName}. Here’s what your teacher has assigned.</p></div><span className="student-class-avatar">{data.member.displayName.slice(0, 1).toUpperCase()}</span></section>
        {error && <div className="student-error">{error}</div>}
        <section className="student-assignment-section"><div className="student-section-heading"><div><span className="eyebrow">Homework</span><h2>{dueAssignments.length} assignments</h2></div></div>
          <div className="student-assignment-list">
            {dueAssignments.map((assignment) => {
              const ownAttempts = (assignment.attempts ?? []).filter((attempt) => attempt.memberId === data.member.id);
              const best = ownAttempts.length ? Math.max(...ownAttempts.map((attempt) => attempt.score)) : null;
              const due = assignment.dueAt ? new Date(assignment.dueAt) : null;
              const overdue = Boolean(due && due.getTime() < loadedAt);
              return <article className="student-assignment-card" key={assignment.id}>
                <span className={`student-assignment-icon ${assignment.gameType ? GAME_MODE_CATALOG[assignment.gameType].colorClass : ""}`}><AppIcon name={assignment.gameType ? GAME_MODE_CATALOG[assignment.gameType].icon : "collection-play"} /></span>
                <div className="student-assignment-copy"><small>{assignment.activityTopic || assignment.activityTitle || "ClassPlay activity"}</small><h3>{assignment.title}</h3><p>{assignment.instructions || (assignment.gameType ? `Complete ${GAME_MODE_CATALOG[assignment.gameType].name}.` : "Choose one of the available game modes.")}</p><div><span className={overdue ? "overdue" : ""}><AppIcon name="calendar3" /> {due ? `Due ${due.toLocaleDateString()}` : "No due date"}</span><span><AppIcon name="arrow-repeat" /> {assignment.attemptsLimit ? `${ownAttempts.length}/${assignment.attemptsLimit} attempts used` : `${ownAttempts.length} attempts`}</span>{best != null && <span><AppIcon name="trophy" /> Best {best} pts</span>}</div></div>
                <Link className="button button-primary" href={`/assignment/${assignment.id}`}>{ownAttempts.length ? "Play again" : "Start"} <AppIcon name="arrow-right" /></Link>
              </article>;
            })}
            {!dueAssignments.length && <div className="student-class-empty compact"><span><AppIcon name="check2-circle" /></span><h3>You’re all caught up.</h3><p>No assignments have been published for this class yet.</p></div>}
          </div>
        </section>
      </section>
    </main>
  );
}

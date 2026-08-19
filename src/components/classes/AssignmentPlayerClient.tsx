"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { GameStage } from "@/components/games/GameStage";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { GAME_MODE_CATALOG } from "@/lib/game-catalog";
import { submitSecureAssignmentAttempt } from "@/lib/repositories/assignment-attempt-repository";
import { loadStudentAssignment, type StudentAssignmentDetail } from "@/lib/repositories/classroom-repository";
import type { GameType } from "@/lib/types";

export function AssignmentPlayerClient({ assignmentId }: { assignmentId: string }) {
  const [detail, setDetail] = useState<StudentAssignmentDetail | null>(null);
  const [mode, setMode] = useState<GameType | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [completion, setCompletion] = useState<{ game: GameType; score: number; correct: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void loadStudentAssignment(assignmentId)
      .then((result) => { if (active) { setDetail(result); setMode(result.assignment.gameType); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not open this assignment."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assignmentId]);

  const attemptsUsed = detail?.attempts.length ?? 0;
  const attemptsLeft = useMemo(() => {
    if (!detail?.assignment.attemptsLimit) return null;
    return Math.max(0, detail.assignment.attemptsLimit - attemptsUsed);
  }, [detail, attemptsUsed]);

  async function complete(game: GameType, score: number, correct: number, total: number) {
    if (!detail) return;
    const result = { game, score, correct, total };
    setCompletion(result); setSaving(true); setSaved(false); setError("");
    try {
      const attempt = await submitSecureAssignmentAttempt({ assignment: detail.assignment, member: detail.member, game, score, correct, total });
      setDetail({ ...detail, attempts: [attempt, ...detail.attempts] });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your result could not be saved.");
    } finally { setSaving(false); }
  }

  function replay() {
    setCompletion(null); setSaved(false); setRunKey((value) => value + 1);
  }

  if (loading) return <main className="student-class-screen"><div className="student-class-empty">Opening assignment…</div></main>;
  if (!detail) return <main className="student-class-screen"><section className="student-class-join-card"><span className="student-class-join-icon"><AppIcon name="exclamation-triangle" /></span><h1>Assignment unavailable</h1><p>{error}</p><Link className="button button-primary" href="/student">My classes</Link></section></main>;

  const availableModes = detail.assignment.gameType ? [detail.assignment.gameType] : detail.activity.enabledGames;
  const limitReached = detail.assignment.attemptsLimit != null && attemptsUsed >= detail.assignment.attemptsLimit && !completion;

  if (!mode) {
    return <main className="mode-screen assignment-mode-screen"><header className="mode-header"><Link className="play-brand" href={`/student/classes/${detail.assignment.classroomId}`}><b>C</b><span>ClassPlay</span></Link><div className="mode-header-actions"><SettingsPanel compact /><Link className="button button-soft button-small" href={`/student/classes/${detail.assignment.classroomId}`}><AppIcon name="arrow-left" /> Class</Link></div></header><section className="mode-hero assignment-hero"><span className="eyebrow">Homework</span><h1>{detail.assignment.title}</h1><p>{detail.assignment.instructions || detail.activity.description}</p><div className="mode-meta"><span>{detail.activity.topic}</span><span>{attemptsLeft == null ? "Unlimited attempts" : `${attemptsLeft} attempts left`}</span></div></section><section className="mode-picker"><div className="mode-picker-heading"><div><small>CHOOSE A MODE</small><h2>How do you want to complete it?</h2></div></div>{limitReached ? <div className="assignment-limit-card"><AppIcon name="lock-fill" /><h3>Attempts complete</h3><p>Your teacher limited this assignment to {detail.assignment.attemptsLimit} attempts.</p></div> : <div className="mode-grid">{availableModes.map((game) => { const info = GAME_MODE_CATALOG[game]; return <button key={game} className={`mode-card ${info.colorClass}`} onClick={() => setMode(game)}><span className="mode-icon"><AppIcon name={info.icon} /></span><span><strong>{info.name}</strong><small>{info.pickerDescription}</small></span><i><AppIcon name="arrow-right" /></i></button>; })}</div>}</section></main>;
  }

  return (
    <main className={`play-screen ${mode === "space-blaster" || mode === "word-maze" ? "arcade-play-screen" : ""} assignment-play-screen`}>
      <header className="play-header"><button className="play-brand" onClick={() => { if (!detail.assignment.gameType) setMode(null); }}><b>C</b><span>ClassPlay</span></button><div className="play-title"><small>Homework · {GAME_MODE_CATALOG[mode].name}</small><strong>{detail.assignment.title}</strong></div><div className="play-header-actions"><span className="assignment-attempt-chip"><AppIcon name="arrow-repeat" /> {attemptsLeft == null ? `${attemptsUsed} attempts` : `${attemptsLeft} left`}</span><SettingsPanel compact /><Link className="button button-soft button-small" href={`/student/classes/${detail.assignment.classroomId}`}>Class</Link></div></header>
      <section className="play-canvas"><GameStage mode={mode} activity={detail.activity} runKey={runKey} onComplete={(score, correct, total) => void complete(mode, score, correct, total)} /></section>
      {completion && <section className="assignment-complete-overlay"><div className="assignment-complete-card"><span className="assignment-complete-icon"><AppIcon name={saved ? "check2-circle" : "cloud-arrow-up"} /></span><span className="eyebrow">Assignment complete</span><h2>{completion.score.toLocaleString()} points</h2><p>{completion.correct}/{completion.total} correct{completion.total ? ` · ${Math.round((completion.correct / completion.total) * 100)}% accuracy` : ""}</p>{saving && <div className="assignment-save-state">Saving your result…</div>}{saved && <div className="assignment-save-state success"><AppIcon name="cloud-check" /> Result saved to your class.</div>}{error && <div className="student-error">{error}</div>}<div className="assignment-complete-actions">{(attemptsLeft == null || attemptsLeft > 0) && <button className="button button-primary" onClick={replay}>Play again</button>}<Link className="button button-soft" href={`/student/classes/${detail.assignment.classroomId}`}>Back to class</Link>{!detail.assignment.gameType && (attemptsLeft == null || attemptsLeft > 0) && <button className="button button-soft" onClick={() => { setCompletion(null); setMode(null); }}>Other game</button>}</div></div></section>}
    </main>
  );
}

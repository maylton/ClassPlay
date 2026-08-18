"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { deleteActivity, duplicateActivity, getActivities, getGameResults, getProfile, saveProfile } from "@/lib/storage";
import type { ActivitySet, TeacherProfile } from "@/lib/types";

const gameLabels: Record<string, string> = { flashcards: "Flashcards", memory: "Memory", matching: "Matching", "sentence-builder": "Builder", "gap-fill": "Gap fill", quiz: "Quiz" };

export function DashboardClient() {
  const [activities, setActivities] = useState<ActivitySet[]>([]);
  const [profile, setProfile] = useState<TeacherProfile>({ name: "Teacher" });
  const [editingName, setEditingName] = useState(false);
  const [resultsCount, setResultsCount] = useState(0);
  const refresh = () => { setActivities(getActivities()); setResultsCount(getGameResults().length); };
  useEffect(() => { refresh(); setProfile(getProfile()); }, []);
  const totalGames = useMemo(() => activities.reduce((sum, activity) => sum + activity.enabledGames.length, 0), [activities]);
  function updateName(name: string) { const next = { ...profile, name: name.trim() || "Teacher" }; setProfile(next); saveProfile(next); setEditingName(false); }
  return <main className="dashboard-main">
    <section className="welcome-row"><div><span className="eyebrow">Teacher workspace</span><div className="welcome-title-row"><h1>Good to see you, {profile.name}.</h1><button className="icon-text-button" onClick={() => setEditingName((value) => !value)}>Edit name</button></div><p>Pick up an activity or create a new one for your next class.</p>{editingName && <form className="inline-profile" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); updateName(String(form.get("name") ?? "")); }}><input name="name" defaultValue={profile.name} autoFocus aria-label="Teacher name" /><button className="button button-primary button-small">Save</button></form>}</div><Link className="button button-primary button-large" href="/create">+ New activity</Link></section>
    <section className="stats-grid"><div className="stat-card"><strong>{activities.length}</strong><span>Activity sets</span></div><div className="stat-card"><strong>{totalGames}</strong><span>Playable modes</span></div><div className="stat-card"><strong>{resultsCount}</strong><span>Completed games</span></div></section>
    <section className="library-section"><div className="section-toolbar"><div><span className="eyebrow">My library</span><h2>Recent activities</h2></div><span className="storage-pill">● Local-first MVP</span></div><div className="activity-grid">{activities.map((activity, index) => <article className={`activity-card activity-accent-${index % 4}`} key={activity.id}><div className="activity-card-top"><div className="activity-icon">{activity.kind === "vocabulary" ? "Aa" : activity.kind === "grammar" ? "✦" : "A+"}</div><span className="activity-level">{activity.level}</span></div><div><span className="activity-meta">{activity.grade} · {activity.topic}</span><h3>{activity.title}</h3><p>{activity.description}</p></div><div className="game-tags">{activity.enabledGames.slice(0, 4).map((game) => <span key={game}>{gameLabels[game]}</span>)}{activity.enabledGames.length > 4 && <span>+{activity.enabledGames.length - 4}</span>}</div><div className="activity-actions"><Link className="button button-dark" href={`/play/${activity.id}`}>▶ Play</Link><button className="button button-soft" onClick={() => { duplicateActivity(activity.id); refresh(); }}>Duplicate</button>{activity.id !== "daily-routine-present-simple" && <button className="text-danger" onClick={() => { if (window.confirm("Delete this activity set? This cannot be undone.")) { deleteActivity(activity.id); refresh(); } }}>Delete</button>}</div></article>)}<Link className="new-activity-card" href="/create"><span>+</span><strong>Create an activity</strong><small>Build once. Play it six ways.</small></Link></div></section>
  </main>;
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getGameResults, getProfile, saveProfile } from "@/lib/storage";
import {
  cloneActivity,
  getMigratableLocalActivities,
  listActivities,
  migrateLocalActivitiesToCloud,
  removeActivity,
} from "@/lib/repositories/activity-repository";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ActivitySet, TeacherProfile } from "@/lib/types";
import { AppIcon } from "./AppIcon";

const gameLabels: Record<string, string> = {
  flashcards: "Flashcards",
  memory: "Memory",
  matching: "Matching",
  "sentence-builder": "Builder",
  "gap-fill": "Gap fill",
  quiz: "Quiz",
};

const activityKindIcons = {
  vocabulary: "type",
  grammar: "braces",
  mixed: "layers",
} as const;

export function DashboardClient() {
  const [activities, setActivities] = useState<ActivitySet[]>([]);
  const [profile, setProfile] = useState<TeacherProfile>({ name: "Teacher" });
  const [editingName, setEditingName] = useState(false);
  const [resultsCount, setResultsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cloud, setCloud] = useState(false);
  const [localImportCount, setLocalImportCount] = useState(0);
  const [importMessage, setImportMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      setError("");
      setActivities(await listActivities());
      setResultsCount(getGameResults().length);
      setLocalImportCount(getMigratableLocalActivities().length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load activities.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const supabase = getBrowserSupabaseClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCloud(true);
          const { data } = await supabase.from("profiles").select("display_name, school_name, avatar_url").eq("id", user.id).maybeSingle();
          setProfile({ name: data?.display_name || user.user_metadata?.display_name || "Teacher", school: data?.school_name ?? undefined, avatarUrl: data?.avatar_url ?? undefined, email: user.email, id: user.id });
        } else setProfile(getProfile());
      } else setProfile(getProfile());
      await refresh();
    })();
  }, []);

  const totalGames = useMemo(() => activities.reduce((sum, activity) => sum + activity.enabledGames.length, 0), [activities]);

  async function handleDuplicate(id: string) {
    try { await cloneActivity(id); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not duplicate activity."); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this activity set? This cannot be undone.")) return;
    try { await removeActivity(id); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete activity."); }
  }

  async function updateName(name: string) {
    const next = { ...profile, name: name.trim() || "Teacher" };
    setProfile(next);
    if (cloud) {
      const supabase = getBrowserSupabaseClient();
      if (supabase && profile.id) await supabase.from("profiles").update({ display_name: next.name }).eq("id", profile.id);
    } else saveProfile(next);
    setEditingName(false);
  }

  async function importLocal() {
    setImportMessage("Importing…");
    try {
      const report = await migrateLocalActivitiesToCloud();
      setImportMessage(`${report.imported} imported · ${report.skipped} already synced${report.failed ? ` · ${report.failed} failed` : ""}`);
      await refresh();
    } catch (cause) {
      setImportMessage(cause instanceof Error ? cause.message : "Import failed.");
    }
  }

  return (
    <main className="dashboard-main">
      <section className="welcome-row">
        <div>
          <span className="eyebrow">Teacher workspace</span>
          <div className="welcome-title-row">
            <h1>Good to see you, {profile.name}.</h1>
            <button className="icon-text-button" onClick={() => setEditingName((value) => !value)}>Edit name</button>
          </div>
          <p>{cloud ? "Your ClassPlay library is synced to your teacher account." : "Pick up an activity or create a new one for your next class."}</p>
          {editingName && (
            <form className="inline-profile" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void updateName(String(form.get("name") ?? "")); }}>
              <input name="name" defaultValue={profile.name} autoFocus aria-label="Teacher name" />
              <button className="button button-primary button-small">Save</button>
            </form>
          )}
        </div>
        <div className="welcome-actions"><Link className="button button-soft button-large" href="/join">Join a room</Link><Link className="button button-primary button-large" href="/create"><AppIcon name="plus-lg" /> New activity</Link></div>
      </section>

      {cloud && localImportCount > 0 && (
        <section className="migration-banner">
          <div><span><AppIcon name="cloud-arrow-up" /></span><div><strong>Bring your MVP activities with you</strong><p>{localImportCount} local {localImportCount === 1 ? "activity is" : "activities are"} ready to move into your cloud library. Duplicates are skipped safely.</p>{importMessage && <small>{importMessage}</small>}</div></div>
          <button className="button button-primary" onClick={() => void importLocal()}>Import local activities</button>
        </section>
      )}
      {error && <div className="alert-error">{error}</div>}

      <section className="stats-grid" aria-label="ClassPlay stats">
        <div className="stat-card"><strong>{loading ? "…" : activities.length}</strong><span>Activity sets</span></div>
        <div className="stat-card"><strong>{loading ? "…" : totalGames}</strong><span>Playable modes</span></div>
        <div className="stat-card"><strong>{resultsCount}</strong><span>Local rounds</span></div>
      </section>

      <section className="library-section">
        <div className="section-toolbar">
          <div><span className="eyebrow">My library</span><h2>Recent activities</h2></div>
          <span className={`storage-pill ${cloud ? "cloud" : ""}`}>● {cloud ? "Cloud sync on" : isSupabaseConfigured ? "Local session" : "Local-first mode"}</span>
        </div>
        <div className="activity-grid">
          {activities.map((activity, index) => (
            <article className={`activity-card activity-accent-${index % 4}`} key={activity.id}>
              <div className="activity-card-top">
                <div className="activity-icon"><AppIcon name={activityKindIcons[activity.kind]} /></div>
                <span className="activity-level">{activity.level}</span>
              </div>
              <div>
                <span className="activity-meta">{activity.grade} · {activity.topic}</span>
                <h3>{activity.title}</h3>
                <p>{activity.description}</p>
              </div>
              <div className="game-tags">
                {activity.enabledGames.slice(0, 4).map((game) => <span key={game}>{gameLabels[game]}</span>)}
                {activity.enabledGames.length > 4 && <span>+{activity.enabledGames.length - 4}</span>}
              </div>
              <div className="activity-actions">
                <Link className="button button-dark" href={`/play/${activity.id}`}><AppIcon name="play-fill" /> Play</Link>
                <Link className="button button-soft" href={`/edit/${activity.id}`}>Edit</Link>
                <button className="button button-soft" onClick={() => void handleDuplicate(activity.id)}>Duplicate</button>
                {activity.id !== "daily-routine-present-simple" && <button className="text-danger" onClick={() => void handleDelete(activity.id)}>Delete</button>}
              </div>
            </article>
          ))}
          <Link className="new-activity-card" href="/create">
            <span><AppIcon name="plus-lg" /></span>
            <strong>Create an activity</strong>
            <small>Build once. Play it six ways.</small>
          </Link>
        </div>
      </section>
    </main>
  );
}

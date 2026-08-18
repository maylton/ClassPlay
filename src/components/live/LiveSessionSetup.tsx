"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { loadActivity, ensureCloudActivity } from "@/lib/repositories/activity-repository";
import { createLiveSession } from "@/lib/live/room-service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ActivitySet, SessionMode } from "@/lib/types";

export function LiveSessionSetup({ activityId }: { activityId: string }) {
  const router = useRouter();
  const { settings } = useClassroomSettings();
  const [activity, setActivity] = useState<ActivitySet | null>(null);
  const [mode, setMode] = useState<SessionMode>("individual");
  const [teamCount, setTeamCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadActivity(activityId).then((loaded) => loaded ? setActivity(loaded) : setError("Activity not found."));
  }, [activityId]);

  if (!isSupabaseConfigured) {
    return (
      <main className="cloud-setup-screen">
        <section className="cloud-setup-card">
          <span className="cloud-setup-icon"><AppIcon name="cloud" /></span>
          <span className="eyebrow">Connected Classroom</span>
          <h1>Cloud setup is the only missing piece.</h1>
          <p>The v0.2 live-room code is installed, but multiplayer needs a Supabase project. Your local ClassPlay games remain fully usable meanwhile.</p>
          <ol><li>Create a Supabase project.</li><li>Run <code>supabase/migrations/0001_connected_classroom.sql</code>.</li><li>Copy <code>.env.example</code> to <code>.env.local</code> and add the project URL + publishable key.</li><li>Restart <code>npm run dev</code>.</li></ol>
          <Link href={`/play/${activityId}`} className="button button-primary"><AppIcon name="arrow-left" /> Back to local games</Link>
        </section>
      </main>
    );
  }

  if (!activity && !error) return <main className="loading-screen">Preparing live room…</main>;
  if (error || !activity) return <main className="not-found"><span><AppIcon name="exclamation-triangle" /></span><h1>Could not prepare room</h1><p>{error}</p><Link href="/dashboard" className="button button-primary">Back to library</Link></main>;

  async function create() {
    setBusy(true); setError("");
    try {
      const cloudActivity = await ensureCloudActivity(activity!);
      const session = await createLiveSession(cloudActivity, { mode, teamCount, settings });
      router.push(`/host/${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create live room.");
      setBusy(false);
    }
  }

  return (
    <main className="live-setup-main">
      <section className="live-setup-heading"><span className="eyebrow">Connected Classroom</span><h1>Turn this activity into a live class.</h1><p>Students join from any phone or computer using a short code. No student account needed.</p></section>
      {error && <div className="alert-error">{error}</div>}
      <section className="live-setup-grid">
        <article className="live-activity-preview"><span>{activity.level} · {activity.grade}</span><h2>{activity.title}</h2><p>{activity.description}</p><div><b>{activity.items.length}</b><small>questions</small></div></article>
        <article className="live-options-card">
          <div className="panel-heading"><span>1</span><div><h2>Choose the room style</h2><p>You can change leaderboard and timer settings during the game.</p></div></div>
          <div className="mode-segmented">
            <button className={mode === "individual" ? "active" : ""} onClick={() => setMode("individual")}><b><AppIcon name="person" /> Individual</b><small>Each student earns their own score</small></button>
            <button className={mode === "team" ? "active" : ""} onClick={() => setMode("team")}><b><AppIcon name="people" /> Teams</b><small>Students are balanced automatically</small></button>
          </div>
          {mode === "team" && <label className="field team-count-field"><span>Number of teams</span><select value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))}>{[2,3,4,5,6,7,8].map((count) => <option key={count} value={count}>{count} teams</option>)}</select></label>}
          <div className="live-setting-summary"><span><AppIcon name={settings.timerEnabled ? "clock" : "infinity"} /> {settings.timerEnabled ? `${settings.timerSeconds}s timer` : "No timer"}</span><span><AppIcon name={settings.leaderboardEnabled ? "trophy" : "eye-slash"} /> {settings.leaderboardEnabled ? "Leaderboard on" : "Leaderboard off"}</span><span><AppIcon name={settings.readAloud ? "volume-up" : "volume-mute"} /> {settings.readAloud ? "Read aloud" : "Manual audio"}</span></div>
          <button className="button button-primary button-large start-live-button" disabled={busy} onClick={() => void create()}>{busy ? "Creating room…" : <>Create live room <AppIcon name="arrow-right" /></>}</button>
        </article>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { analyzeGameModes } from "@/lib/activity-intelligence";
import { loadActivity, ensureCloudActivity } from "@/lib/repositories/activity-repository";
import { createLiveSession } from "@/lib/live/room-service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ActivitySet, LiveGameMode, SessionMode } from "@/lib/types";

const LIVE_MODE_OPTIONS: { mode: LiveGameMode; label: string; description: string; icon: "pencil-square" | "trophy" | "rocket-takeoff" }[] = [
  { mode: "gap-fill", label: "Fill the Gaps", description: "Students choose the language that completes each sentence.", icon: "pencil-square" },
  { mode: "quiz", label: "Quiz", description: "Students answer multiple-choice questions on their own devices.", icon: "trophy" },
  { mode: "space-blaster", label: "Space Blaster", description: "Students aim at the correct answer and fire before the round ends.", icon: "rocket-takeoff" },
];

export function LiveSessionSetup({ activityId }: { activityId: string }) {
  const router = useRouter();
  const { settings } = useClassroomSettings();
  const [activity, setActivity] = useState<ActivitySet | null>(null);
  const [mode, setMode] = useState<SessionMode>("individual");
  const [liveGameMode, setLiveGameMode] = useState<LiveGameMode>("quiz");
  const [teamCount, setTeamCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadActivity(activityId).then((loaded) => loaded ? setActivity(loaded) : setError("Activity not found."));
  }, [activityId]);

  const liveCompatibility = useMemo(() => {
    if (!activity) return new Map<LiveGameMode, { available: boolean; playableItems: number; reason: string }>();
    const analysis = analyzeGameModes(activity.items, activity.enabledGames);
    return new Map(
      LIVE_MODE_OPTIONS.map(({ mode: gameMode }) => {
        const entry = analysis.find((candidate) => candidate.mode === gameMode);
        const available = Boolean(entry && !["unavailable", "needs-content"].includes(entry.status));
        return [gameMode, { available, playableItems: entry?.playableItems ?? 0, reason: entry?.reason ?? "This mode is not available for this content." }] as const;
      }),
    );
  }, [activity]);

  useEffect(() => {
    if (!activity) return;
    const current = liveCompatibility.get(liveGameMode);
    if (current?.available) return;
    const firstAvailable = LIVE_MODE_OPTIONS.find(({ mode: gameMode }) => liveCompatibility.get(gameMode)?.available);
    if (firstAvailable) setLiveGameMode(firstAvailable.mode);
  }, [activity, liveCompatibility, liveGameMode]);

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

  const selectedCompatibility = liveCompatibility.get(liveGameMode);
  const hasLiveMode = LIVE_MODE_OPTIONS.some(({ mode: gameMode }) => liveCompatibility.get(gameMode)?.available);

  async function create() {
    if (!selectedCompatibility?.available) return;
    setBusy(true); setError("");
    try {
      const cloudActivity = await ensureCloudActivity(activity!);
      const session = await createLiveSession(cloudActivity, {
        mode,
        teamCount,
        settings: { ...settings, liveGameMode },
      });
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
        <article className="live-activity-preview"><span>{activity.level} · {activity.grade}</span><h2>{activity.title}</h2><p>{activity.description}</p><div><b>{selectedCompatibility?.playableItems ?? activity.items.length}</b><small>live questions</small></div></article>
        <article className="live-options-card">
          <div className="panel-heading"><span>1</span><div><h2>Choose the live game</h2><p>Only modes that fit this deck can be selected.</p></div></div>
          <div className="mode-segmented" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {LIVE_MODE_OPTIONS.map((option) => {
              const compatibility = liveCompatibility.get(option.mode);
              const available = compatibility?.available ?? false;
              return (
                <button
                  key={option.mode}
                  className={liveGameMode === option.mode ? "active" : ""}
                  onClick={() => available && setLiveGameMode(option.mode)}
                  disabled={!available}
                  title={available ? `${compatibility?.playableItems ?? 0} playable questions` : compatibility?.reason}
                >
                  <b><AppIcon name={option.icon} /> {option.label}</b>
                  <small>{available ? option.description : "Not compatible with this deck"}</small>
                </button>
              );
            })}
          </div>

          <div className="panel-heading" style={{ marginTop: "1.6rem" }}><span>2</span><div><h2>Choose the room style</h2><p>You can change leaderboard and timer settings during the game.</p></div></div>
          <div className="mode-segmented">
            <button className={mode === "individual" ? "active" : ""} onClick={() => setMode("individual")}><b><AppIcon name="person" /> Individual</b><small>Each student earns their own score</small></button>
            <button className={mode === "team" ? "active" : ""} onClick={() => setMode("team")}><b><AppIcon name="people" /> Teams</b><small>Students are balanced automatically</small></button>
          </div>
          {mode === "team" && <label className="field team-count-field"><span>Number of teams</span><select value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))}>{[2,3,4,5,6,7,8].map((count) => <option key={count} value={count}>{count} teams</option>)}</select></label>}
          <div className="live-setting-summary"><span><AppIcon name={settings.timerEnabled ? "clock" : "infinity"} /> {settings.timerEnabled ? `${settings.timerSeconds}s timer` : "No timer"}</span><span><AppIcon name={settings.leaderboardEnabled ? "trophy" : "eye-slash"} /> {settings.leaderboardEnabled ? "Leaderboard on" : "Leaderboard off"}</span><span><AppIcon name={settings.readAloud ? "volume-up" : "volume-mute"} /> {settings.readAloud ? "Read aloud" : "Manual audio"}</span></div>
          {!hasLiveMode && <div className="alert-error">This deck does not currently contain enough compatible content for Quiz, Fill the Gaps, or Space Blaster.</div>}
          <button className="button button-primary button-large start-live-button" disabled={busy || !hasLiveMode || !selectedCompatibility?.available} onClick={() => void create()}>{busy ? "Creating room…" : <>Create live room <AppIcon name="arrow-right" /></>}</button>
        </article>
      </section>
    </main>
  );
}

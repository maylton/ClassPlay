"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { analyzeGameModes } from "@/lib/activity-intelligence";
import { LIVE_MODE_CATALOG, LIVE_MODE_ORDER } from "@/lib/live/live-catalog";
import { liveModeQuestionCount } from "@/lib/live/live-engine";
import { loadActivity, ensureCloudActivity } from "@/lib/repositories/activity-repository";
import { createLiveSession } from "@/lib/live/room-service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type {
  ActivitySet,
  DynamiteTimerSeconds,
  LiveGameMode,
  SessionMode,
  WildcardGridIntensity,
  WildcardGridQuestionSource,
  WildcardGridSize,
} from "@/lib/types";

const WILDCARD_GRID_SIZES: WildcardGridSize[] = [12, 16, 20];
const WILDCARD_SOURCE_OPTIONS: Array<{
  value: WildcardGridQuestionSource;
  label: string;
  description: string;
  icon: string;
}> = [
  { value: "smart", label: "Smart Mix", description: "ClassPlay picks the strongest question pool for this deck.", icon: "stars" },
  { value: "gap-fill", label: "Fill the Gaps", description: "Use only the deck's complete-the-sentence gap questions.", icon: "pencil-square" },
  { value: "quiz", label: "Quiz", description: "Use only prompts that are ready for the Quiz question engine.", icon: "question-circle" },
  { value: "prompt-answer", label: "Prompt ↔ Answer", description: "Use prompt-and-answer pairs — great for Matching, Flashcards and vocabulary.", icon: "shuffle" },
];

function wildcardSourceLabel(source: WildcardGridQuestionSource) {
  return WILDCARD_SOURCE_OPTIONS.find((option) => option.value === source)?.label ?? "Smart Mix";
}

export function LiveSessionSetup({ activityId, initialGameMode = "quiz" }: { activityId: string; initialGameMode?: LiveGameMode }) {
  const router = useRouter();
  const { settings } = useClassroomSettings();
  const [activity, setActivity] = useState<ActivitySet | null>(null);
  const [mode, setMode] = useState<SessionMode>("individual");
  const [liveGameMode, setLiveGameMode] = useState<LiveGameMode>(initialGameMode);
  const [dynamiteTimerSeconds, setDynamiteTimerSeconds] = useState<DynamiteTimerSeconds>(10);
  const [wildcardGridSize, setWildcardGridSize] = useState<WildcardGridSize>(12);
  const [wildcardGridIntensity, setWildcardGridIntensity] = useState<WildcardGridIntensity>("balanced");
  const [wildcardGridSource, setWildcardGridSource] = useState<WildcardGridQuestionSource>("smart");
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
      LIVE_MODE_ORDER.map((gameMode) => {
        if (gameMode === "dynamite") {
          const playableItems = liveModeQuestionCount(activity, "dynamite");
          return [gameMode, {
            available: playableItems >= 2,
            playableItems,
            reason: playableItems >= 2 ? "Ready for elimination play." : "Dynamite needs at least two Quiz or Fill the Gaps questions.",
          }] as const;
        }
        if (gameMode === "wildcard-grid") {
          const playableItems = liveModeQuestionCount(activity, "wildcard-grid", "smart");
          return [gameMode, {
            available: playableItems >= 12,
            playableItems,
            reason: playableItems >= 12 ? "Ready for team board play." : "Wildcard Grid needs at least 12 questions in one supported source.",
          }] as const;
        }
        const entry = analysis.find((candidate) => candidate.mode === gameMode);
        const available = Boolean(entry && !["unavailable", "needs-content"].includes(entry.status));
        return [gameMode, { available, playableItems: entry?.playableItems ?? 0, reason: entry?.reason ?? "This mode is not available for this content." }] as const;
      }),
    );
  }, [activity]);

  const wildcardSourceCounts = useMemo(() => new Map<WildcardGridQuestionSource, number>(
    WILDCARD_SOURCE_OPTIONS.map((option) => [option.value, activity ? liveModeQuestionCount(activity, "wildcard-grid", option.value) : 0]),
  ), [activity]);

  const selectedLiveGameMode = useMemo(() => {
    if (!activity || liveCompatibility.get(liveGameMode)?.available) return liveGameMode;
    return LIVE_MODE_ORDER.find((gameMode) => liveCompatibility.get(gameMode)?.available) ?? liveGameMode;
  }, [activity, liveCompatibility, liveGameMode]);

  if (!isSupabaseConfigured) {
    return (
      <main className="cloud-setup-screen">
        <section className="cloud-setup-card">
          <span className="cloud-setup-icon"><AppIcon name="cloud" /></span>
          <span className="eyebrow">Connected Classroom</span>
          <h1>Cloud setup is the only missing piece.</h1>
          <p>Live multiplayer needs a Supabase project. Your local ClassPlay games remain fully usable meanwhile.</p>
          <Link href={`/play/${activityId}`} className="button button-primary"><AppIcon name="arrow-left" /> Back to local games</Link>
        </section>
      </main>
    );
  }

  if (!activity && !error) return <main className="loading-screen">Preparing live room…</main>;
  if (error || !activity) return <main className="not-found"><span><AppIcon name="exclamation-triangle" /></span><h1>Could not prepare room</h1><p>{error}</p><Link href="/dashboard" className="button button-primary">Back to library</Link></main>;

  const selectedCompatibility = liveCompatibility.get(selectedLiveGameMode);
  const hasLiveMode = LIVE_MODE_ORDER.some((gameMode) => liveCompatibility.get(gameMode)?.available);
  const isDynamite = selectedLiveGameMode === "dynamite";
  const isWildcardGrid = selectedLiveGameMode === "wildcard-grid";
  const wildcardQuestionCount = wildcardSourceCounts.get(wildcardGridSource) ?? 0;
  const selectedWildcardSize = wildcardQuestionCount >= wildcardGridSize
    ? wildcardGridSize
    : WILDCARD_GRID_SIZES.filter((size) => wildcardQuestionCount >= size).at(-1) ?? 12;

  async function create() {
    if (!selectedCompatibility?.available) return;
    if (isWildcardGrid && wildcardQuestionCount < 12) return setError("Choose a Wildcard Grid question source with at least 12 playable questions.");
    setBusy(true); setError("");
    try {
      const cloudActivity = await ensureCloudActivity(activity!);
      const liveSettings = isDynamite
        ? {
            ...settings,
            liveGameMode: selectedLiveGameMode,
            timerEnabled: true,
            timerSeconds: dynamiteTimerSeconds,
            dynamiteTimerSeconds,
            dynamiteState: null,
            wildcardGridState: null,
            leaderboardEnabled: false,
          }
        : isWildcardGrid
          ? {
              ...settings,
              liveGameMode: selectedLiveGameMode,
              timerEnabled: false,
              leaderboardEnabled: false,
              dynamiteState: null,
              wildcardGridSize: selectedWildcardSize,
              wildcardGridIntensity,
              wildcardGridSource,
              wildcardGridState: null,
            }
          : { ...settings, liveGameMode: selectedLiveGameMode, dynamiteState: null, wildcardGridState: null };
      const session = await createLiveSession(cloudActivity, {
        mode: isDynamite ? "individual" : isWildcardGrid ? "team" : mode,
        teamCount: isWildcardGrid ? Math.min(4, Math.max(2, teamCount)) : teamCount,
        settings: liveSettings,
      });
      router.push(`/host/${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create live room.");
      setBusy(false);
    }
  }

  return (
    <main className="live-setup-main">
      <section className="live-setup-heading"><span className="eyebrow">Connected Classroom</span><h1>Turn this activity into a live class.</h1><p>{isWildcardGrid ? "Wildcard Grid works entirely from the projector. Student phones are optional companions for team and score updates." : "Students join from any phone or computer using a short code. No student account needed."}</p></section>
      {error && <div className="alert-error">{error}</div>}
      <section className="live-setup-grid">
        <article className="live-activity-preview"><span>{activity.level} · {activity.grade}</span><h2>{activity.title}</h2><p>{activity.description}</p><div><b>{isWildcardGrid ? wildcardQuestionCount : selectedCompatibility?.playableItems ?? activity.items.length}</b><small>{isDynamite || isWildcardGrid ? "question pool" : "live questions"}</small></div></article>
        <article className="live-options-card">
          <div className="panel-heading"><span>1</span><div><h2>Choose the live game</h2><p>Only modes that fit this deck can be selected.</p></div></div>
          <div className="mode-segmented live-mode-grid">
            {LIVE_MODE_ORDER.map((gameMode) => {
              const option = LIVE_MODE_CATALOG[gameMode];
              const compatibility = liveCompatibility.get(gameMode);
              const available = compatibility?.available ?? false;
              return (
                <button
                  key={gameMode}
                  className={selectedLiveGameMode === gameMode ? "active" : ""}
                  onClick={() => {
                    if (!available) return;
                    setLiveGameMode(gameMode);
                    if (gameMode === "dynamite") setMode("individual");
                    if (gameMode === "wildcard-grid") {
                      setMode("team");
                      setTeamCount((count) => Math.min(4, Math.max(2, count)));
                    }
                  }}
                  disabled={!available}
                  title={available ? `${compatibility?.playableItems ?? 0} playable questions` : compatibility?.reason}
                >
                  <b><AppIcon name={option.icon} /> {option.label}</b>
                  <small>{available ? option.description : "Not compatible with this deck"}</small>
                </button>
              );
            })}
          </div>

          {isDynamite ? (
            <>
              <div className="panel-heading" style={{ marginTop: "1.6rem" }}><span>2</span><div><h2>Choose the fuse</h2><p>Every correct answer passes the Dynamite and resets this countdown.</p></div></div>
              <div className="dynamite-timer-picker">
                {([10, 15, 20] as DynamiteTimerSeconds[]).map((seconds) => (
                  <button key={seconds} className={dynamiteTimerSeconds === seconds ? "active" : ""} onClick={() => setDynamiteTimerSeconds(seconds)}>
                    <b>{seconds}s</b><small>{seconds === 10 ? "Fast" : seconds === 15 ? "Balanced" : "Relaxed"}</small>
                  </button>
                ))}
              </div>
              <div className="dynamite-setup-note"><AppIcon name="people" /><div><b>Individual elimination</b><span>The player order is shuffled when you press Start. Everyone can see who is current and who comes next.</span></div></div>
            </>
          ) : isWildcardGrid ? (
            <>
              <div className="panel-heading" style={{ marginTop: "1.6rem" }}><span>2</span><div><h2>Choose the question source</h2><p>Decide exactly which kind of deck content will fill the numbered tiles.</p></div></div>
              <div className="wildcard-source-picker">
                {WILDCARD_SOURCE_OPTIONS.map((option) => {
                  const count = wildcardSourceCounts.get(option.value) ?? 0;
                  const available = count >= 12;
                  return (
                    <button key={option.value} disabled={!available} className={wildcardGridSource === option.value ? "active" : ""} onClick={() => available && setWildcardGridSource(option.value)}>
                      <span><AppIcon name={option.icon} /></span>
                      <div><b>{option.label}</b><small>{option.description}</small></div>
                      <em>{count} questions</em>
                    </button>
                  );
                })}
              </div>

              <div className="panel-heading" style={{ marginTop: "1.6rem" }}><span>3</span><div><h2>Build the board</h2><p>Every tile contains one question from <b>{wildcardSourceLabel(wildcardGridSource)}</b>. Some also hide a Wildcard.</p></div></div>
              <div className="dynamite-timer-picker wildcard-size-picker">
                {WILDCARD_GRID_SIZES.map((size) => {
                  const available = wildcardQuestionCount >= size;
                  return <button key={size} disabled={!available} className={selectedWildcardSize === size ? "active" : ""} onClick={() => available && setWildcardGridSize(size)}><b>{size}</b><small>{size === 12 ? "Quick" : size === 16 ? "Full" : "Long"} board</small></button>;
                })}
              </div>
              <div className="mode-segmented wildcard-intensity-picker">
                <button className={wildcardGridIntensity === "balanced" ? "active" : ""} onClick={() => setWildcardGridIntensity("balanced")}><b><AppIcon name="shield-check" /> Balanced</b><small>Surprises without score-destroying resets</small></button>
                <button className={wildcardGridIntensity === "chaos" ? "active" : ""} onClick={() => setWildcardGridIntensity("chaos")}><b><AppIcon name="lightning-charge" /> Chaos</b><small>Can include swap, blackout or a fresh start</small></button>
              </div>
              <label className="field team-count-field"><span>Number of teams</span><select value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))}>{[2,3,4].map((count) => <option key={count} value={count}>{count} teams</option>)}</select></label>
              <div className="dynamite-setup-note wildcard-setup-note"><AppIcon name="display" /><div><b>Projector-first — phones optional</b><span>Teams discuss and answer out loud. You control every tile, answer and Wildcard here; connected phones only mirror team, turn and score status.</span></div></div>
            </>
          ) : (
            <>
              <div className="panel-heading" style={{ marginTop: "1.6rem" }}><span>2</span><div><h2>Choose the room style</h2><p>You can change leaderboard and timer settings during the game.</p></div></div>
              <div className="mode-segmented">
                <button className={mode === "individual" ? "active" : ""} onClick={() => setMode("individual")}><b><AppIcon name="person" /> Individual</b><small>Each student earns their own score</small></button>
                <button className={mode === "team" ? "active" : ""} onClick={() => setMode("team")}><b><AppIcon name="people" /> Teams</b><small>Students are balanced automatically</small></button>
              </div>
              {mode === "team" && <label className="field team-count-field"><span>Number of teams</span><select value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))}>{[2,3,4,5,6,7,8].map((count) => <option key={count} value={count}>{count} teams</option>)}</select></label>}
            </>
          )}

          <div className="live-setting-summary">
            <span><AppIcon name="clock" /> {isDynamite ? `${dynamiteTimerSeconds}s fuse` : isWildcardGrid ? "Teacher-paced" : settings.timerEnabled ? `${settings.timerSeconds}s timer` : "No timer"}</span>
            <span><AppIcon name={isDynamite ? "person-check" : isWildcardGrid ? "grid-3x3-gap-fill" : settings.leaderboardEnabled ? "trophy" : "eye-slash"} /> {isDynamite ? "Last survivor wins" : isWildcardGrid ? `${selectedWildcardSize} tiles · ${teamCount} teams` : settings.leaderboardEnabled ? "Leaderboard on" : "Leaderboard off"}</span>
            <span><AppIcon name={isWildcardGrid ? "question-circle" : settings.readAloud ? "volume-up" : "volume-mute"} /> {isWildcardGrid ? wildcardSourceLabel(wildcardGridSource) : settings.readAloud ? "Read aloud" : "Manual audio"}</span>
            {isWildcardGrid && <span><AppIcon name={wildcardGridIntensity === "chaos" ? "lightning-charge" : "shield-check"} /> {wildcardGridIntensity === "chaos" ? "Chaos" : "Balanced"} Wildcards</span>}
          </div>
          {!hasLiveMode && <div className="alert-error">This deck does not currently contain enough compatible content for a live mode.</div>}
          <button className="button button-primary button-large start-live-button" disabled={busy || !hasLiveMode || !selectedCompatibility?.available || (isWildcardGrid && wildcardQuestionCount < 12)} onClick={() => void create()}>{busy ? "Creating room…" : <>Create live room <AppIcon name="arrow-right" /></>}</button>
        </article>
      </section>
    </main>
  );
}

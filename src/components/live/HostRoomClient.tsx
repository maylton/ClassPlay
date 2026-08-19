"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { loadActivity } from "@/lib/repositories/activity-repository";
import { resolveActivityImageUrl } from "@/lib/media";
import { buildLiveQuestion, liveModeQuestionCount, publicLiveQuestion, teamScore, type HostLiveQuestion } from "@/lib/live/live-engine";
import {
  broadcastRoomEvent,
  finalizeLiveSession,
  getHostRoom,
  movePlayerToTeam,
  openLiveChannel,
  removeLivePlayer,
  subscribeHostChanges,
  updateHostSession,
} from "@/lib/live/room-service";
import type { ActivitySet, GameSession, LiveGameMode, LivePlayer, Team } from "@/lib/types";

const subscribeToBrowserLocation = () => () => {};

const LIVE_MODE_LABELS: Record<LiveGameMode, string> = {
  "gap-fill": "Fill the Gaps",
  quiz: "Quiz",
  "space-blaster": "Space Blaster",
};

export function HostRoomClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [activity, setActivity] = useState<ActivitySet | null>(null);
  const [players, setPlayers] = useState<LivePlayer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [answers, setAnswers] = useState<{ playerId: string; itemId: string }[]>([]);
  const joinUrl = useSyncExternalStore(
    subscribeToBrowserLocation,
    () => `${window.location.origin}/join`,
    () => "/join",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [presenceCount, setPresenceCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const loadedActivityIdRef = useRef<string | null>(null);
  const revealInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await getHostRoom(sessionId);
      setSession(snapshot.session);
      setPlayers(snapshot.players);
      setTeams(snapshot.teams);
      setAnswers(snapshot.answers);
      if (loadedActivityIdRef.current !== snapshot.session.activitySetId) {
        const loaded = await loadActivity(snapshot.session.activitySetId);
        if (loaded) {
          loadedActivityIdRef.current = loaded.id;
          setActivity(loaded);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh live room.");
    }
  }, [sessionId]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refresh();
    }, 0);
    const stopDb = subscribeHostChanges(sessionId, () => void refresh());
    const channel = openLiveChannel(sessionId, `host-${sessionId}`);
    channelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPresenceCount(Object.values(state).flat().length);
      })
      .on("broadcast", { event: "answer-submitted" }, () => {
        void refresh();
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ role: "host", onlineAt: new Date().toISOString() });
      });
    return () => {
      window.clearTimeout(initialRefresh);
      stopDb();
      void channel.untrack();
      void channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId, refresh]);

  const liveGameMode: LiveGameMode = session?.settings.liveGameMode ?? session?.currentQuestion?.gameMode ?? "quiz";
  const liveQuestionTotal = useMemo(() => activity ? liveModeQuestionCount(activity, liveGameMode) : 0, [activity, liveGameMode]);
  const scoreboard = useMemo(() => [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)), [players]);
  const currentAnswerCount = useMemo(() => {
    if (!session?.currentQuestion) return 0;
    return new Set(
      answers
        .filter((answer) => answer.itemId === session.currentQuestion?.itemId)
        .map((answer) => answer.playerId),
    ).size;
  }, [answers, session?.currentQuestion]);
  const currentCorrect = (session?.currentQuestion as (HostLiveQuestion | null))?.correctAnswer;

  const send = useCallback(async (event: string, payload: Record<string, unknown>) => {
    if (channelRef.current) await broadcastRoomEvent(channelRef.current, event, payload);
  }, []);

  async function publishQuestion(index: number) {
    if (!activity || !session) return;
    setBusy(true); setError("");
    try {
      const hostQuestion = buildLiveQuestion(activity, index, liveGameMode);
      if (hostQuestion.imageUrl) hostQuestion.imageUrl = (await resolveActivityImageUrl(hostQuestion.imageUrl)) ?? hostQuestion.imageUrl;
      hostQuestion.startedAt = new Date().toISOString();
      await updateHostSession(session.id, { state: "playing", current_item_index: index, current_question: hostQuestion, round_started_at: hostQuestion.startedAt });
      await send("question", { question: publicLiveQuestion(hostQuestion), state: "playing", settings: session.settings });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start question."); }
    finally { setBusy(false); }
  }

  const reveal = useCallback(async () => {
    if (!session?.currentQuestion || session.state !== "playing" || revealInFlightRef.current) return;
    revealInFlightRef.current = true;
    setBusy(true);
    try {
      await updateHostSession(session.id, { state: "round_results" });
      await send("reveal", { itemId: session.currentQuestion.itemId, correctAnswer: currentCorrect ?? "", state: "round_results" });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reveal this answer.");
    } finally {
      revealInFlightRef.current = false;
      setBusy(false);
    }
  }, [currentCorrect, refresh, send, session]);

  useEffect(() => {
    if (session?.state !== "playing" || !session.currentQuestion || players.length === 0) return;
    if (currentAnswerCount < players.length) return;

    const timeout = window.setTimeout(() => {
      void reveal();
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [currentAnswerCount, players.length, reveal, session?.currentQuestion, session?.state]);

  useEffect(() => {
    if (session?.state !== "playing" || !session.currentQuestion || !session.settings.timerEnabled) return;
    const startedAt = new Date(session.currentQuestion.startedAt).getTime();
    if (!Number.isFinite(startedAt)) return;

    const timerMs = Math.max(1, session.settings.timerSeconds) * 1000;
    const remainingMs = Math.max(0, startedAt + timerMs - Date.now());
    const timeout = window.setTimeout(() => {
      void reveal();
    }, remainingMs + 100);
    return () => window.clearTimeout(timeout);
  }, [reveal, session?.currentQuestion, session?.settings.timerEnabled, session?.settings.timerSeconds, session?.state]);

  async function nextQuestion() {
    if (!session || !activity) return;
    const next = session.currentItemIndex + 1;
    if (next >= liveQuestionTotal) return endSession();
    await publishQuestion(next);
  }

  async function endSession() {
    if (!session) return;
    setBusy(true);
    try {
      const leaderboard = session.settings.leaderboardEnabled
        ? session.mode === "team"
          ? [...teams]
              .map((team) => ({ id: team.id, name: team.name, score: teamScore(players, team.id) }))
              .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
              .slice(0, 10)
          : scoreboard.slice(0, 10).map((player) => ({ id: player.id, name: player.nickname, score: player.score }))
        : [];
      await finalizeLiveSession(session.id);
      await send("final", { state: "final_results", leaderboardKind: session.mode, leaderboard });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not finish session."); }
    finally { setBusy(false); }
  }

  async function toggleLock() {
    if (!session) return;
    await updateHostSession(session.id, { locked: !session.locked });
    await send("state", { locked: !session.locked, state: session.state });
    await refresh();
  }

  async function toggleSessionSetting(key: "leaderboardEnabled" | "timerEnabled") {
    if (!session) return;
    const nextSettings = { ...session.settings, [key]: !session.settings[key] };
    await updateHostSession(session.id, { settings: nextSettings });
    await send("settings", { settings: nextSettings });
    await refresh();
  }

  async function cycleTeam(player: LivePlayer) {
    if (!teams.length) return;
    const current = teams.findIndex((team) => team.id === player.teamId);
    const next = teams[(current + 1) % teams.length];
    await movePlayerToTeam(player.id, next.id);
    await refresh();
  }

  if (error && !session) return <main className="not-found"><span><AppIcon name="exclamation-triangle" /></span><h1>Live room unavailable</h1><p>{error}</p><Link href="/dashboard" className="button button-primary">Back to library</Link></main>;
  if (!session || !activity) return <main className="loading-screen">Opening live classroom…</main>;

  if (session.state === "final_results" || session.state === "closed") {
    return (
      <main className="host-room host-results">
        <header className="live-host-header"><Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link><div><span>Room {session.roomCode}</span><SettingsPanel compact /></div></header>
        <section className="final-live-card"><span className="completion-burst"><AppIcon name="trophy" /></span><span className="eyebrow">Live session complete</span><h1>Nice work, class!</h1><p>{players.length} students · {liveQuestionTotal || session.currentQuestion?.total || activity.items.length} questions · {LIVE_MODE_LABELS[liveGameMode]}</p>
          {session.settings.leaderboardEnabled && (session.mode === "team" ? <TeamScoreboard teams={teams} players={players} /> : <PlayerScoreboard players={scoreboard} />)}
          <div className="final-live-actions"><Link href={`/host/new?activity=${activity.id}`} className="button button-primary button-large"><AppIcon name="arrow-repeat" /> Play again</Link><Link href="/dashboard" className="button button-soft button-large">Back to library</Link></div>
        </section>
      </main>
    );
  }

  if (session.state === "lobby") {
    const fullJoinUrl = `${joinUrl}?code=${session.roomCode}`;
    return (
      <main className="host-room lobby-screen">
        <header className="live-host-header"><Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link><div><span className="live-presence">● {Math.max(0, presenceCount - 1)} live</span><SettingsPanel compact /></div></header>
        {error && <div className="alert-error live-alert">{error}</div>}
        <section className="lobby-layout">
          <div className="join-panel">
            <span className="eyebrow">Students join at</span><strong className="join-domain">{joinUrl.replace(/^https?:\/\//, "")}</strong>
            <div className="room-code-display">{session.roomCode.slice(0,3)} <span>{session.roomCode.slice(3)}</span></div>
            <div className="qr-shell"><QRCodeSVG value={fullJoinUrl} size={210} level="M" marginSize={2} /></div>
            <p>Scan the QR code or enter the six-digit room code. No student account is required.</p>
            <button className={`button ${session.locked ? "button-primary" : "button-soft"}`} onClick={() => void toggleLock()}><AppIcon name={session.locked ? "lock" : "unlock"} /> {session.locked ? "Room locked" : "Lock room"}</button>
          </div>
          <div className="lobby-players-panel">
            <div className="lobby-heading"><div><span className="eyebrow">{LIVE_MODE_LABELS[liveGameMode]} · Live</span><h1>{activity.title}</h1></div><span className="player-count-badge">{players.length} joined</span></div>
            <div className="lobby-player-grid">
              {players.map((player) => <div className="lobby-player" key={player.id} style={player.teamId ? { borderColor: teams.find((team) => team.id === player.teamId)?.color } : undefined}><span>{player.nickname.slice(0,1).toUpperCase()}</span><b>{player.nickname}</b>{session.mode === "team" && <button onClick={() => void cycleTeam(player)}>{teams.find((team) => team.id === player.teamId)?.name ?? "Team"} <AppIcon name="arrow-repeat" /></button>}<button className="kick-player" onClick={() => void removeLivePlayer(player.id)} aria-label={`Remove ${player.nickname}`}><AppIcon name="x-lg" /></button></div>)}
              {!players.length && <div className="empty-lobby"><span><AppIcon name="people" /></span><strong>Waiting for students…</strong><p>Names will appear here as they join.</p></div>}
            </div>
            {session.mode === "team" && <TeamScoreboard teams={teams} players={players} compact />}
            <div className="lobby-controls"><div><button className={`toggle-chip ${session.settings.timerEnabled ? "on" : ""}`} onClick={() => void toggleSessionSetting("timerEnabled")}><AppIcon name="clock" /> Timer {session.settings.timerEnabled ? "on" : "off"}</button><button className={`toggle-chip ${session.settings.leaderboardEnabled ? "on" : ""}`} onClick={() => void toggleSessionSetting("leaderboardEnabled")}><AppIcon name="trophy" /> Ranking {session.settings.leaderboardEnabled ? "on" : "off"}</button></div><button className="button button-primary button-large" disabled={busy || liveQuestionTotal === 0} onClick={() => void publishQuestion(0)}>Start {LIVE_MODE_LABELS[liveGameMode]} <AppIcon name="arrow-right" /></button></div>
          </div>
        </section>
      </main>
    );
  }

  const questionTotal = session.currentQuestion?.total ?? liveQuestionTotal || activity.items.length;
  const liveEyebrow = session.currentQuestion?.gameMode === "space-blaster" ? "SPACE BLASTER · LIVE" : session.currentQuestion?.gameMode === "gap-fill" ? "FILL THE GAPS · LIVE" : "QUIZ · LIVE";

  return (
    <main className="host-room live-playing-screen">
      <header className="live-host-header"><Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link><div className="host-round-meta"><span>Room {session.roomCode}</span><span>{players.length} students</span><span>{currentAnswerCount}/{players.length} answered</span></div><div><button className={`toggle-chip ${session.settings.leaderboardEnabled ? "on" : ""}`} onClick={() => void toggleSessionSetting("leaderboardEnabled")} aria-label="Toggle leaderboard"><AppIcon name="trophy" /></button><SettingsPanel compact /></div></header>
      {error && <div className="alert-error live-alert">{error}</div>}
      <section className="host-play-layout">
        <div className="host-question-panel">
          <div className="game-progress-label"><span>Question {session.currentItemIndex + 1} of {questionTotal}</span><span>{currentAnswerCount} answers</span></div>
          <div className="game-progress"><span style={{ width: `${((session.currentItemIndex + 1) / questionTotal) * 100}%` }} /></div>
          {session.currentQuestion && <>
            {session.currentQuestion.imageUrl && <ActivityImage refValue={session.currentQuestion.imageUrl} alt={session.currentQuestion.prompt} className="live-question-image" />}
            <span className="eyebrow">{liveEyebrow}</span><h1>{session.currentQuestion.prompt}</h1>{session.currentQuestion.hint && <p className="live-hint">{session.currentQuestion.hint}</p>}
            <div className="host-options-grid">{session.currentQuestion.options.map((option, index) => <div key={option} className={session.state === "round_results" && option === currentCorrect ? "revealed-correct" : ""}><span>{String.fromCharCode(65 + index)}</span><b>{option}</b></div>)}</div>
          </>}
          {session.state === "round_results" && <div className="round-answer-reveal"><AppIcon name="check-lg" /> Correct answer: <strong>{currentCorrect}</strong></div>}
          <div className="host-question-controls">
            {session.state === "playing" ? <button className="button button-soft button-large" disabled={busy} onClick={() => void reveal()}>Reveal answer now</button> : <button className="button button-primary button-large" disabled={busy} onClick={() => void nextQuestion()}>{session.currentItemIndex + 1 >= questionTotal ? <>Finish game <AppIcon name="arrow-right" /></> : <>Next question <AppIcon name="arrow-right" /></>}</button>}
            <button className="text-danger" disabled={busy} onClick={() => void endSession()}>End session</button>
          </div>
        </div>
        {session.settings.leaderboardEnabled && <aside className="live-score-panel"><span className="eyebrow">SCOREBOARD</span>{session.mode === "team" ? <TeamScoreboard teams={teams} players={players} /> : <PlayerScoreboard players={scoreboard} />}</aside>}
      </section>
    </main>
  );
}

function PlayerScoreboard({ players }: { players: LivePlayer[] }) {
  return <div className="player-scoreboard">{players.map((player, index) => <div key={player.id}><span className="rank-number">{index + 1}</span><b>{player.nickname}</b><strong>{player.score}</strong></div>)}{!players.length && <p>No scores yet.</p>}</div>;
}

function TeamScoreboard({ teams, players, compact = false }: { teams: Team[]; players: LivePlayer[]; compact?: boolean }) {
  const ranked = [...teams].sort((a, b) => teamScore(players, b.id) - teamScore(players, a.id));
  return <div className={`team-scoreboard ${compact ? "compact" : ""}`}>{ranked.map((team) => <div key={team.id} style={{ borderLeftColor: team.color }}><span style={{ background: team.color }} /><b>{team.name}</b><strong>{teamScore(players, team.id)}</strong><small>{players.filter((player) => player.teamId === team.id).length} players</small></div>)}</div>;
}

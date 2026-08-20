"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { useLiveCountdown } from "@/hooks/useLiveCountdown";
import { LIVE_MODE_CATALOG } from "@/lib/live/live-catalog";
import {
  advanceDynamiteQuestion,
  buildLiveQuestion,
  createDynamiteState,
  eliminateDynamitePlayer,
  liveModeQuestionCount,
  nextAlivePlayerId,
  publicLiveQuestion,
  teamScore,
  type HostLiveQuestion,
} from "@/lib/live/live-engine";
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
import { resolveActivityImageUrl } from "@/lib/media";
import { loadActivity } from "@/lib/repositories/activity-repository";
import type { ActivitySet, ClassroomSettings, DynamiteState, GameSession, LiveGameMode, LivePlayer, Team } from "@/lib/types";
import { DynamiteFinalHost, DynamiteHostStage } from "./DynamiteHostStage";
import { PlayerScoreboard, TeamScoreboard } from "./LiveScoreboards";

const subscribeToBrowserLocation = () => () => {};
const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function HostRoomClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<GameSession | null>(null);
  const [activity, setActivity] = useState<ActivitySet | null>(null);
  const [players, setPlayers] = useState<LivePlayer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [answers, setAnswers] = useState<{ playerId: string; itemId: string }[]>([]);
  const joinUrl = useSyncExternalStore(subscribeToBrowserLocation, () => `${window.location.origin}/join`, () => "/join");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [presenceCount, setPresenceCount] = useState(0);
  const [dynamiteExplosion, setDynamiteExplosion] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const loadedActivityIdRef = useRef<string | null>(null);
  const revealInFlightRef = useRef(false);
  const dynamiteTransitionRef = useRef(false);

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
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const stopDb = subscribeHostChanges(sessionId, () => void refresh());
    const channel = openLiveChannel(sessionId, `host-${sessionId}`);
    channelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setPresenceCount(Object.values(state).flat().length);
      })
      .on("broadcast", { event: "answer-submitted" }, () => void refresh())
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
  const isDynamite = liveGameMode === "dynamite";
  const dynamiteState = session?.settings.dynamiteState ?? null;
  const liveQuestionTotal = useMemo(() => activity ? liveModeQuestionCount(activity, liveGameMode) : 0, [activity, liveGameMode]);
  const scoreboard = useMemo(() => [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)), [players]);
  const currentAnswerCount = useMemo(() => {
    if (!session?.currentQuestion) return 0;
    return new Set(answers.filter((answer) => answer.itemId === session.currentQuestion?.itemId).map((answer) => answer.playerId)).size;
  }, [answers, session?.currentQuestion]);
  const currentCorrect = (session?.currentQuestion as (HostLiveQuestion | null))?.correctAnswer;
  const { remaining: hostRemaining, preciseRemaining: hostRemainingPrecise } = useLiveCountdown({
    active: Boolean(session?.state === "playing" && session.currentQuestion && session.settings.timerEnabled),
    startedAt: session?.currentQuestion?.startedAt,
    timerSeconds: session?.settings.timerSeconds ?? 10,
    intervalMs: isDynamite ? 80 : 200,
  });

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

  const publishDynamiteTurn = useCallback(async (state: DynamiteState, questionIndex: number, settingsOverride?: ClassroomSettings) => {
    if (!activity || !session) return;
    const activePlayer = state.order.find((player) => player.id === state.currentPlayerId);
    if (!activePlayer) throw new Error("Could not find the next Dynamite player.");

    const hostQuestion = buildLiveQuestion(activity, questionIndex, "dynamite");
    if (hostQuestion.imageUrl) hostQuestion.imageUrl = (await resolveActivityImageUrl(hostQuestion.imageUrl)) ?? hostQuestion.imageUrl;
    hostQuestion.startedAt = new Date().toISOString();
    hostQuestion.activePlayerId = activePlayer.id;
    hostQuestion.activePlayerName = activePlayer.name;
    hostQuestion.dynamiteTurnId = crypto.randomUUID();

    const nextSettings: ClassroomSettings = settingsOverride ?? {
      ...session.settings,
      timerEnabled: true,
      timerSeconds: session.settings.dynamiteTimerSeconds ?? 10,
      dynamiteTimerSeconds: session.settings.dynamiteTimerSeconds ?? 10,
      dynamiteState: state,
    };
    nextSettings.dynamiteState = state;

    await updateHostSession(session.id, {
      state: "playing",
      current_item_index: questionIndex,
      current_question: hostQuestion,
      round_started_at: hostQuestion.startedAt,
      settings: nextSettings,
    });
    await send("question", { question: publicLiveQuestion(hostQuestion), state: "playing", settings: nextSettings });
    await refresh();
  }, [activity, refresh, send, session]);

  async function startDynamite() {
    if (!activity || !session) return;
    if (players.length < 2) return setError("Dynamite needs at least two students in the room.");
    if (liveQuestionTotal < 2) return setError("This deck needs at least two compatible questions for Dynamite.");
    setBusy(true); setError("");
    try {
      const state = createDynamiteState(players, liveQuestionTotal);
      const nextSettings: ClassroomSettings = {
        ...session.settings,
        liveGameMode: "dynamite",
        timerEnabled: true,
        timerSeconds: session.settings.dynamiteTimerSeconds ?? 10,
        dynamiteTimerSeconds: session.settings.dynamiteTimerSeconds ?? 10,
        dynamiteState: state,
        leaderboardEnabled: false,
      };
      await publishDynamiteTurn(state, state.questionOrder[0], nextSettings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Dynamite.");
    } finally {
      setBusy(false);
    }
  }

  const reveal = useCallback(async () => {
    if (!session?.currentQuestion || session.state !== "playing" || revealInFlightRef.current || isDynamite) return;
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
  }, [currentCorrect, isDynamite, refresh, send, session]);

  useEffect(() => {
    if (isDynamite || session?.state !== "playing" || !session.currentQuestion || players.length === 0) return;
    if (currentAnswerCount < players.length) return;
    const timeout = window.setTimeout(() => void reveal(), 250);
    return () => window.clearTimeout(timeout);
  }, [currentAnswerCount, isDynamite, players.length, reveal, session?.currentQuestion, session?.state]);

  useEffect(() => {
    if (isDynamite || session?.state !== "playing" || !session.currentQuestion || !session.settings.timerEnabled) return;
    const startedAt = new Date(session.currentQuestion.startedAt).getTime();
    if (!Number.isFinite(startedAt)) return;
    const timerMs = Math.max(1, session.settings.timerSeconds) * 1000;
    const remainingMs = Math.max(0, startedAt + timerMs - Date.now());
    const timeout = window.setTimeout(() => void reveal(), remainingMs + 100);
    return () => window.clearTimeout(timeout);
  }, [isDynamite, reveal, session?.currentQuestion, session?.settings.timerEnabled, session?.settings.timerSeconds, session?.state]);

  const advanceDynamitePass = useCallback(async () => {
    if (!activity || !session || !dynamiteState || dynamiteTransitionRef.current) return;
    const nextPlayerId = nextAlivePlayerId(dynamiteState);
    if (!nextPlayerId) return;
    dynamiteTransitionRef.current = true;
    try {
      const playerAdvanced = { ...dynamiteState, currentPlayerId: nextPlayerId, turnNumber: dynamiteState.turnNumber + 1 };
      const advanced = advanceDynamiteQuestion(playerAdvanced, liveQuestionTotal);
      await sleep(550);
      await publishDynamiteTurn(advanced.state, advanced.questionIndex);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not pass the Dynamite.");
    } finally {
      dynamiteTransitionRef.current = false;
    }
  }, [activity, dynamiteState, liveQuestionTotal, publishDynamiteTurn, session]);

  useEffect(() => {
    if (!isDynamite || session?.state !== "playing" || !session.currentQuestion || !dynamiteState) return;
    if (session.currentQuestion.activePlayerId !== dynamiteState.currentPlayerId) return;
    if (session.currentQuestion.passedBy !== dynamiteState.currentPlayerId) return;
    void advanceDynamitePass();
  }, [advanceDynamitePass, dynamiteState, isDynamite, session?.currentQuestion, session?.state]);

  const explodeDynamite = useCallback(async () => {
    if (!activity || !session || !dynamiteState || !session.currentQuestion || dynamiteTransitionRef.current) return;
    if (session.currentQuestion.activePlayerId !== dynamiteState.currentPlayerId) return;
    dynamiteTransitionRef.current = true;
    try {
      const explodedPlayer = dynamiteState.order.find((player) => player.id === dynamiteState.currentPlayerId);
      const eliminated = eliminateDynamitePlayer(dynamiteState, dynamiteState.currentPlayerId);
      setDynamiteExplosion(explodedPlayer?.name ?? "Player");
      await send("dynamite-explosion", { playerId: dynamiteState.currentPlayerId, playerName: explodedPlayer?.name ?? "Player" });

      if (eliminated.winnerId) {
        const winner = eliminated.order.find((player) => player.id === eliminated.winnerId);
        const finalSettings = { ...session.settings, dynamiteState: eliminated };
        await updateHostSession(session.id, { settings: finalSettings });
        await sleep(900);
        await finalizeLiveSession(session.id);
        await send("final", {
          state: "final_results",
          leaderboardKind: "individual",
          leaderboard: [],
          dynamiteWinner: winner ?? null,
          dynamiteOrder: eliminated.order,
          eliminatedIds: eliminated.eliminatedIds,
        });
        await refresh();
        return;
      }

      const turnAdvanced = { ...eliminated, turnNumber: eliminated.turnNumber + 1 };
      const advanced = advanceDynamiteQuestion(turnAdvanced, liveQuestionTotal);
      const interimSettings = { ...session.settings, dynamiteState: advanced.state };
      await updateHostSession(session.id, { settings: interimSettings });
      await refresh();
      await sleep(900);
      setDynamiteExplosion(null);
      await publishDynamiteTurn(advanced.state, advanced.questionIndex, interimSettings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not continue Dynamite.");
    } finally {
      setDynamiteExplosion(null);
      dynamiteTransitionRef.current = false;
    }
  }, [activity, dynamiteState, liveQuestionTotal, publishDynamiteTurn, refresh, send, session]);

  useEffect(() => {
    if (!isDynamite || session?.state !== "playing" || !session.currentQuestion || !dynamiteState) return;
    if (hostRemaining !== 0 || session.currentQuestion.passedBy) return;
    if (session.currentQuestion.activePlayerId !== dynamiteState.currentPlayerId) return;
    void explodeDynamite();
  }, [dynamiteState, explodeDynamite, hostRemaining, isDynamite, session?.currentQuestion, session?.state]);

  useEffect(() => {
    if (!isDynamite || session?.state !== "playing" || !session.currentQuestion || !dynamiteState || dynamiteTransitionRef.current) return;
    if (dynamiteState.winnerId) return;
    if (session.currentQuestion.activePlayerId === dynamiteState.currentPlayerId) return;
    const questionIndex = dynamiteState.questionOrder[dynamiteState.questionCursor];
    if (typeof questionIndex !== "number") return;
    dynamiteTransitionRef.current = true;
    void publishDynamiteTurn(dynamiteState, questionIndex).finally(() => { dynamiteTransitionRef.current = false; });
  }, [dynamiteState, isDynamite, publishDynamiteTurn, session?.currentQuestion, session?.state]);

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
      const leaderboard = isDynamite ? [] : session.settings.leaderboardEnabled
        ? session.mode === "team"
          ? [...teams].map((team) => ({ id: team.id, name: team.name, score: teamScore(players, team.id) })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 10)
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
    if (!session || isDynamite) return;
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
    if (isDynamite && dynamiteState?.winnerId) {
      const winner = dynamiteState.order.find((player) => player.id === dynamiteState.winnerId);
      return <DynamiteFinalHost roomCode={session.roomCode} winner={winner?.name ?? "Winner"} activityId={activity.id} />;
    }
    return (
      <main className="host-room host-results">
        <header className="live-host-header"><Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link><div><span>Room {session.roomCode}</span><SettingsPanel compact /></div></header>
        <section className="final-live-card"><span className="completion-burst"><AppIcon name="trophy" /></span><span className="eyebrow">Live session complete</span><h1>Nice work, class!</h1><p>{players.length} students · {liveQuestionTotal || session.currentQuestion?.total || activity.items.length} questions · {LIVE_MODE_CATALOG[liveGameMode].label}</p>
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
            <div className="lobby-heading"><div><span className="eyebrow">{LIVE_MODE_CATALOG[liveGameMode].label} · Live</span><h1>{activity.title}</h1></div><span className="player-count-badge">{players.length} joined</span></div>
            <div className="lobby-player-grid">
              {players.map((player) => <div className="lobby-player" key={player.id} style={player.teamId ? { borderColor: teams.find((team) => team.id === player.teamId)?.color } : undefined}><span>{player.nickname.slice(0,1).toUpperCase()}</span><b>{player.nickname}</b>{session.mode === "team" && !isDynamite && <button onClick={() => void cycleTeam(player)}>{teams.find((team) => team.id === player.teamId)?.name ?? "Team"} <AppIcon name="arrow-repeat" /></button>}<button className="kick-player" onClick={() => void removeLivePlayer(player.id)} aria-label={`Remove ${player.nickname}`}><AppIcon name="x-lg" /></button></div>)}
              {!players.length && <div className="empty-lobby"><span><AppIcon name="people" /></span><strong>Waiting for students…</strong><p>Names will appear here as they join.</p></div>}
            </div>
            {session.mode === "team" && !isDynamite && <TeamScoreboard teams={teams} players={players} compact />}
            {isDynamite && <div className="dynamite-lobby-rule"><AppIcon name="fire" /><div><b>{session.settings.dynamiteTimerSeconds ?? 10}s fuse · last survivor wins</b><span>The turn order will be shuffled when the game starts and will stay visible to everyone.</span></div></div>}
            <div className="lobby-controls"><div>{!isDynamite && <><button className={`toggle-chip ${session.settings.timerEnabled ? "on" : ""}`} onClick={() => void toggleSessionSetting("timerEnabled")}><AppIcon name="clock" /> Timer {session.settings.timerEnabled ? "on" : "off"}</button><button className={`toggle-chip ${session.settings.leaderboardEnabled ? "on" : ""}`} onClick={() => void toggleSessionSetting("leaderboardEnabled")}><AppIcon name="trophy" /> Ranking {session.settings.leaderboardEnabled ? "on" : "off"}</button></>}</div><button className="button button-primary button-large" disabled={busy || liveQuestionTotal === 0 || (isDynamite && players.length < 2)} onClick={() => void (isDynamite ? startDynamite() : publishQuestion(0))}>Start {LIVE_MODE_CATALOG[liveGameMode].label} <AppIcon name="arrow-right" /></button></div>
            {isDynamite && players.length < 2 && <small className="dynamite-minimum">At least 2 students must join before Dynamite can start.</small>}
          </div>
        </section>
      </main>
    );
  }

  if (isDynamite && session.currentQuestion && dynamiteState) {
    return (
      <DynamiteHostStage
        session={session}
        state={dynamiteState}
        remaining={hostRemaining ?? session.settings.dynamiteTimerSeconds ?? 10}
        preciseRemaining={hostRemainingPrecise ?? hostRemaining ?? session.settings.dynamiteTimerSeconds ?? 10}
        explosion={dynamiteExplosion}
        onEnd={() => void endSession()}
      />
    );
  }

  const questionTotal = session.currentQuestion?.total ?? (liveQuestionTotal || activity.items.length);
  const liveEyebrow = `${LIVE_MODE_CATALOG[session.currentQuestion?.gameMode ?? liveGameMode].label.toUpperCase()} · LIVE`;

  return (
    <main className="host-room live-playing-screen">
      <header className="live-host-header"><Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link><div className="host-round-meta"><span>Room {session.roomCode}</span><span>{players.length} students</span><span>{currentAnswerCount}/{players.length} answered</span>{session.settings.timerEnabled && <span className={`student-timer ${(hostRemaining ?? 99) <= 5 ? "urgent" : ""}`}><AppIcon name="clock" /> {hostRemaining ?? session.settings.timerSeconds}s</span>}</div><div><button className={`toggle-chip ${session.settings.leaderboardEnabled ? "on" : ""}`} onClick={() => void toggleSessionSetting("leaderboardEnabled")} aria-label="Toggle leaderboard"><AppIcon name="trophy" /></button><SettingsPanel compact /></div></header>
      {error && <div className="alert-error live-alert">{error}</div>}
      <section className="host-play-layout">
        <div className="host-question-panel">
          <div className="game-progress-label"><span>Question {session.currentItemIndex + 1} of {questionTotal}</span><span>{session.settings.timerEnabled ? <><AppIcon name="clock" /> {hostRemaining ?? session.settings.timerSeconds}s · </> : null}{currentAnswerCount} answers</span></div>
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

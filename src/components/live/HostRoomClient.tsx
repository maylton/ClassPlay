"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useLiveCountdown } from "@/hooks/useLiveCountdown";
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
import { HostLobby, StandardHostFinal, StandardHostStage } from "./HostLiveViews";

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
    setBusy(true);
    setError("");
    try {
      const hostQuestion = buildLiveQuestion(activity, index, liveGameMode);
      if (hostQuestion.imageUrl) hostQuestion.imageUrl = (await resolveActivityImageUrl(hostQuestion.imageUrl)) ?? hostQuestion.imageUrl;
      hostQuestion.startedAt = new Date().toISOString();
      await updateHostSession(session.id, {
        state: "playing",
        current_item_index: index,
        current_question: hostQuestion,
        round_started_at: hostQuestion.startedAt,
      });
      await send("question", { question: publicLiveQuestion(hostQuestion), state: "playing", settings: session.settings });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start question.");
    } finally {
      setBusy(false);
    }
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
    setBusy(true);
    setError("");
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not finish session.");
    } finally {
      setBusy(false);
    }
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

  if (error && !session) return <main className="not-found"><h1>Live room unavailable</h1><p>{error}</p></main>;
  if (!session || !activity) return <main className="loading-screen">Opening live classroom…</main>;

  if (session.state === "final_results" || session.state === "closed") {
    if (isDynamite && dynamiteState?.winnerId) {
      const winner = dynamiteState.order.find((player) => player.id === dynamiteState.winnerId);
      return <DynamiteFinalHost roomCode={session.roomCode} winner={winner?.name ?? "Winner"} activityId={activity.id} />;
    }
    return (
      <StandardHostFinal
        session={session}
        players={players}
        teams={teams}
        scoreboard={scoreboard}
        questionTotal={liveQuestionTotal || session.currentQuestion?.total || activity.items.length}
        liveGameMode={liveGameMode}
        activityId={activity.id}
      />
    );
  }

  if (session.state === "lobby") {
    return (
      <HostLobby
        session={session}
        activity={activity}
        players={players}
        teams={teams}
        joinUrl={joinUrl}
        presenceCount={presenceCount}
        error={error}
        busy={busy}
        liveQuestionTotal={liveQuestionTotal}
        liveGameMode={liveGameMode}
        isDynamite={isDynamite}
        onToggleLock={() => void toggleLock()}
        onCycleTeam={(player) => void cycleTeam(player)}
        onRemovePlayer={(playerId) => void removeLivePlayer(playerId)}
        onToggleSetting={(key) => void toggleSessionSetting(key)}
        onStart={() => void (isDynamite ? startDynamite() : publishQuestion(0))}
      />
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
  return (
    <StandardHostStage
      session={session}
      players={players}
      teams={teams}
      scoreboard={scoreboard}
      currentAnswerCount={currentAnswerCount}
      currentCorrect={currentCorrect}
      questionTotal={questionTotal}
      hostRemaining={hostRemaining}
      error={error}
      busy={busy}
      onToggleLeaderboard={() => void toggleSessionSetting("leaderboardEnabled")}
      onReveal={() => void reveal()}
      onNext={() => void nextQuestion()}
      onEnd={() => void endSession()}
    />
  );
}

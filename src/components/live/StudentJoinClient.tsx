"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import { useLiveCountdown } from "@/hooks/useLiveCountdown";
import { LIVE_MODE_CATALOG } from "@/lib/live/live-catalog";
import { normalizeRoomCode, validateNickname } from "@/lib/live/live-engine";
import { broadcastRoomEvent, joinLiveRoom, openLiveChannel, resumeLiveRoom, submitDynamiteAttempt, submitLiveAnswer } from "@/lib/live/room-service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { speakEnglish } from "@/lib/tts";
import type { ClassroomSettings, JoinRoomResult, LiveAnswerResult, LiveQuestion, ResumeRoomResult, SessionState } from "@/lib/types";
import { StudentDynamiteStage } from "./StudentDynamiteStage";
import { StudentLiveSpaceBlaster } from "./StudentLiveSpaceBlaster";

const CREDENTIAL_KEY = "classplay.live.player.v2";
type Credentials = { sessionId: string; playerId: string; playerToken: string; roomCode: string; activityTitle: string; nickname: string; teamName?: string | null; teamColor?: string | null };
type FinalLeaderboardEntry = { id: string; name: string; score: number };
type WinnerRef = { id: string; name: string };

const CREDENTIAL_EVENT = "classplay:player-credentials";

function subscribeCredentials(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CREDENTIAL_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CREDENTIAL_EVENT, callback);
  };
}

function readCredentialSnapshot() {
  return localStorage.getItem(CREDENTIAL_KEY) ?? "";
}

function writeCredentials(credentials: Credentials | null) {
  if (credentials) localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credentials));
  else localStorage.removeItem(CREDENTIAL_KEY);
  window.dispatchEvent(new Event(CREDENTIAL_EVENT));
}

export function StudentJoinClient({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(normalizeRoomCode(initialCode));
  const [nickname, setNickname] = useState("");
  const credentialSnapshot = useSyncExternalStore(subscribeCredentials, readCredentialSnapshot, () => "");
  const credentials = useMemo(() => {
    if (!credentialSnapshot) return null;
    try {
      const saved = JSON.parse(credentialSnapshot) as Credentials;
      return !initialCode || saved.roomCode === normalizeRoomCode(initialCode) ? saved : null;
    } catch {
      return null;
    }
  }, [credentialSnapshot, initialCode]);
  const [joinResult, setJoinResult] = useState<JoinRoomResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanCode = normalizeRoomCode(code);
    if (cleanCode.length !== 6) return setError("Enter the six-digit room code.");
    const validation = validateNickname(nickname);
    if (!validation.ok) return setError(validation.message);
    setBusy(true); setError("");
    try {
      const result = await joinLiveRoom(cleanCode, validation.nickname);
      const saved: Credentials = { sessionId: result.sessionId, playerId: result.playerId, playerToken: result.playerToken, roomCode: cleanCode, activityTitle: result.activityTitle, nickname: validation.nickname, teamName: result.teamName, teamColor: result.teamColor };
      writeCredentials(saved);
      setJoinResult(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join this room.");
    } finally { setBusy(false); }
  }

  function leave() {
    writeCredentials(null);
    setJoinResult(null); setError("");
  }

  if (!isSupabaseConfigured) {
    return <main className="student-join-screen"><section className="student-join-card"><div className="student-brand"><b>C</b><span>ClassPlay</span></div><span className="student-emoji"><AppIcon name="cloud-slash" /></span><h1>Live rooms need cloud setup.</h1><p>This ClassPlay installation is running in local mode. Your teacher can still use the projected games.</p><Link href="/" className="button button-primary">ClassPlay home</Link></section></main>;
  }

  if (credentials) return <StudentLiveRoom credentials={credentials} initialJoin={joinResult} onLeave={leave} />;

  return (
    <main className="student-join-screen">
      <section className="student-join-card">
        <div className="student-brand"><b>C</b><span>ClassPlay</span></div>
        <span className="eyebrow">Join your class</span><h1>Ready to play?</h1><p>Ask your teacher for the room code. You don’t need an account.</p>
        <form className="student-join-form" onSubmit={submit}>
          <label><span>Room code</span><input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(event) => setCode(normalizeRoomCode(event.target.value))} placeholder="123456" autoFocus={!code} /></label>
          <label><span>Your name</span><input maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Ana" autoFocus={Boolean(code)} /></label>
          {error && <div className="student-error">{error}</div>}
          <button disabled={busy} className="button button-primary button-large">{busy ? "Joining…" : <>Join game <AppIcon name="arrow-right" /></>}</button>
        </form>
      </section>
    </main>
  );
}

function StudentLiveRoom({ credentials, initialJoin, onLeave }: { credentials: Credentials; initialJoin: JoinRoomResult | null; onLeave: () => void }) {
  const [state, setState] = useState<SessionState>(initialJoin?.state ?? "lobby");
  const [question, setQuestion] = useState<LiveQuestion | null>(null);
  const [settings, setSettings] = useState<ClassroomSettings | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<LiveAnswerResult | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [teamName, setTeamName] = useState<string | null>(credentials.teamName ?? null);
  const [teamColor, setTeamColor] = useState<string | null>(credentials.teamColor ?? null);
  const [connection, setConnection] = useState("Connecting…");
  const [error, setError] = useState("");
  const [finalLeaderboard, setFinalLeaderboard] = useState<FinalLeaderboardEntry[]>([]);
  const [finalLeaderboardKind, setFinalLeaderboardKind] = useState<"individual" | "team">("individual");
  const [dynamiteWrongOptions, setDynamiteWrongOptions] = useState<string[]>([]);
  const [dynamiteShake, setDynamiteShake] = useState(false);
  const [dynamitePassed, setDynamitePassed] = useState(false);
  const [dynamiteExplosionName, setDynamiteExplosionName] = useState<string | null>(null);
  const [dynamiteWinner, setDynamiteWinner] = useState<WinnerRef | null>(null);
  const [forcedTimeUp, setForcedTimeUp] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { remaining: countdownRemaining } = useLiveCountdown({
    active: Boolean(question && settings?.timerEnabled && state === "playing"),
    startedAt: question?.startedAt,
    timerSeconds: settings?.timerSeconds ?? 10,
  });
  const remaining = forcedTimeUp ? 0 : countdownRemaining;

  const hydrate = useCallback(async () => {
    try {
      const snapshot: ResumeRoomResult = await resumeLiveRoom(credentials.playerId, credentials.playerToken);
      setState(snapshot.state); setQuestion(snapshot.currentQuestion ?? null); setSettings(snapshot.settings); setScore(snapshot.player.score);
      setCorrectAnswer(snapshot.revealedAnswer ?? null);
      setTeamName(snapshot.team?.name ?? credentials.teamName ?? null); setTeamColor(snapshot.team?.color ?? credentials.teamColor ?? null);
      if (snapshot.settings.dynamiteState?.winnerId) {
        const winner = snapshot.settings.dynamiteState.order.find((player) => player.id === snapshot.settings.dynamiteState?.winnerId);
        if (winner) setDynamiteWinner(winner);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore your room.");
    }
  }, [credentials.playerId, credentials.playerToken, credentials.teamColor, credentials.teamName]);

  useEffect(() => {
    const channel = openLiveChannel(credentials.sessionId, `player-${credentials.playerId}`);
    channelRef.current = channel;
    channel
      .on("broadcast", { event: "question" }, ({ payload }) => {
        const next = payload.question as LiveQuestion;
        setQuestion(next); setState("playing"); setSelected(null); setAnswerResult(null); setCorrectAnswer(null); setFinalLeaderboard([]);
        setDynamiteWrongOptions([]); setDynamitePassed(false); setDynamiteExplosionName(null); setForcedTimeUp(false); setError("");
        if ((payload.settings as ClassroomSettings | undefined)?.readAloud && (payload.settings as ClassroomSettings).soundEnabled && next.activePlayerId === credentials.playerId) speakEnglish(next.prompt);
        if (payload.settings) setSettings(payload.settings as ClassroomSettings);
      })
      .on("broadcast", { event: "dynamite-explosion" }, ({ payload }) => {
        setDynamiteExplosionName(String(payload.playerName ?? "Player"));
      })
      .on("broadcast", { event: "reveal" }, ({ payload }) => { setCorrectAnswer(String(payload.correctAnswer ?? "")); setState("round_results"); })
      .on("broadcast", { event: "final" }, ({ payload }) => {
        const raw: unknown[] = Array.isArray(payload.leaderboard) ? payload.leaderboard : [];
        const leaderboard = raw.slice(0, 10).map((entry, index) => {
          const row = entry as Record<string, unknown>;
          return { id: String(row.id ?? index), name: String(row.name ?? "Player"), score: Number(row.score ?? 0) };
        });
        const winner = payload.dynamiteWinner as WinnerRef | null | undefined;
        if (winner?.id) setDynamiteWinner({ id: String(winner.id), name: String(winner.name) });
        setFinalLeaderboard(leaderboard);
        setFinalLeaderboardKind(payload.leaderboardKind === "team" ? "team" : "individual");
        setState("final_results");
      })
      .on("broadcast", { event: "settings" }, ({ payload }) => payload.settings && setSettings(payload.settings as ClassroomSettings))
      .on("broadcast", { event: "state" }, ({ payload }) => payload.state && setState(payload.state as SessionState))
      .subscribe(async (status) => {
        setConnection(status === "SUBSCRIBED" ? "Live" : status.toLowerCase());
        if (status === "SUBSCRIBED") {
          await channel.track({ role: "student", playerId: credentials.playerId, nickname: credentials.nickname, onlineAt: new Date().toISOString() });
          await hydrate();
        }
      });
    return () => { void channel.untrack(); void channel.unsubscribe(); channelRef.current = null; };
  }, [credentials.nickname, credentials.playerId, credentials.sessionId, hydrate]);

  async function answer(option: string) {
    if (!question || selected || (remaining !== null && remaining <= 0)) return;
    setSelected(option); setError("");
    try {
      const result = await submitLiveAnswer(credentials.playerId, credentials.playerToken, question, option, 0);
      setAnswerResult(result); setScore(result.score);
      if (channelRef.current) void broadcastRoomEvent(channelRef.current, "answer-submitted", { playerId: credentials.playerId, itemId: question.itemId }).catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your answer.");
      setSelected(null);
    }
  }

  async function answerDynamite(option: string) {
    if (!question || question.gameMode !== "dynamite" || question.activePlayerId !== credentials.playerId || dynamitePassed || dynamiteWrongOptions.includes(option) || (remaining !== null && remaining <= 0)) return;
    setError("");
    try {
      const result = await submitDynamiteAttempt(credentials.playerId, credentials.playerToken, question, option);
      setScore(result.score);
      if (result.timeUp) {
        setForcedTimeUp(true);
      } else if (result.correct) {
        setSelected(option);
        setDynamitePassed(true);
      } else {
        setDynamiteWrongOptions((current) => current.includes(option) ? current : [...current, option]);
        setDynamiteShake(true);
        window.setTimeout(() => setDynamiteShake(false), 340);
      }
      if (channelRef.current) void broadcastRoomEvent(channelRef.current, "answer-submitted", { playerId: credentials.playerId, itemId: question.itemId, dynamite: true }).catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your Dynamite answer.");
    }
  }

  const answerClass = (option: string) => {
    if (correctAnswer) return option === correctAnswer ? "correct" : selected === option ? "wrong" : "dimmed";
    if (!answerResult) return selected === option ? "selected" : "";
    if (selected === option) return answerResult.correct ? "correct" : "wrong";
    return "dimmed";
  };

  if (state === "final_results" || state === "closed") {
    if (settings?.liveGameMode === "dynamite" && dynamiteWinner) {
      const me = dynamiteWinner.id === credentials.playerId;
      return <main className="student-live-screen dynamite-student-final"><section className="student-result-card dynamite-winner-card"><span><AppIcon name="trophy" /></span><small>LAST ONE STANDING</small><h1>{me ? "You survived!" : `${dynamiteWinner.name} wins!`}</h1><p>{me ? "You were the final player holding on." : "The Dynamite has a winner."}</p><button className="button button-primary button-large" onClick={onLeave}>Done</button></section></main>;
    }
    return (
      <main className="student-live-screen">
        <section className="student-result-card">
          <span><AppIcon name="trophy" /></span><small>GAME COMPLETE</small><h1>Great job, {credentials.nickname}!</h1><strong>{score}</strong><p>points</p>
          {teamName && <div className="student-team-chip" style={{ borderColor: teamColor ?? undefined }}>Team {teamName}</div>}
          {settings?.leaderboardEnabled && finalLeaderboard.length > 0 && (
            <section className="student-temporary-leaderboard">
              <div><div><small>FINAL RANKING</small><h2>{finalLeaderboardKind === "team" ? "Team leaderboard" : "Class leaderboard"}</h2></div><AppIcon name="bar-chart-fill" /></div>
              <div className="temporary-final-ranking">{finalLeaderboard.map((entry, index) => { const current = finalLeaderboardKind === "team" ? entry.name === teamName : entry.id === credentials.playerId; return <div className={`temporary-ranking-row ${current ? "current" : ""}`} key={`${entry.id}-${index}`}><span className={`temporary-rank rank-${index + 1}`}>{index + 1}</span><strong>{entry.name}</strong><b>{entry.score}</b></div>; })}</div>
              <small>This ranking belongs only to this live room and disappears after the session.</small>
            </section>
          )}
          <button className="button button-primary button-large" onClick={onLeave}>Done</button>
        </section>
      </main>
    );
  }

  if (state === "lobby" || !question) {
    const waitingMode = settings?.liveGameMode ? LIVE_MODE_CATALOG[settings.liveGameMode].label : "the live game";
    return <main className="student-live-screen"><header className="student-live-header"><div className="student-brand"><b>C</b><span>ClassPlay</span></div><span className="connection-pill">● {connection}</span></header><section className="student-wait-card"><div className="waiting-orbit"><AppIcon name={settings?.liveGameMode === "dynamite" ? "fire" : "hourglass-split"} /></div><span className="eyebrow">YOU’RE IN</span><h1>Hi, {credentials.nickname}!</h1><p>Waiting for your teacher to start <strong>{waitingMode}</strong> with {credentials.activityTitle}.</p>{settings?.liveGameMode === "dynamite" && <div className="dynamite-phone-rule"><b>{settings.dynamiteTimerSeconds ?? 10}s fuse</b><span>Answer correctly before the Dynamite reaches zero. Last player alive wins.</span></div>}{teamName && <div className="student-team-chip" style={{ borderColor: teamColor ?? undefined }}>You’re on {teamName}</div>}<div className="room-mini-code">Room {credentials.roomCode}</div>{error && <div className="student-error">{error}</div>}<button className="student-leave" onClick={onLeave}>{error ? "Rejoin with another name/code" : "Leave room"}</button></section></main>;
  }

  if (question.gameMode === "dynamite" && settings?.dynamiteState) {
    return (
      <StudentDynamiteStage
        playerId={credentials.playerId}
        nickname={credentials.nickname}
        question={question}
        state={settings.dynamiteState}
        remaining={remaining ?? settings.dynamiteTimerSeconds ?? 10}
        wrongOptions={dynamiteWrongOptions}
        selected={selected}
        passed={dynamitePassed}
        shake={dynamiteShake}
        explosionName={dynamiteExplosionName}
        connection={connection}
        error={error}
        onAnswer={answerDynamite}
      />
    );
  }

  const isSpaceBlaster = question.gameMode === "space-blaster";
  const liveModeLabel = LIVE_MODE_CATALOG[question.gameMode ?? "quiz"].label.toUpperCase();
  const answerDisabled = Boolean(selected) || state !== "playing" || (remaining !== null && remaining <= 0);

  return (
    <main className="student-live-screen answering">
      <header className="student-live-header"><div><span>{credentials.nickname}</span>{teamName && <b style={{ color: teamColor ?? undefined }}>{teamName}</b>}</div><strong>{score} pts</strong><span className="connection-pill">● {connection}</span></header>
      <section className="student-question-card">
        <div className="student-question-meta"><span>{liveModeLabel} · Question {question.index + 1}/{question.total}</span>{settings?.timerEnabled && <span className={`student-timer ${(remaining ?? 99) <= 5 ? "urgent" : ""}`}>{remaining ?? settings.timerSeconds}s</span>}</div>
        <div className="student-progress"><span style={{ width: `${((question.index + 1) / question.total) * 100}%` }} /></div>
        {question.imageUrl && <ActivityImage refValue={question.imageUrl} alt={question.prompt} className="student-question-image" />}
        {isSpaceBlaster ? <StudentLiveSpaceBlaster question={question} selected={selected} answerResult={answerResult} correctAnswer={correctAnswer} disabled={answerDisabled} reducedMotion={settings?.reducedMotion ?? false} onAnswer={answer} /> : <><h1>{question.prompt}</h1>{question.hint && <p>{question.hint}</p>}<div className="student-answer-grid">{question.options.map((option, index) => <button disabled={answerDisabled} className={answerClass(option)} onClick={() => void answer(option)} key={option}><span>{String.fromCharCode(65 + index)}</span><b>{option}</b></button>)}</div></>}
        {answerResult && state === "playing" && <div className={`student-feedback ${answerResult.correct ? "correct" : "wrong"}`}>{answerResult.correct ? <><AppIcon name="check-lg" /> Nice! +{answerResult.points}</> : "Not this one — wait for the reveal."}</div>}
        {state === "round_results" && <div className="student-feedback correct">Correct answer: <strong>{correctAnswer}</strong><small>Waiting for the next question…</small></div>}
        {remaining === 0 && !selected && <div className="student-feedback wrong">Time’s up. Wait for the answer.</div>}
        {error && <div className="student-error">{error}</div>}
      </section>
    </main>
  );
}

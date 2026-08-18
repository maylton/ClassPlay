"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ActivityImage } from "@/components/media/ActivityImage";
import { normalizeRoomCode, validateNickname } from "@/lib/live/live-engine";
import { broadcastRoomEvent, joinLiveRoom, openLiveChannel, resumeLiveRoom, submitLiveAnswer } from "@/lib/live/room-service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { speakEnglish } from "@/lib/tts";
import type { ClassroomSettings, JoinRoomResult, LiveAnswerResult, LiveQuestion, ResumeRoomResult, SessionState } from "@/lib/types";

const CREDENTIAL_KEY = "classplay.live.player.v2";
type Credentials = { sessionId: string; playerId: string; playerToken: string; roomCode: string; activityTitle: string; nickname: string; teamName?: string | null; teamColor?: string | null };

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
    return <main className="student-join-screen"><section className="student-join-card"><div className="student-brand"><b>C</b><span>ClassPlay</span></div><span className="student-emoji">📡</span><h1>Live rooms need cloud setup.</h1><p>This ClassPlay installation is running in local mode. Your teacher can still use all six projected games.</p><Link href="/" className="button button-primary">ClassPlay home</Link></section></main>;
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
          <button disabled={busy} className="button button-primary button-large">{busy ? "Joining…" : "Join game →"}</button>
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
  const [remaining, setRemaining] = useState<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  async function hydrate() {
    try {
      const snapshot: ResumeRoomResult = await resumeLiveRoom(credentials.playerId, credentials.playerToken);
      setState(snapshot.state); setQuestion(snapshot.currentQuestion ?? null); setSettings(snapshot.settings); setScore(snapshot.player.score);
      setCorrectAnswer(snapshot.revealedAnswer ?? null);
      setTeamName(snapshot.team?.name ?? teamName); setTeamColor(snapshot.team?.color ?? teamColor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore your room.");
    }
  }

  useEffect(() => {
    const channel = openLiveChannel(credentials.sessionId, `player-${credentials.playerId}`);
    channelRef.current = channel;
    channel
      .on("broadcast", { event: "question" }, ({ payload }) => {
        const next = payload.question as LiveQuestion;
        setQuestion(next); setState("playing"); setSelected(null); setAnswerResult(null); setCorrectAnswer(null);
        if ((payload.settings as ClassroomSettings | undefined)?.readAloud && (payload.settings as ClassroomSettings).soundEnabled) speakEnglish(next.prompt);
        if (payload.settings) setSettings(payload.settings as ClassroomSettings);
      })
      .on("broadcast", { event: "reveal" }, ({ payload }) => { setCorrectAnswer(String(payload.correctAnswer ?? "")); setState("round_results"); })
      .on("broadcast", { event: "final" }, () => setState("final_results"))
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
    // credentials identify one immutable student connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials.sessionId, credentials.playerId, credentials.playerToken]);

  useEffect(() => {
    if (!question || !settings?.timerEnabled || state !== "playing") return;
    const tick = () => {
      const started = new Date(question.startedAt).getTime();
      const left = Math.max(0, settings.timerSeconds - Math.floor((Date.now() - started) / 1000));
      setRemaining(left);
    };
    const initial = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 250);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [question, settings, state]);

  async function answer(option: string) {
    if (!question || selected || (remaining !== null && remaining <= 0)) return;
    setSelected(option); setError("");
    try {
      const result = await submitLiveAnswer(credentials.playerId, credentials.playerToken, question, option, 0);
      setAnswerResult(result); setScore(result.score);
      if (channelRef.current) {
        void broadcastRoomEvent(channelRef.current, "answer-submitted", {
          playerId: credentials.playerId,
          itemId: question.itemId,
        }).catch(() => {});
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send your answer.");
      setSelected(null);
    }
  }

  const answerClass = (option: string) => {
    if (correctAnswer) return option === correctAnswer ? "correct" : selected === option ? "wrong" : "dimmed";
    if (!answerResult) return selected === option ? "selected" : "";
    if (selected === option) return answerResult.correct ? "correct" : "wrong";
    return "dimmed";
  };

  if (state === "final_results" || state === "closed") {
    return <main className="student-live-screen"><section className="student-result-card"><span>🏆</span><small>GAME COMPLETE</small><h1>Great job, {credentials.nickname}!</h1><strong>{score}</strong><p>points</p>{teamName && <div className="student-team-chip" style={{ borderColor: teamColor ?? undefined }}>Team {teamName}</div>}<button className="button button-primary button-large" onClick={onLeave}>Done</button></section></main>;
  }

  if (state === "lobby" || !question) {
    return <main className="student-live-screen"><header className="student-live-header"><div className="student-brand"><b>C</b><span>ClassPlay</span></div><span className="connection-pill">● {connection}</span></header><section className="student-wait-card"><div className="waiting-orbit">✦</div><span className="eyebrow">YOU’RE IN</span><h1>Hi, {credentials.nickname}!</h1><p>Waiting for your teacher to start <strong>{credentials.activityTitle}</strong>.</p>{teamName && <div className="student-team-chip" style={{ borderColor: teamColor ?? undefined }}>You’re on {teamName}</div>}<div className="room-mini-code">Room {credentials.roomCode}</div>{error && <div className="student-error">{error}</div>}<button className="student-leave" onClick={onLeave}>{error ? "Rejoin with another name/code" : "Leave room"}</button></section></main>;
  }

  return (
    <main className="student-live-screen answering">
      <header className="student-live-header"><div><span>{credentials.nickname}</span>{teamName && <b style={{ color: teamColor ?? undefined }}>{teamName}</b>}</div><strong>{score} pts</strong><span className="connection-pill">● {connection}</span></header>
      <section className="student-question-card">
        <div className="student-question-meta"><span>Question {question.index + 1}/{question.total}</span>{settings?.timerEnabled && <span className={`student-timer ${(remaining ?? 99) <= 5 ? "urgent" : ""}`}>{remaining ?? settings.timerSeconds}s</span>}</div>
        <div className="student-progress"><span style={{ width: `${((question.index + 1) / question.total) * 100}%` }} /></div>
        {question.imageUrl && <ActivityImage refValue={question.imageUrl} alt={question.prompt} className="student-question-image" />}
        <h1>{question.prompt}</h1>{question.hint && <p>{question.hint}</p>}
        <div className="student-answer-grid">{question.options.map((option, index) => <button disabled={Boolean(selected) || state !== "playing" || (remaining !== null && remaining <= 0)} className={answerClass(option)} onClick={() => void answer(option)} key={option}><span>{String.fromCharCode(65 + index)}</span><b>{option}</b></button>)}</div>
        {answerResult && state === "playing" && <div className={`student-feedback ${answerResult.correct ? "correct" : "wrong"}`}>{answerResult.correct ? `✓ Nice! +${answerResult.points}` : "Not this one — wait for the reveal."}</div>}
        {state === "round_results" && <div className="student-feedback correct">Correct answer: <strong>{correctAnswer}</strong><small>Waiting for the next question…</small></div>}
        {remaining === 0 && !selected && <div className="student-feedback wrong">Time’s up. Wait for the answer.</div>}
        {error && <div className="student-error">{error}</div>}
      </section>
    </main>
  );
}

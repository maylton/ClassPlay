"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import { nextAlivePlayerId, normalizeRoomCode, validateNickname } from "@/lib/live/live-engine";
import { broadcastRoomEvent, joinLiveRoom, openLiveChannel, resumeLiveRoom, submitDynamiteAttempt, submitLiveAnswer } from "@/lib/live/room-service";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { speakEnglish } from "@/lib/tts";
import type { ClassroomSettings, DynamiteState, JoinRoomResult, LiveAnswerResult, LiveQuestion, ResumeRoomResult, SessionState } from "@/lib/types";

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
  const [remaining, setRemaining] = useState<number | null>(null);
  const [finalLeaderboard, setFinalLeaderboard] = useState<FinalLeaderboardEntry[]>([]);
  const [finalLeaderboardKind, setFinalLeaderboardKind] = useState<"individual" | "team">("individual");
  const [dynamiteWrongOptions, setDynamiteWrongOptions] = useState<string[]>([]);
  const [dynamiteShake, setDynamiteShake] = useState(false);
  const [dynamitePassed, setDynamitePassed] = useState(false);
  const [dynamiteExplosionName, setDynamiteExplosionName] = useState<string | null>(null);
  const [dynamiteWinner, setDynamiteWinner] = useState<WinnerRef | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  async function hydrate() {
    try {
      const snapshot: ResumeRoomResult = await resumeLiveRoom(credentials.playerId, credentials.playerToken);
      setState(snapshot.state); setQuestion(snapshot.currentQuestion ?? null); setSettings(snapshot.settings); setScore(snapshot.player.score);
      setCorrectAnswer(snapshot.revealedAnswer ?? null);
      setTeamName(snapshot.team?.name ?? teamName); setTeamColor(snapshot.team?.color ?? teamColor);
      if (snapshot.settings.dynamiteState?.winnerId) {
        const winner = snapshot.settings.dynamiteState.order.find((player) => player.id === snapshot.settings.dynamiteState?.winnerId);
        if (winner) setDynamiteWinner(winner);
      }
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
        setQuestion(next); setState("playing"); setSelected(null); setAnswerResult(null); setCorrectAnswer(null); setFinalLeaderboard([]);
        setDynamiteWrongOptions([]); setDynamitePassed(false); setDynamiteExplosionName(null); setError("");
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
    const interval = window.setInterval(tick, 200);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [question, settings, state]);

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
        setRemaining(0);
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
    const waitingMode = settings?.liveGameMode === "dynamite" ? "Dynamite" : settings?.liveGameMode === "space-blaster" ? "Space Blaster" : settings?.liveGameMode === "gap-fill" ? "Fill the Gaps" : settings?.liveGameMode === "quiz" ? "Quiz" : "the live game";
    return <main className="student-live-screen"><header className="student-live-header"><div className="student-brand"><b>C</b><span>ClassPlay</span></div><span className="connection-pill">● {connection}</span></header><section className="student-wait-card"><div className="waiting-orbit"><AppIcon name={settings?.liveGameMode === "dynamite" ? "fire" : "hourglass-split"} /></div><span className="eyebrow">YOU’RE IN</span><h1>Hi, {credentials.nickname}!</h1><p>Waiting for your teacher to start <strong>{waitingMode}</strong> with {credentials.activityTitle}.</p>{settings?.liveGameMode === "dynamite" && <div className="dynamite-phone-rule"><b>{settings.dynamiteTimerSeconds ?? 10}s fuse</b><span>Answer correctly before the Dynamite reaches zero. Last player alive wins.</span></div>}{teamName && <div className="student-team-chip" style={{ borderColor: teamColor ?? undefined }}>You’re on {teamName}</div>}<div className="room-mini-code">Room {credentials.roomCode}</div>{error && <div className="student-error">{error}</div>}<button className="student-leave" onClick={onLeave}>{error ? "Rejoin with another name/code" : "Leave room"}</button></section></main>;
  }

  if (question.gameMode === "dynamite" && settings?.dynamiteState) {
    return (
      <StudentDynamiteStage
        credentials={credentials}
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
  const liveModeLabel = isSpaceBlaster ? "SPACE BLASTER" : question.gameMode === "gap-fill" ? "FILL THE GAPS" : "QUIZ";
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

function StudentDynamiteStage({ credentials, question, state, remaining, wrongOptions, selected, passed, shake, explosionName, connection, error, onAnswer }: { credentials: Credentials; question: LiveQuestion; state: DynamiteState; remaining: number; wrongOptions: string[]; selected: string | null; passed: boolean; shake: boolean; explosionName: string | null; connection: string; error: string; onAnswer: (option: string) => Promise<void> }) {
  const alive = state.aliveIds.includes(credentials.playerId);
  const active = question.activePlayerId === credentials.playerId && alive;
  const nextId = nextAlivePlayerId(state);
  const next = state.order.find((player) => player.id === nextId);
  const current = state.order.find((player) => player.id === state.currentPlayerId);

  return (
    <main className={`student-live-screen dynamite-student-screen ${shake ? "dynamite-shake" : ""} ${remaining <= 3 ? "dynamite-critical" : ""}`}>
      <header className="student-live-header"><div><span>{credentials.nickname}</span><b>{alive ? "ALIVE" : "SPECTATING"}</b></div><span className="connection-pill">● {connection}</span></header>
      <section className="dynamite-student-layout">
        {explosionName ? (
          <div className="dynamite-phone-boom"><strong>BOOM!</strong><span>{explosionName} is out!</span></div>
        ) : active ? (
          <div className="dynamite-answer-card">
            <div className="dynamite-phone-timer"><span><AppIcon name="fire" /></span><strong>{remaining}</strong><small>SECONDS</small></div>
            <span className="eyebrow">THE DYNAMITE IS YOURS</span><h1>{question.prompt}</h1>{question.hint && <p>{question.hint}</p>}
            <div className="student-answer-grid dynamite-answer-grid">{question.options.map((option, index) => { const wrong = wrongOptions.includes(option); const correct = passed && selected === option; return <button disabled={passed || wrong || remaining <= 0} className={correct ? "correct" : wrong ? "wrong dynamite-used" : ""} onClick={() => void onAnswer(option)} key={`${question.dynamiteTurnId}-${option}`}><span>{String.fromCharCode(65 + index)}</span><b>{option}</b></button>; })}</div>
            {passed && <div className="student-feedback correct dynamite-pass-feedback"><AppIcon name="check-lg" /> PASS! Fuse reset.</div>}
            {!passed && remaining === 0 && <div className="student-feedback wrong">BOOM! Waiting for the room…</div>}
            {error && <div className="student-error">{error}</div>}
          </div>
        ) : (
          <div className={`dynamite-waiting-card ${alive ? "alive" : "eliminated"}`}>
            <div className="dynamite-mini-device"><AppIcon name={alive ? "fire" : "eye"} /></div>
            <span className="eyebrow">{alive ? nextId === credentials.playerId ? "YOU'RE NEXT" : "GET READY" : "YOU'RE OUT"}</span>
            <h1>{alive ? `${current?.name ?? "Someone"} has the Dynamite` : "Spectator mode"}</h1>
            <p>{alive ? nextId === credentials.playerId ? "Your turn is coming next. Be ready to answer." : `Next up: ${next?.name ?? "—"}` : "You can still follow the order and watch the final survivors."}</p>
            <div className={`student-timer ${(remaining ?? 99) <= 3 ? "urgent" : ""}`}><AppIcon name="clock" /> {remaining}s</div>
          </div>
        )}
        <StudentDynamiteQueue state={state} playerId={credentials.playerId} />
      </section>
    </main>
  );
}

function StudentDynamiteQueue({ state, playerId }: { state: DynamiteState; playerId: string }) {
  const alive = new Set(state.aliveIds);
  const nextId = nextAlivePlayerId(state);
  return <section className="dynamite-phone-queue"><div><span>Turn order</span><b>{state.aliveIds.length} alive</b></div><div>{state.order.map((player, index) => { const eliminated = !alive.has(player.id); const current = player.id === state.currentPlayerId; const next = player.id === nextId && !current; const me = player.id === playerId; return <span key={player.id} className={`${current ? "current" : ""} ${next ? "next" : ""} ${eliminated ? "eliminated" : ""} ${me ? "me" : ""}`}><i>{index + 1}</i><b>{player.name}{me ? " · you" : ""}</b><small>{eliminated ? "OUT" : current ? "NOW" : next ? "NEXT" : ""}</small></span>; })}</div></section>;
}

function StudentLiveSpaceBlaster({ question, selected, answerResult, correctAnswer, disabled, reducedMotion, onAnswer }: { question: LiveQuestion; selected: string | null; answerResult: LiveAnswerResult | null; correctAnswer: string | null; disabled: boolean; reducedMotion: boolean; onAnswer: (option: string) => Promise<void> }) {
  const [lane, setLane] = useState(0);
  useEffect(() => { setLane(0); }, [question.itemId]);
  const currentOption = question.options[lane];
  const shipLeft = `${((lane + 0.5) / Math.max(1, question.options.length)) * 100}%`;
  function targetState(option: string) {
    if (correctAnswer) return option === correctAnswer ? "hit" : selected === option ? "miss" : "";
    if (selected === option && answerResult) return answerResult.correct ? "hit" : "miss";
    return "";
  }
  return (
    <div className={`arcade-stage space-blaster ${reducedMotion ? "reduced-motion" : ""}`}>
      <div className="space-question"><small>BLAST THE MISSING LANGUAGE</small><strong>{question.prompt}</strong>{question.hint && <span>{question.hint}</span>}</div>
      <div className="space-arena"><div className="space-stars" aria-hidden="true" /><div className="space-target-grid" style={{ gridTemplateColumns: `repeat(${question.options.length}, minmax(0, 1fr))` }}>{question.options.map((option, index) => <button key={`${question.itemId}-${option}`} className={`space-target ${lane === index ? "aimed" : ""} ${targetState(option)}`} onClick={() => !disabled && setLane(index)} disabled={disabled} aria-label={`${lane === index ? "Aimed at " : "Aim at "}${option}`}><span className="target-ring" aria-hidden="true"><i /></span><b>{option}</b></button>)}</div><div className="space-ship" style={{ left: shipLeft }} aria-label={currentOption ? `Ship aimed at ${currentOption}` : "Space ship"}><span className="ship-cockpit" /><span className="ship-wing left" /><span className="ship-wing right" /><span className="ship-flame" /></div></div>
      <div className="arcade-controls space-controls"><button onClick={() => setLane((current) => Math.max(0, current - 1))} disabled={disabled || lane === 0} aria-label="Move ship left"><AppIcon name="arrow-left" /></button><button className="arcade-fire" onClick={() => currentOption && void onAnswer(currentOption)} disabled={disabled || !currentOption}><AppIcon name="crosshair" /> FIRE</button><button onClick={() => setLane((current) => Math.min(question.options.length - 1, current + 1))} disabled={disabled || lane === question.options.length - 1} aria-label="Move ship right"><AppIcon name="arrow-right" /></button></div>
    </div>
  );
}

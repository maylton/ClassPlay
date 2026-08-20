import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { LIVE_MODE_CATALOG } from "@/lib/live/live-catalog";
import type { ActivitySet, GameSession, LiveGameMode, LivePlayer, Team } from "@/lib/types";
import { PlayerScoreboard, TeamScoreboard } from "./LiveScoreboards";

export function HostLobby({
  session,
  activity,
  players,
  teams,
  joinUrl,
  presenceCount,
  error,
  busy,
  liveQuestionTotal,
  liveGameMode,
  isDynamite,
  onToggleLock,
  onCycleTeam,
  onRemovePlayer,
  onToggleSetting,
  onStart,
}: {
  session: GameSession;
  activity: ActivitySet;
  players: LivePlayer[];
  teams: Team[];
  joinUrl: string;
  presenceCount: number;
  error: string;
  busy: boolean;
  liveQuestionTotal: number;
  liveGameMode: LiveGameMode;
  isDynamite: boolean;
  onToggleLock: () => void;
  onCycleTeam: (player: LivePlayer) => void;
  onRemovePlayer: (playerId: string) => void;
  onToggleSetting: (key: "leaderboardEnabled" | "timerEnabled") => void;
  onStart: () => void;
}) {
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
          <button className={`button ${session.locked ? "button-primary" : "button-soft"}`} onClick={onToggleLock}><AppIcon name={session.locked ? "lock" : "unlock"} /> {session.locked ? "Room locked" : "Lock room"}</button>
        </div>
        <div className="lobby-players-panel">
          <div className="lobby-heading"><div><span className="eyebrow">{LIVE_MODE_CATALOG[liveGameMode].label} · Live</span><h1>{activity.title}</h1></div><span className="player-count-badge">{players.length} joined</span></div>
          <div className="lobby-player-grid">
            {players.map((player) => <div className="lobby-player" key={player.id} style={player.teamId ? { borderColor: teams.find((team) => team.id === player.teamId)?.color } : undefined}><span>{player.nickname.slice(0,1).toUpperCase()}</span><b>{player.nickname}</b>{session.mode === "team" && !isDynamite && <button onClick={() => onCycleTeam(player)}>{teams.find((team) => team.id === player.teamId)?.name ?? "Team"} <AppIcon name="arrow-repeat" /></button>}<button className="kick-player" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.nickname}`}><AppIcon name="x-lg" /></button></div>)}
            {!players.length && <div className="empty-lobby"><span><AppIcon name="people" /></span><strong>Waiting for students…</strong><p>Names will appear here as they join.</p></div>}
          </div>
          {session.mode === "team" && !isDynamite && <TeamScoreboard teams={teams} players={players} compact />}
          {isDynamite && <div className="dynamite-lobby-rule"><AppIcon name="fire" /><div><b>{session.settings.dynamiteTimerSeconds ?? 10}s fuse · last survivor wins</b><span>The turn order will be shuffled when the game starts and will stay visible to everyone.</span></div></div>}
          <div className="lobby-controls"><div>{!isDynamite && <><button className={`toggle-chip ${session.settings.timerEnabled ? "on" : ""}`} onClick={() => onToggleSetting("timerEnabled")}><AppIcon name="clock" /> Timer {session.settings.timerEnabled ? "on" : "off"}</button><button className={`toggle-chip ${session.settings.leaderboardEnabled ? "on" : ""}`} onClick={() => onToggleSetting("leaderboardEnabled")}><AppIcon name="trophy" /> Ranking {session.settings.leaderboardEnabled ? "on" : "off"}</button></>}</div><button className="button button-primary button-large" disabled={busy || liveQuestionTotal === 0 || (isDynamite && players.length < 2)} onClick={onStart}>Start {LIVE_MODE_CATALOG[liveGameMode].label} <AppIcon name="arrow-right" /></button></div>
          {isDynamite && players.length < 2 && <small className="dynamite-minimum">At least 2 students must join before Dynamite can start.</small>}
        </div>
      </section>
    </main>
  );
}

export function StandardHostStage({
  session,
  players,
  teams,
  scoreboard,
  currentAnswerCount,
  currentCorrect,
  questionTotal,
  hostRemaining,
  error,
  busy,
  onToggleLeaderboard,
  onReveal,
  onNext,
  onEnd,
}: {
  session: GameSession;
  players: LivePlayer[];
  teams: Team[];
  scoreboard: LivePlayer[];
  currentAnswerCount: number;
  currentCorrect?: string;
  questionTotal: number;
  hostRemaining: number | null;
  error: string;
  busy: boolean;
  onToggleLeaderboard: () => void;
  onReveal: () => void;
  onNext: () => void;
  onEnd: () => void;
}) {
  const liveMode = session.currentQuestion?.gameMode ?? session.settings.liveGameMode ?? "quiz";
  const liveEyebrow = `${LIVE_MODE_CATALOG[liveMode].label.toUpperCase()} · LIVE`;

  return (
    <main className="host-room live-playing-screen">
      <header className="live-host-header"><Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link><div className="host-round-meta"><span>Room {session.roomCode}</span><span>{players.length} students</span><span>{currentAnswerCount}/{players.length} answered</span>{session.settings.timerEnabled && <span className={`student-timer ${(hostRemaining ?? 99) <= 5 ? "urgent" : ""}`}><AppIcon name="clock" /> {hostRemaining ?? session.settings.timerSeconds}s</span>}</div><div><button className={`toggle-chip ${session.settings.leaderboardEnabled ? "on" : ""}`} onClick={onToggleLeaderboard} aria-label="Toggle leaderboard"><AppIcon name="trophy" /></button><SettingsPanel compact /></div></header>
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
            {session.state === "playing" ? <button className="button button-soft button-large" disabled={busy} onClick={onReveal}>Reveal answer now</button> : <button className="button button-primary button-large" disabled={busy} onClick={onNext}>{session.currentItemIndex + 1 >= questionTotal ? <>Finish game <AppIcon name="arrow-right" /></> : <>Next question <AppIcon name="arrow-right" /></>}</button>}
            <button className="text-danger" disabled={busy} onClick={onEnd}>End session</button>
          </div>
        </div>
        {session.settings.leaderboardEnabled && <aside className="live-score-panel"><span className="eyebrow">SCOREBOARD</span>{session.mode === "team" ? <TeamScoreboard teams={teams} players={players} /> : <PlayerScoreboard players={scoreboard} />}</aside>}
      </section>
    </main>
  );
}

export function StandardHostFinal({ session, players, teams, scoreboard, questionTotal, liveGameMode, activityId }: {
  session: GameSession;
  players: LivePlayer[];
  teams: Team[];
  scoreboard: LivePlayer[];
  questionTotal: number;
  liveGameMode: LiveGameMode;
  activityId: string;
}) {
  return (
    <main className="host-room host-results">
      <header className="live-host-header"><Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link><div><span>Room {session.roomCode}</span><SettingsPanel compact /></div></header>
      <section className="final-live-card"><span className="completion-burst"><AppIcon name="trophy" /></span><span className="eyebrow">Live session complete</span><h1>Nice work, class!</h1><p>{players.length} students · {questionTotal} questions · {LIVE_MODE_CATALOG[liveGameMode].label}</p>
        {session.settings.leaderboardEnabled && (session.mode === "team" ? <TeamScoreboard teams={teams} players={players} /> : <PlayerScoreboard players={scoreboard} />)}
        <div className="final-live-actions"><Link href={`/host/new?activity=${activityId}`} className="button button-primary button-large"><AppIcon name="arrow-repeat" /> Play again</Link><Link href="/dashboard" className="button button-soft button-large">Back to library</Link></div>
      </section>
    </main>
  );
}

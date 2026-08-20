import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import type { GameSession, WildcardGridQuestionSource, WildcardGridState } from "@/lib/types";

function teamById(state: WildcardGridState, teamId: string) {
  return state.teams.find((team) => team.id === teamId);
}

function sourceLabel(source: WildcardGridQuestionSource | "prompt-answer") {
  if (source === "gap-fill") return "Fill the Gaps";
  if (source === "quiz") return "Quiz";
  if (source === "prompt-answer") return "Prompt ↔ Answer";
  return "Smart Mix";
}

function sourceIcon(source: WildcardGridQuestionSource | "prompt-answer") {
  if (source === "gap-fill") return "pencil-square";
  if (source === "quiz") return "question-circle";
  if (source === "prompt-answer") return "shuffle";
  return "stars";
}

function ScoreStrip({ state }: { state: WildcardGridState }) {
  return (
    <div className="wildcard-score-strip">
      {state.teamOrder.map((teamId) => {
        const team = teamById(state, teamId);
        const active = teamId === state.activeTeamId && state.phase !== "finished";
        const score = state.teamScores[teamId] ?? 0;
        return (
          <div className={`wildcard-team-score ${active ? "active" : ""}`} style={{ "--team-color": team?.color ?? "#6c7b73" } as React.CSSProperties} key={teamId}>
            <span>{team?.name ?? "Team"}</span>
            <strong key={score}>{score}</strong>
            <div>{state.teamShields[teamId] && <i title="Shield ready"><AppIcon name="shield-check" /></i>}{state.teamDoubleNext[teamId] && <i title="Next correct answer is doubled"><AppIcon name="x-diamond" /></i>}</div>
          </div>
        );
      })}
    </div>
  );
}

export function WildcardGridHostStage({
  session,
  state,
  currentCorrect,
  busy,
  error,
  onTile,
  onMark,
  onContinueResult,
  onResolveWildcard,
  onTieWinner,
  onFinish,
}: {
  session: GameSession;
  state: WildcardGridState;
  currentCorrect?: string;
  busy: boolean;
  error: string;
  onTile: (tileNumber: number) => void;
  onMark: (correct: boolean) => void;
  onContinueResult: () => void;
  onResolveWildcard: (targetTeamId?: string) => void;
  onTieWinner: (teamId: string) => void;
  onFinish: () => void;
}) {
  const activeTeam = teamById(state, state.activeTeamId);
  const pending = state.pendingWildcard;
  const rankings = [...state.teams].sort((a, b) => (state.teamScores[b.id] ?? 0) - (state.teamScores[a.id] ?? 0));
  const winner = state.winnerTeamId ? teamById(state, state.winnerTeamId) : null;
  const configuredSource = session.settings.wildcardGridSource ?? "smart";
  const visibleSource = session.currentQuestion?.sourceMode ?? configuredSource;

  return (
    <main
      className={`wildcard-host wildcard-phase-${state.phase}`}
      style={{ "--active-team-color": activeTeam?.color ?? "#65d6a4" } as React.CSSProperties}
    >
      <header className="wildcard-host-header">
        <Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link>
        <div><span>Room {session.roomCode}</span><strong><AppIcon name="grid-3x3-gap-fill" /> Wildcard Grid</strong><span className="wildcard-header-source"><AppIcon name={sourceIcon(visibleSource)} /> {sourceLabel(visibleSource)}</span></div>
        <button className="text-danger" disabled={busy} onClick={onFinish}>End session</button>
      </header>

      <ScoreStrip state={state} />
      {error && <div className="alert-error live-alert">{error}</div>}

      {state.phase === "board" && (
        <section className="wildcard-board-stage">
          <div className="wildcard-turn-heading">
            <span className="eyebrow">PICK A TILE</span>
            <h1 style={{ color: activeTeam?.color }}>{activeTeam?.name ?? "Team"}&apos;s turn</h1>
            <p>Choose any unopened number. Every tile has a question — some have something else underneath.</p>
          </div>
          <div className={`wildcard-board size-${state.size}`}>
            {state.tiles.map((tile, index) => (
              <button
                key={tile.number}
                disabled={busy || tile.opened}
                className={`${tile.opened ? "opened" : ""} ${tile.resolved ? "resolved" : ""}`}
                style={{ "--tile-order": index } as React.CSSProperties}
                onClick={() => onTile(tile.number)}
                aria-label={tile.opened ? `Tile ${tile.number} completed` : `Open tile ${tile.number}`}
              >
                {tile.resolved ? <><AppIcon name="check-lg" /><small>{tile.number}</small></> : <strong>{tile.number}</strong>}
              </button>
            ))}
          </div>
          <div className="wildcard-board-progress"><strong>{state.tiles.filter((tile) => tile.resolved).length}</strong><span>of {state.size} tiles completed</span></div>
        </section>
      )}

      {state.phase === "question" && session.currentQuestion && (
        <section className="wildcard-question-stage">
          <div className="wildcard-question-kicker"><span>Tile {state.currentTileNumber}</span><b style={{ color: activeTeam?.color }}>{activeTeam?.name}</b></div>
          <div className="wildcard-question-source"><AppIcon name={sourceIcon(visibleSource)} /> {sourceLabel(visibleSource)}</div>
          {session.currentQuestion.imageUrl && <ActivityImage refValue={session.currentQuestion.imageUrl} alt={session.currentQuestion.prompt} className="wildcard-question-image" />}
          <span className="eyebrow">ANSWER OUT LOUD</span>
          <h1>{session.currentQuestion.prompt}</h1>
          <p>Talk it through as a team. The teacher marks the answer.</p>
          <div className="wildcard-teacher-mark">
            <button className="wildcard-wrong" disabled={busy} onClick={() => onMark(false)}><AppIcon name="x-lg" /> Not quite <small>+0</small></button>
            <button className="wildcard-correct" disabled={busy} onClick={() => onMark(true)}><AppIcon name="check-lg" /> Correct <small>{state.teamDoubleNext[state.activeTeamId] ? "+40" : "+20"}</small></button>
          </div>
        </section>
      )}

      {state.phase === "result" && (
        <section className={`wildcard-result-stage ${state.lastAnswerCorrect ? "correct" : "wrong"}`}>
          <span className="wildcard-result-icon"><AppIcon name={state.lastAnswerCorrect ? "check-circle-fill" : "x-circle-fill"} /></span>
          <span className="eyebrow">{state.lastAnswerCorrect ? "NICE WORK" : "NOT THIS TIME"}</span>
          <h1 className="wildcard-score-pop">{state.lastAnswerCorrect ? `+${state.lastBasePoints ?? 20} points` : "+0 points"}</h1>
          {currentCorrect && <div className="wildcard-answer-reveal"><small>Correct answer</small><strong>{currentCorrect}</strong></div>}
          {pending && <div className="wildcard-hidden-tease"><AppIcon name="stars" /><span>There&apos;s something hidden under Tile {state.currentTileNumber}…</span></div>}
          <button className="button button-primary button-large" disabled={busy} onClick={onContinueResult}>{pending ? <>Reveal the Wildcard <AppIcon name="arrow-right" /></> : <>Back to the board <AppIcon name="arrow-right" /></>}</button>
        </section>
      )}

      {state.phase === "wildcard" && pending && (
        <section className={`wildcard-reveal-stage tone-${pending.tone}`}>
          <div className="wildcard-card-burst"><span><AppIcon name={pending.tone === "positive" ? "stars" : pending.tone === "chaos" ? "lightning-charge-fill" : pending.tone === "risk" ? "exclamation-triangle-fill" : "shuffle"} /></span></div>
          <span className="eyebrow">WILDCARD FOUND</span>
          <h1>{pending.title}</h1>
          <p>{pending.description}</p>
          {pending.requiresTarget ? (
            <div className="wildcard-targets">
              <small>CHOOSE ANOTHER TEAM</small>
              <div>{state.teamOrder.filter((teamId) => teamId !== state.activeTeamId).map((teamId) => { const team = teamById(state, teamId); return <button disabled={busy} style={{ "--team-color": team?.color ?? "#6c7b73" } as React.CSSProperties} onClick={() => onResolveWildcard(teamId)} key={teamId}><span>{team?.name ?? "Team"}</span><strong>{state.teamScores[teamId] ?? 0} pts</strong></button>; })}</div>
            </div>
          ) : <button className="button button-primary button-large" disabled={busy} onClick={() => onResolveWildcard()}>Apply Wildcard <AppIcon name="stars" /></button>}
        </section>
      )}

      {state.phase === "finished" && (
        <section className="wildcard-final-stage">
          {winner ? <><span className="wildcard-final-trophy"><AppIcon name="trophy-fill" /></span><span className="eyebrow">WILDCARD GRID CHAMPIONS</span><h1 style={{ color: winner.color }}>{winner.name}</h1><strong className="wildcard-winning-score">{state.teamScores[winner.id] ?? 0} points</strong></> : <><span className="wildcard-final-trophy tie"><AppIcon name="lightning-charge-fill" /></span><span className="eyebrow">SUDDEN DEATH</span><h1>We have a tie.</h1><p>Ask one extra question with no Wildcard. Then choose the tied team that gets it first.</p><div className="wildcard-tie-buttons">{state.tiedTeamIds?.map((teamId) => { const team = teamById(state, teamId); return <button disabled={busy} style={{ "--team-color": team?.color ?? "#6c7b73" } as React.CSSProperties} onClick={() => onTieWinner(teamId)} key={teamId}>{team?.name ?? "Team"}</button>; })}</div></>}
          <div className="wildcard-final-ranking">{rankings.map((team, index) => <div key={team.id} style={{ "--team-color": team.color } as React.CSSProperties}><span>{index + 1}</span><b>{team.name}</b><strong>{state.teamScores[team.id] ?? 0}</strong></div>)}</div>
          {winner && <button className="button button-primary button-large" disabled={busy} onClick={onFinish}>Finish session <AppIcon name="arrow-right" /></button>}
        </section>
      )}
    </main>
  );
}

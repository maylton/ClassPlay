import { AppIcon } from "@/components/AppIcon";
import type { WildcardGridState } from "@/lib/types";

function teamById(state: WildcardGridState, teamId?: string | null) {
  return state.teams.find((team) => team.id === teamId);
}

export function StudentWildcardGridStage({
  nickname,
  playerTeamId,
  state,
  connection,
  error,
}: {
  nickname: string;
  playerTeamId?: string | null;
  state: WildcardGridState;
  connection: string;
  error: string;
}) {
  const myTeam = teamById(state, playerTeamId);
  const activeTeam = teamById(state, state.activeTeamId);
  const myTurn = Boolean(playerTeamId && playerTeamId === state.activeTeamId && state.phase !== "finished");
  const winner = teamById(state, state.winnerTeamId);

  return (
    <main className="student-live-screen wildcard-student-screen">
      <header className="student-live-header"><div><span>{nickname}</span>{myTeam && <b style={{ color: myTeam.color }}>{myTeam.name}</b>}</div><strong>{myTeam ? `${state.teamScores[myTeam.id] ?? 0} pts` : "Wildcard Grid"}</strong><span className="connection-pill">● {connection}</span></header>
      <section className="wildcard-student-card">
        <div className="wildcard-phone-scores">
          {state.teamOrder.map((teamId) => {
            const team = teamById(state, teamId);
            return <div className={`${teamId === playerTeamId ? "mine" : ""} ${teamId === state.activeTeamId ? "active" : ""}`} style={{ "--team-color": team?.color ?? "#6c7b73" } as React.CSSProperties} key={teamId}><span>{team?.name ?? "Team"}</span><strong>{state.teamScores[teamId] ?? 0}</strong></div>;
          })}
        </div>

        {state.phase === "board" && <><span className="wildcard-phone-icon"><AppIcon name={myTurn ? "grid-3x3-gap-fill" : "eye"} /></span><span className="eyebrow">{myTurn ? "YOUR TEAM’S TURN" : `${activeTeam?.name ?? "Another team"} is choosing`}</span><h1>{myTurn ? "Pick a tile together!" : "Watch the board."}</h1><p>{myTurn ? "Talk with your team and tell the teacher which number you want." : "The next tile will appear on the projector."}</p></>}

        {state.phase === "question" && <><span className="wildcard-phone-icon"><AppIcon name="chat-square-text" /></span><span className="eyebrow">TILE {state.currentTileNumber}</span><h1>{myTurn ? "Talk it through." : `${activeTeam?.name ?? "The team"} is answering.`}</h1><p>{myTurn ? "Discuss the question with your team and answer out loud. No need to tap anything here." : "Follow the question on the projector."}</p></>}

        {state.phase === "result" && <><span className={`wildcard-phone-icon ${state.lastAnswerCorrect ? "correct" : "wrong"}`}><AppIcon name={state.lastAnswerCorrect ? "check-circle-fill" : "x-circle-fill"} /></span><span className="eyebrow">ANSWER CHECKED</span><h1>{state.lastAnswerCorrect ? `+${state.lastBasePoints ?? 20} points` : "+0 points"}</h1><p>{state.pendingWildcard ? "Wait — there may be something under this tile…" : "The next team is almost up."}</p></>}

        {state.phase === "wildcard" && state.pendingWildcard && <><span className="wildcard-phone-icon wildcard"><AppIcon name="stars" /></span><span className="eyebrow">WILDCARD!</span><h1>{state.pendingWildcard.title}</h1><p>{state.pendingWildcard.description}</p><small>Watch the projector while the teacher resolves it.</small></>}

        {state.phase === "finished" && <><span className="wildcard-phone-icon winner"><AppIcon name={winner ? "trophy-fill" : "lightning-charge-fill"} /></span><span className="eyebrow">{winner ? "GAME COMPLETE" : "SUDDEN DEATH"}</span><h1>{winner ? (winner.id === playerTeamId ? "Your team won!" : `${winner.name} wins!`) : "It’s a tie!"}</h1><p>{winner ? `${winner.name} finished with ${state.teamScores[winner.id] ?? 0} points.` : "One final question will decide the winner."}</p></>}

        {myTeam && <div className="wildcard-phone-team" style={{ borderColor: myTeam.color }}><span>You’re on</span><strong>{myTeam.name}</strong>{state.teamShields[myTeam.id] && <small><AppIcon name="shield-check" /> Shield ready</small>}{state.teamDoubleNext[myTeam.id] && <small><AppIcon name="x-diamond" /> Next correct answer ×2</small>}</div>}
        {error && <div className="student-error">{error}</div>}
      </section>
    </main>
  );
}

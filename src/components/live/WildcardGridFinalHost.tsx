import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import type { WildcardGridState } from "@/lib/types";

export function WildcardGridFinalHost({ state, roomCode, activityId }: { state: WildcardGridState; roomCode: string; activityId: string }) {
  const rankings = [...state.teams].sort((a, b) => (state.teamScores[b.id] ?? 0) - (state.teamScores[a.id] ?? 0));
  const winner = state.winnerTeamId ? state.teams.find((team) => team.id === state.winnerTeamId) : rankings[0];
  return (
    <main className="wildcard-host wildcard-finalized-host">
      <header className="wildcard-host-header"><Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link><div><span>Room {roomCode}</span><strong><AppIcon name="grid-3x3-gap-fill" /> Wildcard Grid</strong></div><span /></header>
      <section className="wildcard-final-stage">
        <span className="wildcard-final-trophy"><AppIcon name="trophy-fill" /></span>
        <span className="eyebrow">LIVE SESSION COMPLETE</span>
        <h1 style={{ color: winner?.color }}>{winner?.name ?? "Great game!"}</h1>
        {winner && <strong className="wildcard-winning-score">{state.teamScores[winner.id] ?? 0} points</strong>}
        <div className="wildcard-final-ranking">{rankings.map((team, index) => <div key={team.id}><span>{index + 1}</span><b>{team.name}</b><strong>{state.teamScores[team.id] ?? 0}</strong></div>)}</div>
        <div className="final-live-actions"><Link href={`/host/new?activity=${activityId}&mode=wildcard-grid`} className="button button-primary button-large"><AppIcon name="arrow-repeat" /> Play again</Link><Link href="/dashboard" className="button button-soft button-large">Back to library</Link></div>
      </section>
    </main>
  );
}

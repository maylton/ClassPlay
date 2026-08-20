import { teamScore } from "@/lib/live/live-engine";
import type { LivePlayer, Team } from "@/lib/types";

export function PlayerScoreboard({ players }: { players: LivePlayer[] }) {
  return <div className="player-scoreboard">{players.map((player, index) => <div key={player.id}><span className="rank-number">{index + 1}</span><b>{player.nickname}</b><strong>{player.score}</strong></div>)}{!players.length && <p>No scores yet.</p>}</div>;
}

export function TeamScoreboard({ teams, players, compact = false }: { teams: Team[]; players: LivePlayer[]; compact?: boolean }) {
  const ranked = [...teams].sort((a, b) => teamScore(players, b.id) - teamScore(players, a.id));
  return <div className={`team-scoreboard ${compact ? "compact" : ""}`}>{ranked.map((team) => <div key={team.id} style={{ borderLeftColor: team.color }}><span style={{ background: team.color }} /><b>{team.name}</b><strong>{teamScore(players, team.id)}</strong><small>{players.filter((player) => player.teamId === team.id).length} players</small></div>)}</div>;
}

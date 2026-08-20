import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { nextAlivePlayerId } from "@/lib/live/live-engine";
import type { DynamiteState, GameSession } from "@/lib/types";
import { DynamiteFuse } from "./DynamiteFuse";

export function DynamiteHostStage({
  session,
  state,
  remaining,
  preciseRemaining,
  explosion,
  onEnd,
}: {
  session: GameSession;
  state: DynamiteState;
  remaining: number;
  preciseRemaining: number;
  explosion: string | null;
  onEnd: () => void;
}) {
  const current = state.order.find((player) => player.id === state.currentPlayerId);
  const nextId = nextAlivePlayerId(state);
  const next = state.order.find((player) => player.id === nextId);
  const total = session.settings.dynamiteTimerSeconds ?? 10;
  const fusePercent = Math.max(0, Math.min(100, (preciseRemaining / total) * 100));

  return (
    <main className={`host-room dynamite-host-screen ${remaining <= 3 ? "dynamite-critical" : ""} ${explosion ? "is-exploding" : ""}`}>
      <header className="live-host-header dynamite-header"><Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link><div className="host-round-meta"><span>Room {session.roomCode}</span><span>{state.aliveIds.length} alive</span><span>Turn {state.turnNumber}</span></div><button className="text-danger" onClick={onEnd}>End session</button></header>
      <section className="dynamite-host-layout">
        <div className="dynamite-main-stage">
          {explosion ? (
            <div className="dynamite-boom"><strong>BOOM!</strong><span>{explosion} is out!</span></div>
          ) : (
            <>
              <span className="eyebrow">DYNAMITE · LIVE</span>
              <h1 className="dynamite-player-call">{current?.name ?? "Player"}&apos;s turn!</h1>
              <div className="dynamite-device" aria-label={`Dynamite fuse: ${remaining} seconds`}>
                <div className="dynamite-sticks"><i /><i /><i /></div>
                <DynamiteFuse percent={fusePercent} />
                <b>{remaining}</b><small>SECONDS</small>
              </div>
              <div className="dynamite-fuse-progress"><span style={{ width: `${fusePercent}%` }} /></div>
              <div className="dynamite-host-question"><small>ANSWER ON YOUR PHONE</small><h2>{session.currentQuestion?.prompt}</h2>{session.currentQuestion?.hint && <p>{session.currentQuestion.hint}</p>}</div>
              <div className="dynamite-next-call"><span>Next up</span><strong>{next?.name ?? "—"}</strong></div>
            </>
          )}
        </div>
        <DynamiteQueue state={state} />
      </section>
    </main>
  );
}

function DynamiteQueue({ state }: { state: DynamiteState }) {
  const alive = new Set(state.aliveIds);
  const nextId = nextAlivePlayerId(state);
  return (
    <aside className="dynamite-queue-panel">
      <div><span className="eyebrow">TURN ORDER</span><b>{state.aliveIds.length} still alive</b></div>
      <div className="dynamite-queue-list">
        {state.order.map((player, index) => {
          const eliminated = !alive.has(player.id);
          const current = player.id === state.currentPlayerId;
          const next = player.id === nextId && !current;
          return <div key={player.id} className={`${current ? "current" : ""} ${next ? "next" : ""} ${eliminated ? "eliminated" : ""}`}><span>{index + 1}</span><strong>{player.name}</strong><small>{eliminated ? "OUT" : current ? "DYNAMITE" : next ? "NEXT" : "READY"}</small></div>;
        })}
      </div>
    </aside>
  );
}

export function DynamiteFinalHost({ roomCode, winner, activityId }: { roomCode: string; winner: string; activityId: string }) {
  return (
    <main className="host-room host-results dynamite-final-screen">
      <header className="live-host-header"><Link href="/dashboard" className="play-brand"><b>C</b><span>ClassPlay</span></Link><span>Room {roomCode}</span></header>
      <section className="final-live-card dynamite-winner-card"><div className="dynamite-winner-burst"><AppIcon name="trophy" /></div><span className="eyebrow">LAST ONE STANDING</span><h1>{winner} wins!</h1><p>The Dynamite made it around the room. One survivor remains.</p><div className="final-live-actions"><Link href={`/host/new?activity=${activityId}`} className="button button-primary button-large"><AppIcon name="arrow-repeat" /> Play again</Link><Link href="/dashboard" className="button button-soft button-large">Back to library</Link></div></section>
    </main>
  );
}

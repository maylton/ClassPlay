import { AppIcon } from "@/components/AppIcon";
import { nextAlivePlayerId } from "@/lib/live/live-engine";
import type { DynamiteState, LiveQuestion } from "@/lib/types";

export function StudentDynamiteStage({
  playerId,
  nickname,
  question,
  state,
  remaining,
  wrongOptions,
  selected,
  passed,
  shake,
  explosionName,
  connection,
  error,
  onAnswer,
}: {
  playerId: string;
  nickname: string;
  question: LiveQuestion;
  state: DynamiteState;
  remaining: number;
  wrongOptions: string[];
  selected: string | null;
  passed: boolean;
  shake: boolean;
  explosionName: string | null;
  connection: string;
  error: string;
  onAnswer: (option: string) => Promise<void>;
}) {
  const alive = state.aliveIds.includes(playerId);
  const active = question.activePlayerId === playerId && alive;
  const nextId = nextAlivePlayerId(state);
  const next = state.order.find((player) => player.id === nextId);
  const current = state.order.find((player) => player.id === state.currentPlayerId);
  // The RPC subtracts three seconds from the authoritative round clock for every
  // distinct wrong answer. Mirror that penalty immediately on the active phone
  // while the realtime session update reaches the host.
  const effectiveRemaining = Math.max(0, remaining - wrongOptions.length * 3);

  return (
    <main className={`student-live-screen dynamite-student-screen ${shake ? "dynamite-shake" : ""} ${effectiveRemaining <= 3 ? "dynamite-critical" : ""}`}>
      <header className="student-live-header"><div><span>{nickname}</span><b>{alive ? "ALIVE" : "SPECTATING"}</b></div><span className="connection-pill">● {connection}</span></header>
      <section className="dynamite-student-layout">
        {explosionName ? (
          <div className="dynamite-phone-boom"><strong>BOOM!</strong><span>{explosionName} is out!</span></div>
        ) : active ? (
          <div className="dynamite-answer-card">
            <div className="dynamite-phone-timer"><span><AppIcon name="fire" /></span><strong>{effectiveRemaining}</strong><small>SECONDS</small></div>
            <span className="eyebrow">THE DYNAMITE IS YOURS</span><h1>{question.prompt}</h1>{question.hint && <p>{question.hint}</p>}
            <div className="student-answer-grid dynamite-answer-grid">{question.options.map((option, index) => { const wrong = wrongOptions.includes(option); const correct = passed && selected === option; return <button disabled={passed || wrong || effectiveRemaining <= 0} className={correct ? "correct" : wrong ? "wrong dynamite-used" : ""} onClick={() => void onAnswer(option)} key={`${question.dynamiteTurnId}-${option}`}><span>{String.fromCharCode(65 + index)}</span><b>{option}</b></button>; })}</div>
            {passed && <div className="student-feedback correct dynamite-pass-feedback"><AppIcon name="check-lg" /> PASS! Fuse reset.</div>}
            {!passed && wrongOptions.length > 0 && effectiveRemaining > 0 && <div className="student-feedback wrong">Wrong answer: −3 seconds. {Math.max(0, 3 - wrongOptions.length)} {wrongOptions.length === 2 ? "try" : "tries"} left.</div>}
            {!passed && effectiveRemaining === 0 && <div className="student-feedback wrong">BOOM! Waiting for the room…</div>}
            {error && <div className="student-error">{error}</div>}
          </div>
        ) : (
          <div className={`dynamite-waiting-card ${alive ? "alive" : "eliminated"}`}>
            <div className="dynamite-mini-device"><AppIcon name={alive ? "fire" : "eye"} /></div>
            <span className="eyebrow">{alive ? nextId === playerId ? "YOU'RE NEXT" : "GET READY" : "YOU'RE OUT"}</span>
            <h1>{alive ? `${current?.name ?? "Someone"} has the Dynamite` : "Spectator mode"}</h1>
            <p>{alive ? nextId === playerId ? "Your turn is coming next. Be ready to answer." : `Next up: ${next?.name ?? "—"}` : "You can still follow the order and watch the final survivors."}</p>
            <div className={`student-timer ${effectiveRemaining <= 3 ? "urgent" : ""}`}><AppIcon name="clock" /> {effectiveRemaining}s</div>
          </div>
        )}
        <StudentDynamiteQueue state={state} playerId={playerId} />
      </section>
    </main>
  );
}

function StudentDynamiteQueue({ state, playerId }: { state: DynamiteState; playerId: string }) {
  const alive = new Set(state.aliveIds);
  const nextId = nextAlivePlayerId(state);
  return <section className="dynamite-phone-queue"><div><span>Turn order</span><b>{state.aliveIds.length} alive</b></div><div>{state.order.map((player, index) => { const eliminated = !alive.has(player.id); const current = player.id === state.currentPlayerId; const next = player.id === nextId && !current; const me = player.id === playerId; return <span key={player.id} className={`${current ? "current" : ""} ${next ? "next" : ""} ${eliminated ? "eliminated" : ""} ${me ? "me" : ""}`}><i>{index + 1}</i><b>{player.name}{me ? " · you" : ""}</b><small>{eliminated ? "OUT" : current ? "NOW" : next ? "NEXT" : ""}</small></span>; })}</div></section>;
}
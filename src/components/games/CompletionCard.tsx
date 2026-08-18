import { AppIcon } from "@/components/AppIcon";

export function CompletionCard({ score, correct, total, onReplay }: { score: number; correct: number; total: number; onReplay: () => void }) {
  const accuracy = total ? Math.round((correct / total) * 100) : 100;
  return <div className="completion-card"><div className="completion-burst"><AppIcon name="check-circle-fill" /></div><span className="eyebrow">Round complete</span><h2>Nice work!</h2><p>You scored <strong>{score}</strong> points with <strong>{accuracy}%</strong> accuracy.</p><div className="completion-stats"><div><b>{correct}</b><span>Correct</span></div><div><b>{total}</b><span>Questions</span></div><div><b>{score}</b><span>Points</span></div></div><button className="button button-primary button-large" onClick={onReplay}><AppIcon name="arrow-repeat" /> Play again</button></div>;
}

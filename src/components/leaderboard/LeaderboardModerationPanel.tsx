"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { GAME_MODE_CATALOG } from "@/lib/game-catalog";
import {
  deletePracticeScore,
  loadRecentPracticeScores,
  type PracticeLeaderboardEntry,
} from "@/lib/repositories/leaderboard-repository";

export function LeaderboardModerationPanel({ activityId, onClose }: { activityId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<PracticeLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void loadRecentPracticeScores(activityId)
      .then((rows) => active && setEntries(rows))
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Could not load scores."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [activityId]);

  async function remove(entry: PracticeLeaderboardEntry) {
    if (!window.confirm(`Remove "${entry.playerName}" (${entry.score} pts) from the leaderboard?`)) return;
    setRemoving(entry.id); setError("");
    try {
      await deletePracticeScore(entry.id);
      setEntries((current) => current.filter((row) => row.id !== entry.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this score.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="practice-leaderboard-backdrop" role="dialog" aria-modal="true" aria-labelledby="leaderboard-moderation-title">
      <section className="practice-leaderboard-card">
        <div className="practice-board-heading">
          <div><small>PRACTICE LINK</small><h3 id="leaderboard-moderation-title">Moderate leaderboards</h3></div>
          <span><AppIcon name="shield-check" /></span>
        </div>
        <p>Newest scores first. Remove names that are inappropriate or results that look wrong.</p>
        {error && <div className="student-error practice-leaderboard-error">{error}</div>}
        <div className="practice-ranking practice-moderation-list" aria-live="polite">
          {loading ? <div className="practice-ranking-empty">Loading scores…</div> : entries.length ? entries.map((entry) => (
            <div className="practice-ranking-row moderation" key={entry.id}>
              <span className="practice-rank"><AppIcon name={GAME_MODE_CATALOG[entry.game]?.icon ?? "controller"} /></span>
              <strong>{entry.playerName}</strong>
              <small>{entry.correct}/{entry.total} · {new Date(entry.createdAt).toLocaleDateString()}</small>
              <b>{entry.score}</b>
              <button
                type="button"
                className="text-danger"
                aria-label={`Remove ${entry.playerName}`}
                disabled={removing === entry.id}
                onClick={() => void remove(entry)}
              >
                <AppIcon name="trash" />
              </button>
            </div>
          )) : <div className="practice-ranking-empty"><AppIcon name="stars" /> No scores yet.</div>}
        </div>
        <div className="practice-result-actions">
          <button className="button button-soft button-large" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

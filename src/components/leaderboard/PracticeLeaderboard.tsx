"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { GAME_MODE_CATALOG } from "@/lib/game-catalog";
import {
  cleanPracticePlayerName,
  loadPracticeLeaderboard,
  submitPracticeScore,
  type PracticeLeaderboardEntry,
} from "@/lib/repositories/leaderboard-repository";
import type { GameType } from "@/lib/types";

interface PracticeLeaderboardProps {
  activityId: string;
  game: GameType;
  score: number;
  correct: number;
  total: number;
  onReplay: () => void;
  onOtherGames: () => void;
}

export function PracticeLeaderboard({
  activityId,
  game,
  score,
  correct,
  total,
  onReplay,
  onOtherGames,
}: PracticeLeaderboardProps) {
  const [name, setName] = useState("");
  const [leaders, setLeaders] = useState<PracticeLeaderboardEntry[]>([]);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const accuracy = total ? Math.round((correct / total) * 100) : 100;
  const gameInfo = GAME_MODE_CATALOG[game];

  useEffect(() => {
    let active = true;
    void loadPracticeLeaderboard(activityId, game)
      .then((entries) => active && setLeaders(entries))
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Could not load the leaderboard."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [activityId, game]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const playerName = cleanPracticePlayerName(name);
    if (!playerName) return setError("Enter your name to save this score.");
    setSaving(true); setError("");
    try {
      const entry = await submitPracticeScore({ activityId, game, playerName, score, correct, total });
      setSubmittedId(entry.id);
      setName(playerName);
      setLeaders(await loadPracticeLeaderboard(activityId, game));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this score.");
    } finally {
      setSaving(false);
    }
  }

  const inTopTen = Boolean(submittedId && leaders.some((entry) => entry.id === submittedId));

  return (
    <div className="practice-leaderboard-backdrop" role="dialog" aria-modal="true" aria-labelledby="practice-leaderboard-title">
      <section className="practice-leaderboard-card">
        <div className="practice-result-summary">
          <span className="practice-trophy"><AppIcon name="trophy" /></span>
          <div>
            <span className="eyebrow">{gameInfo.name} complete</span>
            <h2 id="practice-leaderboard-title">Your score: {score}</h2>
            <p>{correct}/{total} correct · {accuracy}% accuracy</p>
          </div>
        </div>

        {!submittedId ? (
          <form className="practice-name-form" onSubmit={submit}>
            <label htmlFor="practice-player-name">Put your name on the board</label>
            <div>
              <input
                id="practice-player-name"
                value={name}
                maxLength={24}
                autoComplete="nickname"
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                autoFocus
              />
              <button className="button button-primary" disabled={saving}>{saving ? "Saving…" : <>Save score <AppIcon name="arrow-right" /></>}</button>
            </div>
            <small>Only your name and game result are saved. No student account is required.</small>
          </form>
        ) : (
          <div className={`practice-saved-message ${inTopTen ? "top-ten" : ""}`}>
            <AppIcon name={inTopTen ? "award" : "check-circle-fill"} />
            <span>{inTopTen ? "You made the Top 10!" : "Score saved. Play again to climb into the Top 10."}</span>
          </div>
        )}

        {error && <div className="student-error practice-leaderboard-error">{error}</div>}

        <div className="practice-board-heading">
          <div><small>ALL-TIME</small><h3>Top 10 · {gameInfo.name}</h3></div>
          <span><AppIcon name="bar-chart-fill" /></span>
        </div>

        <div className="practice-ranking" aria-live="polite">
          {loading ? <div className="practice-ranking-empty">Loading scores…</div> : leaders.length ? leaders.map((entry, index) => (
            <div className={`practice-ranking-row ${entry.id === submittedId ? "current" : ""}`} key={entry.id}>
              <span className={`practice-rank rank-${index + 1}`}>{index + 1}</span>
              <strong>{entry.playerName}</strong>
              <small>{entry.correct}/{entry.total}</small>
              <b>{entry.score}</b>
            </div>
          )) : <div className="practice-ranking-empty"><AppIcon name="stars" /> Be the first name on this leaderboard.</div>}
        </div>

        <div className="practice-result-actions">
          <button className="button button-primary button-large" onClick={onReplay}><AppIcon name="arrow-repeat" /> Play again</button>
          <button className="button button-soft button-large" onClick={onOtherGames}>Other games</button>
        </div>
      </section>
    </div>
  );
}

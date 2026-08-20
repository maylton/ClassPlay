"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { buildArcadeRounds } from "@/lib/arcade-engine";
import { playArcadeTone } from "@/lib/arcade-audio";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";
import { SpaceBlasterRocket } from "./SpaceBlasterRocket";

export function SpaceBlasterGame({ activity, onComplete }: GameProps) {
  const { settings } = useClassroomSettings();
  const items = useMemo(() => getPlayableItemsForMode(activity.items, "space-blaster"), [activity.items]);
  const rounds = useMemo(() => buildArcadeRounds(items, 4), [items]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [lane, setLane] = useState(0);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [combo, setCombo] = useState(0);
  const [locked, setLocked] = useState(false);
  const [firedLane, setFiredLane] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [finished, setFinished] = useState(false);
  const round = rounds[roundIndex];

  const move = useCallback((delta: number) => {
    if (!round || locked) return;
    setLane((current) => Math.max(0, Math.min(round.options.length - 1, current + delta)));
  }, [locked, round]);

  const fire = useCallback(() => {
    if (!round || locked) return;
    const option = round.options[lane];
    if (!option) return;

    setLocked(true);
    setFiredLane(lane);
    playArcadeTone(settings.soundEnabled, "shot");

    const right = option === round.correctAnswer;
    const nextCombo = right ? combo + 1 : 0;
    const gained = right ? 120 + Math.min(5, combo) * 30 : 0;
    const nextScore = score + gained;
    const nextCorrect = correct + (right ? 1 : 0);

    setFeedback(right ? "correct" : "wrong");
    setCombo(nextCombo);
    setScore(nextScore);
    setCorrect(nextCorrect);
    window.setTimeout(() => playArcadeTone(settings.soundEnabled, right ? "correct" : "wrong"), 80);

    window.setTimeout(() => {
      const lastRound = roundIndex === rounds.length - 1;
      if (lastRound) {
        setFinished(true);
        onComplete(nextScore, nextCorrect, rounds.length);
        return;
      }
      setRoundIndex((current) => current + 1);
      setLane(0);
      setFiredLane(null);
      setFeedback(null);
      setLocked(false);
    }, settings.reducedMotion ? 350 : 720);
  }, [combo, correct, lane, locked, onComplete, round, roundIndex, rounds.length, score, settings.reducedMotion, settings.soundEnabled]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (["ArrowLeft", "ArrowRight", " ", "Enter", "a", "A", "d", "D"].includes(event.key)) event.preventDefault();
      if (event.key === "ArrowLeft" || event.key.toLocaleLowerCase() === "a") move(-1);
      if (event.key === "ArrowRight" || event.key.toLocaleLowerCase() === "d") move(1);
      if (event.key === " " || event.key === "Enter") fire();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fire, move]);

  function replay() {
    setRoundIndex(0);
    setLane(0);
    setScore(0);
    setCorrect(0);
    setCombo(0);
    setLocked(false);
    setFiredLane(null);
    setFeedback(null);
    setFinished(false);
  }

  if (!round) return <div className="empty-game"><span><AppIcon name="rocket-takeoff" /></span><h2>Space Blaster needs sentence targets.</h2><p>Add at least three full sentences and choose the missing word or expression in each one.</p></div>;
  if (finished) return <CompletionCard score={score} correct={correct} total={rounds.length} onReplay={replay} />;

  const shipLeft = `${((lane + .5) / Math.max(1, round.options.length)) * 100}%`;

  return (
    <div className={`arcade-stage space-blaster ${settings.reducedMotion ? "reduced-motion" : ""}`}>
      <div className="arcade-hud">
        <div><small>MISSION</small><strong>{roundIndex + 1}/{rounds.length}</strong></div>
        <div><small>SCORE</small><strong>{score}</strong></div>
        <div><small>COMBO</small><strong>{combo ? `×${combo}` : "—"}</strong></div>
      </div>

      <div className="space-question"><small>BLAST THE MISSING LANGUAGE</small><strong>{round.prompt}</strong></div>

      <div className="space-arena">
        <div className="space-stars" aria-hidden="true" />
        <div className="space-target-grid" style={{ gridTemplateColumns: `repeat(${round.options.length}, minmax(0, 1fr))` }}>
          {round.options.map((option, index) => {
            const fired = firedLane === index;
            const right = fired && option === round.correctAnswer;
            const wrong = fired && option !== round.correctAnswer;
            return (
              <button
                key={`${round.itemId}-${option}`}
                className={`space-target ${lane === index ? "aimed" : ""} ${right ? "hit" : ""} ${wrong ? "miss" : ""}`}
                onClick={() => !locked && setLane(index)}
                disabled={locked}
                aria-label={`${lane === index ? "Aimed at " : "Aim at "}${option}`}
              >
                <span className="target-ring" aria-hidden="true"><i /></span>
                <b>{option}</b>
              </button>
            );
          })}
        </div>

        {firedLane !== null && <span className={`space-laser ${feedback ?? ""}`} style={{ left: shipLeft }} aria-hidden="true" />}
        <div className="space-ship" style={{ left: shipLeft }} aria-label={`Ship aimed at ${round.options[lane]}`}>
          <SpaceBlasterRocket firing={firedLane !== null} feedback={feedback} reducedMotion={settings.reducedMotion} />
        </div>

        <div className="space-feedback" aria-live="polite">
          {feedback === "correct" && <span className="correct"><AppIcon name="stars" /> Perfect hit!</span>}
          {feedback === "wrong" && <span className="wrong">Target missed — answer: <b>{round.correctAnswer}</b></span>}
        </div>
      </div>

      <div className="arcade-controls space-controls">
        <button onClick={() => move(-1)} disabled={locked || lane === 0} aria-label="Move ship left"><AppIcon name="arrow-left" /></button>
        <button className="arcade-fire" onClick={fire} disabled={locked}><AppIcon name="crosshair" /> FIRE</button>
        <button onClick={() => move(1)} disabled={locked || lane === round.options.length - 1} aria-label="Move ship right"><AppIcon name="arrow-right" /></button>
      </div>
      <p className="arcade-key-help"><kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd> to aim · <kbd>Space</kbd> to fire</p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { useQuestionTimer } from "@/hooks/useQuestionTimer";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { playArcadeTone } from "@/lib/arcade-audio";
import {
  BUBBLE_BURST_ROUND_MS,
  buildBubbleBurstRounds,
  chooseBubbleBurstSource,
  createBubbleBurstLayout,
  resolveBubbleBurstHit,
} from "@/lib/bubble-burst-engine";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

export function BubbleBurstGame({ activity, onComplete }: GameProps) {
  const { settings } = useClassroomSettings();
  const quizItems = useMemo(() => getPlayableItemsForMode(activity.items, "quiz"), [activity.items]);
  const gapItems = useMemo(() => getPlayableItemsForMode(activity.items, "gap-fill"), [activity.items]);
  const source = useMemo(
    () => chooseBubbleBurstSource(activity.kind, quizItems.length, gapItems.length),
    [activity.kind, gapItems.length, quizItems.length],
  );
  const rounds = useMemo(() => {
    if (!source) return [];
    const sourceItems = source === "gap-fill" ? gapItems : quizItems;
    return buildBubbleBurstRounds(sourceItems, source);
  }, [gapItems, quizItems, source]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongOptions, setWrongOptions] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<"perfect" | "correct" | "wrong" | "timeout" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const round = rounds[roundIndex];
  const { elapsedMs, stop } = useQuestionTimer(round?.itemId ?? "bubble-empty");
  const layout = useMemo(() => createBubbleBurstLayout(round?.options.length ?? 0), [round?.options.length]);
  const remainingMs = Math.max(0, BUBBLE_BURST_ROUND_MS - elapsedMs);
  const remainingPercent = Math.max(0, Math.round((remainingMs / BUBBLE_BURST_ROUND_MS) * 100));

  const advance = useCallback((nextScore: number, nextCorrect: number) => {
    const lastRound = roundIndex === rounds.length - 1;
    if (lastRound) {
      setFinished(true);
      onComplete(nextScore, nextCorrect, rounds.length);
      return;
    }
    setRoundIndex((current) => current + 1);
    setWrongOptions([]);
    setLocked(false);
    setFeedback(null);
    setSelected(null);
  }, [onComplete, roundIndex, rounds.length]);

  const choose = useCallback((option: string) => {
    if (!round || locked || wrongOptions.includes(option)) return;

    if (option !== round.correctAnswer) {
      setWrongOptions((current) => current.includes(option) ? current : [...current, option]);
      setStreak(0);
      setFeedback("wrong");
      setSelected(option);
      playArcadeTone(settings.soundEnabled, "wrong");
      return;
    }

    setLocked(true);
    setSelected(option);
    const responseMs = stop();
    const hit = resolveBubbleBurstHit(responseMs, streak);
    const nextScore = score + hit.points;
    const nextCorrect = correctCount + 1;
    setScore(nextScore);
    setCorrectCount(nextCorrect);
    setStreak(hit.nextStreak);
    setFeedback(hit.perfect ? "perfect" : "correct");
    playArcadeTone(settings.soundEnabled, "correct");
    window.setTimeout(() => advance(nextScore, nextCorrect), settings.reducedMotion ? 260 : 620);
  }, [advance, correctCount, locked, round, score, settings.reducedMotion, settings.soundEnabled, stop, streak, wrongOptions]);

  const timeout = useCallback(() => {
    if (!round || locked || finished) return;
    stop();
    setLocked(true);
    setStreak(0);
    setFeedback("timeout");
    setSelected(null);
    playArcadeTone(settings.soundEnabled, "wrong");
    window.setTimeout(() => advance(score, correctCount), settings.reducedMotion ? 260 : 760);
  }, [advance, correctCount, finished, locked, round, score, settings.reducedMotion, settings.soundEnabled, stop]);

  useEffect(() => {
    if (remainingMs > 0 || !round || locked || finished) return;
    const id = window.setTimeout(timeout, 0);
    return () => window.clearTimeout(id);
  }, [finished, locked, remainingMs, round, timeout]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!round || locked || finished) return;
      const index = Number(event.key) - 1;
      if (index < 0 || index >= round.options.length) return;
      const option = round.options[index];
      if (!option || wrongOptions.includes(option)) return;
      event.preventDefault();
      choose(option);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [choose, finished, locked, round, wrongOptions]);

  function replay() {
    setRoundIndex(0);
    setScore(0);
    setCorrectCount(0);
    setStreak(0);
    setWrongOptions([]);
    setLocked(false);
    setFeedback(null);
    setSelected(null);
    setFinished(false);
  }

  if (!source || !rounds.length) {
    return <div className="empty-game"><span><AppIcon name="circle" /></span><h2>Bubble Burst needs more question-ready content.</h2><p>Add at least three usable Quiz pairs or three Gap Fill sentences.</p></div>;
  }

  if (finished) return <CompletionCard score={score} correct={correctCount} total={rounds.length} onReplay={replay} />;
  if (!round) return null;

  return (
    <div className={`arcade-stage bubble-burst ${settings.reducedMotion ? "reduced-motion" : ""}`}>
      <div className="arcade-hud bubble-hud">
        <div><small>ROUND</small><strong>{roundIndex + 1}/{rounds.length}</strong></div>
        <div><small>SCORE</small><strong>{score}</strong></div>
        <div><small>STREAK</small><strong>{streak ? `×${streak}` : "—"}</strong></div>
      </div>

      <div className="bubble-question">
        <div><small>{source === "gap-fill" ? "POP THE MISSING LANGUAGE" : "POP THE RIGHT ANSWER"}</small>{round.hint && <span>Hint: {round.hint}</span>}</div>
        <strong>{round.prompt}</strong>
        <div className="bubble-timer" aria-label={`${Math.ceil(remainingMs / 1000)} seconds remaining`}>
          <span style={{ width: `${remainingPercent}%` }} />
        </div>
      </div>

      <section className="bubble-arena" aria-label="Bubble Burst answer area">
        <div className="bubble-sheen" aria-hidden="true" />
        {round.options.map((option, index) => {
          const position = layout[index];
          const wrong = wrongOptions.includes(option);
          const right = locked && option === round.correctAnswer;
          const picked = selected === option;
          return (
            <button
              key={`${round.itemId}-${option}`}
              className={`answer-bubble bubble-${index + 1} ${wrong ? "popped-wrong" : ""} ${right ? "popped-right" : ""} ${picked ? "selected" : ""}`}
              style={position ? {
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: `${position.size}px`,
                height: `${position.size}px`,
                animationDuration: `${position.duration}s`,
                animationDelay: `${position.delay}s`,
              } : undefined}
              onClick={() => choose(option)}
              disabled={locked || wrong}
              aria-label={`Answer ${index + 1}: ${option}`}
            >
              <kbd>{index + 1}</kbd>
              <span>{option}</span>
              <i aria-hidden="true" />
            </button>
          );
        })}

        <div className="bubble-feedback" aria-live="polite">
          {feedback === "perfect" && <span className="perfect"><AppIcon name="stars" /> PERFECT POP!</span>}
          {feedback === "correct" && <span className="correct"><AppIcon name="check-circle-fill" /> Nice pop!</span>}
          {feedback === "wrong" && <span className="wrong"><AppIcon name="x-circle" /> Not that one — keep looking.</span>}
          {feedback === "timeout" && <span className="timeout"><AppIcon name="clock-history" /> Time! Answer: <b>{round.correctAnswer}</b></span>}
        </div>
      </section>

      <p className="arcade-key-help">Click or tap a bubble · keyboard <kbd>1</kbd>–<kbd>{round.options.length}</kbd></p>
    </div>
  );
}

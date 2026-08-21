"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { useQuestionTimer } from "@/hooks/useQuestionTimer";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { playArcadeTone } from "@/lib/arcade-audio";
import {
  TYPING_RUSH_ROUND_MS,
  buildTypingRushRounds,
  chooseTypingRushSource,
  resolveTypingRushCorrect,
  typingRushIsCorrect,
  typingRushIsNearMiss,
  typingRushTimePercent,
} from "@/lib/typing-rush-engine";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

type RushFeedback = "correct" | "near" | "wrong" | "timeout" | null;

export function TypingRushGame({ activity, onComplete }: GameProps) {
  const { settings } = useClassroomSettings();
  const quizItems = useMemo(() => getPlayableItemsForMode(activity.items, "quiz"), [activity.items]);
  const gapItems = useMemo(() => getPlayableItemsForMode(activity.items, "gap-fill"), [activity.items]);
  const source = useMemo(() => chooseTypingRushSource(activity.kind, quizItems.length, gapItems.length), [activity.kind, gapItems.length, quizItems.length]);
  const [runKey, setRunKey] = useState(0);
  const rounds = useMemo(() => source ? buildTypingRushRounds(source === "gap-fill" ? gapItems : quizItems, source) : [], [gapItems, quizItems, source]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [input, setInput] = useState("");
  const [attempt, setAttempt] = useState(1);
  const [feedback, setFeedback] = useState<RushFeedback>(null);
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const round = rounds[roundIndex];
  const timerKey = `${runKey}-${round?.itemId ?? "typing-empty"}`;
  const { elapsedMs, stop } = useQuestionTimer(timerKey);
  const timePercent = typingRushTimePercent(elapsedMs);

  useEffect(() => {
    if (!finished && !locked) inputRef.current?.focus();
  }, [finished, locked, roundIndex]);

  const advance = useCallback((nextScore: number, nextCorrect: number) => {
    if (roundIndex >= rounds.length - 1) {
      setFinished(true);
      onComplete(nextScore, nextCorrect, rounds.length);
      return;
    }
    setRoundIndex((current) => current + 1);
    setInput("");
    setAttempt(1);
    setFeedback(null);
    setLocked(false);
  }, [onComplete, roundIndex, rounds.length]);

  const failRound = useCallback((reason: "wrong" | "timeout") => {
    if (!round || locked) return;
    setLocked(true);
    stop();
    setStreak(0);
    setFeedback(reason);
    playArcadeTone(settings.soundEnabled, "wrong");
    window.setTimeout(() => advance(score, correctCount), settings.reducedMotion ? 280 : 980);
  }, [advance, correctCount, locked, round, score, settings.reducedMotion, settings.soundEnabled, stop]);

  useEffect(() => {
    if (!round || finished || locked || elapsedMs < TYPING_RUSH_ROUND_MS) return;
    const timeout = window.setTimeout(() => failRound("timeout"), 0);
    return () => window.clearTimeout(timeout);
  }, [elapsedMs, failRound, finished, locked, round]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!round || locked || !input.trim()) return;

    if (typingRushIsCorrect(input, round.correctAnswer)) {
      setLocked(true);
      const responseMs = stop();
      const result = resolveTypingRushCorrect(responseMs, streak, attempt);
      const nextScore = score + result.points;
      const nextCorrect = correctCount + 1;
      setScore(nextScore);
      setCorrectCount(nextCorrect);
      setStreak(result.nextStreak);
      setBestStreak((current) => Math.max(current, result.nextStreak));
      setFeedback("correct");
      playArcadeTone(settings.soundEnabled, "correct");
      window.setTimeout(() => advance(nextScore, nextCorrect), settings.reducedMotion ? 240 : 760);
      return;
    }

    if (attempt === 1) {
      const near = typingRushIsNearMiss(input, round.correctAnswer);
      setAttempt(2);
      setStreak(0);
      setFeedback(near ? "near" : "wrong");
      setInput("");
      playArcadeTone(settings.soundEnabled, "wrong");
      window.setTimeout(() => {
        setFeedback(null);
        inputRef.current?.focus();
      }, settings.reducedMotion ? 160 : 620);
      return;
    }

    failRound("wrong");
  }

  function replay() {
    setRunKey((current) => current + 1);
    setRoundIndex(0);
    setScore(0);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setInput("");
    setAttempt(1);
    setFeedback(null);
    setLocked(false);
    setFinished(false);
  }

  if (!source || !rounds.length) {
    return <div className="empty-game"><span><AppIcon name="keyboard" /></span><h2>Typing Rush needs question-ready content.</h2><p>Add at least three usable Quiz pairs or Gap Fill sentences.</p></div>;
  }

  if (finished) {
    return (
      <div className="typing-finish-shell">
        <div className="typing-final-banner"><span><AppIcon name="keyboard-fill" /></span><div><small>RUSH COMPLETE</small><strong>{correctCount}/{rounds.length} accurate</strong><p>Best typing streak ×{bestStreak}</p></div></div>
        <CompletionCard score={score} correct={correctCount} total={rounds.length} onReplay={replay} />
      </div>
    );
  }

  if (!round) return null;

  return (
    <div className={`arcade-stage typing-rush ${settings.reducedMotion ? "reduced-motion" : ""} ${timePercent <= 30 ? "danger-zone" : ""}`}>
      <div className="arcade-hud typing-hud">
        <div><small>ROUND</small><strong>{roundIndex + 1}/{rounds.length}</strong></div>
        <div><small>SCORE</small><strong>{score}</strong></div>
        <div><small>ACCURACY</small><strong>{roundIndex ? `${Math.round((correctCount / roundIndex) * 100)}%` : "—"}</strong></div>
        <div><small>STREAK</small><strong>{streak ? `×${streak}` : "—"}</strong></div>
      </div>

      <section className="typing-rush-stage">
        <div className="typing-speed-tunnel" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
        <div className="typing-rush-card">
          <div className="typing-rush-heading"><span><AppIcon name="lightning-charge-fill" /> TYPE BEFORE THE METER RUNS OUT</span><b>Attempt {attempt}/2</b></div>
          <div className="typing-timer-track"><span style={{ width: `${timePercent}%` }} /></div>
          <div className="typing-timer-copy"><span>{Math.max(0, Math.ceil((TYPING_RUSH_ROUND_MS - elapsedMs) / 1000))}s</span><small>Fast + accurate answers build your combo.</small></div>

          <div className="typing-prompt-block">
            <small>{source === "gap-fill" ? "COMPLETE THE SENTENCE" : "TYPE THE ANSWER"}</small>
            <h2>{round.prompt}</h2>
            {round.hint && <span><AppIcon name="lightbulb" /> {round.hint}</span>}
          </div>

          <form className={`typing-answer-form feedback-${feedback ?? "idle"}`} onSubmit={submit}>
            <div className="typing-input-shell">
              <AppIcon name="keyboard" />
              <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} disabled={locked} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Type your answer…" aria-label="Type your answer" />
              <kbd>ENTER</kbd>
            </div>
            <button type="submit" disabled={locked || !input.trim()}>SUBMIT <AppIcon name="arrow-right" /></button>
          </form>

          <div className={`typing-feedback feedback-${feedback ?? "idle"}`} aria-live="polite">
            {feedback === "correct" && <><AppIcon name="check-circle-fill" /><span><b>Clean hit!</b> {round.correctAnswer}</span></>}
            {feedback === "near" && <><AppIcon name="exclamation-circle-fill" /><span><b>Almost!</b> Check the spelling and try once more.</span></>}
            {feedback === "wrong" && attempt === 2 && !locked && <><AppIcon name="arrow-repeat" /><span><b>One more try.</b> The clock is still running.</span></>}
            {feedback === "wrong" && locked && <><AppIcon name="x-circle-fill" /><span><b>Answer:</b> {round.correctAnswer}</span></>}
            {feedback === "timeout" && <><AppIcon name="clock-fill" /><span><b>Time!</b> The answer was {round.correctAnswer}.</span></>}
            {!feedback && <><AppIcon name="info-circle" /><span>Capital letters and punctuation do not matter. The words and spelling do.</span></>}
          </div>
        </div>

        <div className="typing-combo-rail" aria-hidden="true">
          <span style={{ height: `${Math.min(100, 18 + streak * 12)}%` }} />
          <b>×{Math.max(1, streak)}</b>
          <small>COMBO</small>
        </div>
      </section>

      <p className="arcade-key-help">Type the answer and press <kbd>Enter</kbd>. A first mistake gives you one retry, but the timer never stops.</p>
    </div>
  );
}

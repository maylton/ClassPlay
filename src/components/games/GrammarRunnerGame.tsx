"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { useQuestionTimer } from "@/hooks/useQuestionTimer";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { playArcadeTone } from "@/lib/arcade-audio";
import {
  buildGrammarRunnerRounds,
  chooseGrammarRunnerSource,
  grammarRunnerTravelMs,
  resolveGrammarRunnerGate,
} from "@/lib/grammar-runner-engine";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

type Lane = 0 | 1 | 2;
type RunnerFeedback = "perfect" | "correct" | "wrong" | null;
type LaneShift = "left" | "right" | null;

const LANE_LABELS = ["LEFT", "CENTER", "RIGHT"] as const;

function gateStyle(lane: Lane, progress: number): CSSProperties {
  const spread = 9 + progress * 21;
  const left = 50 + (lane - 1) * spread;
  const top = 39 + progress * 39;
  const scale = .4 + progress * .76;
  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(-50%, -50%) scale(${scale})`,
  };
}

function DashRunner({ state }: { state: "running" | "celebrate" | "stumble" }) {
  return (
    <div className={`runner-character runner-${state}`} aria-hidden="true">
      <span className="runner-shadow" />
      <svg className="runner-avatar" viewBox="0 0 170 220" role="presentation">
        <g className="runner-scarf">
          <path d="M76 78 C61 88 47 101 37 118 C53 114 68 104 80 91 Z" />
          <path d="M73 84 C60 101 58 118 51 134 C67 124 76 108 82 91 Z" />
        </g>

        <g className="runner-back-leg">
          <path d="M97 145 C101 158 103 174 99 191" />
          <path className="runner-shoe" d="M90 188 C101 185 114 188 120 195 C115 204 98 207 88 200 Z" />
        </g>
        <g className="runner-front-leg">
          <path d="M73 145 C69 160 68 176 72 192" />
          <path className="runner-shoe" d="M62 191 C72 187 85 189 91 197 C84 205 67 206 59 199 Z" />
        </g>

        <g className="runner-body">
          <path className="runner-jacket" d="M58 86 C69 78 100 78 112 88 L117 137 C106 149 66 150 52 138 Z" />
          <path className="runner-hood" d="M69 83 C73 74 97 73 103 83 C98 92 75 93 69 83 Z" />
          <path className="runner-jacket-yoke" d="M60 101 C75 108 98 108 112 101" />
          <path className="runner-jacket-panel" d="M85 106 L86 145" />
          <path className="runner-reflector" d="M66 121 C77 124 95 124 106 121" />
          <circle className="runner-badge" cx="102" cy="96" r="6" />
        </g>

        <g className="runner-back-arm">
          <path d="M109 94 C118 108 121 123 118 139" />
          <circle className="runner-hand" cx="117" cy="143" r="7" />
        </g>
        <g className="runner-front-arm">
          <path d="M59 95 C51 109 49 124 52 140" />
          <circle className="runner-hand" cx="53" cy="144" r="7" />
        </g>

        <g className="runner-head">
          <circle className="runner-head-base" cx="85" cy="57" r="31" />
          <path className="runner-hair-back" d="M56 58 C54 33 67 19 85 18 C105 18 118 33 115 59 C109 53 105 48 101 42 C94 47 76 48 67 41 C64 49 60 55 56 58 Z" />
          <path className="runner-hair-highlight" d="M72 29 C80 22 94 22 102 30 C92 28 82 30 74 36 Z" />
          <g className="runner-headphones">
            <path d="M59 57 C56 36 68 24 85 23 C103 23 115 36 112 57" />
            <rect x="54" y="50" width="12" height="25" rx="6" />
            <rect x="104" y="50" width="12" height="25" rx="6" />
            <circle cx="60" cy="63" r="3" />
            <circle cx="110" cy="63" r="3" />
          </g>
        </g>

        <g className="runner-sparkles">
          <path d="M136 61 l4 8 8 4-8 4-4 8-4-8-8-4 8-4z" />
          <circle cx="145" cy="99" r="4" />
        </g>
      </svg>
      <span className="runner-speed-line line-a" />
      <span className="runner-speed-line line-b" />
      <span className="runner-speed-line line-c" />
      <span className="runner-speed-line line-d" />
      <span className="runner-speed-line line-e" />
      <span className="runner-speed-line line-f" />
    </div>
  );
}

export function GrammarRunnerGame({ activity, onComplete }: GameProps) {
  const { settings } = useClassroomSettings();
  const quizItems = useMemo(() => getPlayableItemsForMode(activity.items, "quiz"), [activity.items]);
  const gapItems = useMemo(() => getPlayableItemsForMode(activity.items, "gap-fill"), [activity.items]);
  const source = useMemo(() => chooseGrammarRunnerSource(activity.kind, quizItems.length, gapItems.length), [activity.kind, gapItems.length, quizItems.length]);
  const rounds = useMemo(() => {
    if (!source) return [];
    return buildGrammarRunnerRounds(source === "gap-fill" ? gapItems : quizItems, source);
  }, [gapItems, quizItems, source]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [lane, setLane] = useState<Lane>(1);
  const laneRef = useRef<Lane>(1);
  const selectionMsRef = useRef<number | null>(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<RunnerFeedback>(null);
  const [finished, setFinished] = useState(false);
  const [runnerState, setRunnerState] = useState<"running" | "celebrate" | "stumble">("running");
  const [laneShift, setLaneShift] = useState<LaneShift>(null);
  const laneShiftTimerRef = useRef<number | null>(null);
  const swipeStartX = useRef<number | null>(null);

  const round = rounds[roundIndex];
  const travelMs = grammarRunnerTravelMs(streak);
  const { elapsedMs, stop } = useQuestionTimer(round?.itemId ?? "runner-empty");
  const progress = Math.min(1, elapsedMs / Math.max(1, travelMs));

  const clearLaneShift = useCallback(() => {
    if (laneShiftTimerRef.current !== null) {
      window.clearTimeout(laneShiftTimerRef.current);
      laneShiftTimerRef.current = null;
    }
    setLaneShift(null);
  }, []);

  const moveToLane = useCallback((nextLane: Lane) => {
    if (locked || finished) return;
    const currentLane = laneRef.current;

    if (nextLane !== currentLane && !settings.reducedMotion) {
      if (laneShiftTimerRef.current !== null) window.clearTimeout(laneShiftTimerRef.current);
      setLaneShift(nextLane < currentLane ? "left" : "right");
      laneShiftTimerRef.current = window.setTimeout(() => {
        laneShiftTimerRef.current = null;
        setLaneShift(null);
      }, 260);
    }

    laneRef.current = nextLane;
    selectionMsRef.current = elapsedMs;
    setLane(nextLane);
  }, [elapsedMs, finished, locked, settings.reducedMotion]);

  const move = useCallback((direction: -1 | 1) => {
    const next = Math.max(0, Math.min(2, laneRef.current + direction)) as Lane;
    moveToLane(next);
  }, [moveToLane]);

  const advance = useCallback((nextScore: number, nextCorrect: number) => {
    if (roundIndex === rounds.length - 1) {
      setFinished(true);
      onComplete(nextScore, nextCorrect, rounds.length);
      return;
    }
    setRoundIndex((current) => current + 1);
    laneRef.current = 1;
    selectionMsRef.current = null;
    setLane(1);
    setLocked(false);
    setFeedback(null);
    setRunnerState("running");
    clearLaneShift();
  }, [clearLaneShift, onComplete, roundIndex, rounds.length]);

  const resolveGate = useCallback(() => {
    if (!round || locked || finished) return;
    setLocked(true);
    const collisionMs = stop();
    const gate = round.gates.find((candidate) => candidate.lane === laneRef.current);
    const result = resolveGrammarRunnerGate(Boolean(gate?.correct), selectionMsRef.current ?? collisionMs, streak);
    const nextScore = score + result.points;
    const nextCorrect = correctCount + (result.correct ? 1 : 0);

    setScore(nextScore);
    setCorrectCount(nextCorrect);
    setStreak(result.nextStreak);
    setFeedback(result.correct ? (result.perfect ? "perfect" : "correct") : "wrong");
    setRunnerState(result.correct ? "celebrate" : "stumble");
    playArcadeTone(settings.soundEnabled, result.correct ? "correct" : "wrong");

    window.setTimeout(() => advance(nextScore, nextCorrect), settings.reducedMotion ? 300 : result.correct ? 760 : 920);
  }, [advance, correctCount, finished, locked, round, score, settings.reducedMotion, settings.soundEnabled, stop, streak]);

  useEffect(() => {
    if (!round || locked || finished) return;
    const timer = window.setTimeout(resolveGate, travelMs);
    return () => window.clearTimeout(timer);
  }, [finished, locked, resolveGate, round, travelMs]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLocaleLowerCase();
      if (event.key === "ArrowLeft" || key === "a") { event.preventDefault(); move(-1); return; }
      if (event.key === "ArrowRight" || key === "d") { event.preventDefault(); move(1); return; }
      if (event.key === "1" || event.key === "2" || event.key === "3") {
        event.preventDefault();
        moveToLane((Number(event.key) - 1) as Lane);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, moveToLane]);

  useEffect(() => () => {
    if (laneShiftTimerRef.current !== null) window.clearTimeout(laneShiftTimerRef.current);
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) { swipeStartX.current = event.clientX; }
  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const start = swipeStartX.current;
    swipeStartX.current = null;
    if (start === null) return;
    const delta = event.clientX - start;
    if (Math.abs(delta) >= 36) move(delta > 0 ? 1 : -1);
  }

  function replay() {
    window.dispatchEvent(new Event("classplay:game-replay"));
    setRoundIndex(0);
    laneRef.current = 1;
    selectionMsRef.current = null;
    setLane(1); setScore(0); setCorrectCount(0); setStreak(0); setLocked(false); setFeedback(null); setFinished(false); setRunnerState("running");
    clearLaneShift();
  }

  if (!source || !rounds.length) return <div className="empty-game"><span><AppIcon name="sign-turn-right-fill" /></span><h2>Grammar Runner needs more question-ready content.</h2><p>Add at least three usable Quiz pairs or three Gap Fill sentences.</p></div>;
  if (finished) return <CompletionCard score={score} correct={correctCount} total={rounds.length} onReplay={replay} />;
  if (!round) return null;

  return (
    <div className={`arcade-stage grammar-runner ${settings.reducedMotion ? "reduced-motion" : ""}`}>
      <div className="arcade-hud runner-hud"><div><small>ROUND</small><strong>{roundIndex + 1}/{rounds.length}</strong></div><div><small>SCORE</small><strong>{score}</strong></div><div><small>STREAK</small><strong>{streak ? `×${streak}` : "—"}</strong></div></div>
      <div className="runner-question-card"><div><small>{source === "gap-fill" ? "CHOOSE THE MISSING LANGUAGE" : "CHOOSE THE RIGHT ANSWER"}</small>{round.hint && <span>Hint: {round.hint}</span>}</div><strong>{round.prompt}</strong><div className="runner-distance" aria-label={`${Math.max(0, Math.ceil((travelMs - elapsedMs) / 1000))} seconds until the gate`}><span style={{ width: `${Math.max(0, 100 - progress * 100)}%` }} /></div></div>

      <section className={`runner-world ${feedback ? `feedback-${feedback}` : ""}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp} aria-label="Grammar Runner track">
        <div className="runner-sky" aria-hidden="true"><span className="runner-sun" /><span className="runner-cloud cloud-a" /><span className="runner-cloud cloud-b" /></div>
        <div className="runner-city" aria-hidden="true">{Array.from({ length: 11 }, (_, index) => <i key={index} />)}</div>
        <div className="runner-track" aria-hidden="true"><span className="runner-lane-line line-left" /><span className="runner-lane-line line-right" /><span className="runner-track-glow" /></div>
        <div className="runner-gates">{round.gates.map((gate) => <div key={`${round.itemId}-${gate.lane}-${gate.text}`} style={gateStyle(gate.lane, progress)} className={`runner-gate ${locked && gate.correct ? "gate-correct" : ""} ${locked && lane === gate.lane && !gate.correct ? "gate-wrong" : ""}`}><span className="runner-gate-frame" /><small>{LANE_LABELS[gate.lane]}</small><strong>{gate.text}</strong></div>)}</div>
        <div className={`runner-player lane-${lane} ${laneShift ? `shift-${laneShift}` : ""}`}><DashRunner state={runnerState} /></div>
        <div className="runner-feedback" aria-live="polite">{feedback === "perfect" && <span className="perfect"><AppIcon name="lightning-charge-fill" /> PERFECT RUN!</span>}{feedback === "correct" && <span className="correct"><AppIcon name="check-circle-fill" /> Clean gate!</span>}{feedback === "wrong" && <span className="wrong"><AppIcon name="x-circle-fill" /> Wrong lane — {round.correctAnswer}</span>}</div>
      </section>

      <div className="runner-controls" aria-label="Runner controls"><button type="button" onClick={() => move(-1)} disabled={locked || lane === 0}><AppIcon name="arrow-left" /><span>Move left</span></button><div><kbd>←</kbd><span>or swipe</span><kbd>→</kbd></div><button type="button" onClick={() => move(1)} disabled={locked || lane === 2}><span>Move right</span><AppIcon name="arrow-right" /></button></div>
      <p className="arcade-key-help">Arrow keys / A-D · tap the controls · swipe on the track · keys <kbd>1</kbd>–<kbd>3</kbd> jump directly to a lane</p>
    </div>
  );
}

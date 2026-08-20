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
          <path d="M59 73 C39 75 31 62 19 57 C25 73 39 85 58 88 Z" />
          <path d="M53 81 C34 87 30 101 18 111 C39 108 55 99 66 88 Z" />
        </g>
        <g className="runner-back-leg"><path d="M92 148 C105 163 113 178 119 194" /><path className="runner-shoe" d="M111 190 C123 187 136 191 143 199 C136 208 117 208 108 201 Z" /></g>
        <g className="runner-front-leg"><path d="M79 149 C72 166 62 178 50 190" /><path className="runner-shoe" d="M41 187 C51 188 61 193 66 201 C55 208 37 204 31 197 Z" /></g>
        <g className="runner-body">
          <path className="runner-jacket" d="M58 83 C69 76 99 76 111 87 L116 137 C106 148 66 149 52 137 Z" />
          <path className="runner-jacket-panel" d="M82 81 L88 145" />
          <path className="runner-jacket-pocket" d="M63 115 L78 116" />
          <path className="runner-jacket-pocket" d="M94 116 L109 114" />
          <circle className="runner-badge" cx="101" cy="99" r="6" />
          <path className="runner-neck" d="M77 77 L77 88 L94 88 L95 75" />
        </g>
        <g className="runner-back-arm"><path d="M106 94 C121 105 127 117 132 132" /><circle className="runner-hand" cx="133" cy="135" r="7" /></g>
        <g className="runner-front-arm"><path d="M58 94 C45 106 41 120 40 136" /><circle className="runner-hand" cx="39" cy="139" r="7" /></g>
        <g className="runner-head">
          <circle className="runner-face" cx="85" cy="56" r="31" />
          <path className="runner-hair" d="M57 53 C55 31 67 19 85 19 C104 19 116 31 115 51 C108 43 102 38 95 34 C91 44 77 45 68 39 C65 46 61 50 57 53 Z" />
          <path className="runner-hair-tuft" d="M79 23 C83 10 98 9 105 18 C94 17 88 22 85 30 Z" />
          <circle className="runner-eye" cx="74" cy="58" r="3.2" /><circle className="runner-eye" cx="96" cy="58" r="3.2" />
          <path className="runner-brow" d="M68 51 Q74 47 80 50" /><path className="runner-brow" d="M90 50 Q96 47 102 51" />
          <path className="runner-smile" d="M76 68 Q85 75 94 68" />
          <g className="runner-headphones"><path d="M59 56 C56 35 68 24 85 23 C103 23 115 35 112 56" /><rect x="54" y="50" width="12" height="24" rx="6" /><rect x="104" y="50" width="12" height="24" rx="6" /><circle cx="60" cy="62" r="3" /><circle cx="110" cy="62" r="3" /></g>
        </g>
        <g className="runner-sparkles"><path d="M136 61 l4 8 8 4-8 4-4 8-4-8-8-4 8-4z" /><circle cx="145" cy="99" r="4" /></g>
      </svg>
      <span className="runner-speed-line line-a" /><span className="runner-speed-line line-b" /><span className="runner-speed-line line-c" />
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
  const swipeStartX = useRef<number | null>(null);

  const round = rounds[roundIndex];
  const travelMs = grammarRunnerTravelMs(streak);
  const { elapsedMs, stop } = useQuestionTimer(round?.itemId ?? "runner-empty");
  const progress = Math.min(1, elapsedMs / Math.max(1, travelMs));

  const moveToLane = useCallback((nextLane: Lane) => {
    if (locked || finished) return;
    laneRef.current = nextLane;
    selectionMsRef.current = elapsedMs;
    setLane(nextLane);
  }, [elapsedMs, finished, locked]);

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
  }, [onComplete, roundIndex, rounds.length]);

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
        <div className={`runner-player lane-${lane}`}><DashRunner state={runnerState} /></div>
        <div className="runner-feedback" aria-live="polite">{feedback === "perfect" && <span className="perfect"><AppIcon name="lightning-charge-fill" /> PERFECT RUN!</span>}{feedback === "correct" && <span className="correct"><AppIcon name="check-circle-fill" /> Clean gate!</span>}{feedback === "wrong" && <span className="wrong"><AppIcon name="x-circle-fill" /> Wrong lane — {round.correctAnswer}</span>}</div>
      </section>

      <div className="runner-controls" aria-label="Runner controls"><button type="button" onClick={() => move(-1)} disabled={locked || lane === 0}><AppIcon name="arrow-left" /><span>Move left</span></button><div><kbd>←</kbd><span>or swipe</span><kbd>→</kbd></div><button type="button" onClick={() => move(1)} disabled={locked || lane === 2}><span>Move right</span><AppIcon name="arrow-right" /></button></div>
      <p className="arcade-key-help">Arrow keys / A-D · tap the controls · swipe on the track · keys <kbd>1</kbd>–<kbd>3</kbd> jump directly to a lane</p>
    </div>
  );
}

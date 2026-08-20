"use client";

import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import type { LiveAnswerResult, LiveQuestion } from "@/lib/types";

export function StudentLiveSpaceBlaster({
  question,
  selected,
  answerResult,
  correctAnswer,
  disabled,
  reducedMotion,
  onAnswer,
}: {
  question: LiveQuestion;
  selected: string | null;
  answerResult: LiveAnswerResult | null;
  correctAnswer: string | null;
  disabled: boolean;
  reducedMotion: boolean;
  onAnswer: (option: string) => Promise<void>;
}) {
  const [aim, setAim] = useState({ itemId: question.itemId, lane: 0 });
  const lane = aim.itemId === question.itemId ? aim.lane : 0;
  const currentOption = question.options[lane];
  const shipLeft = `${((lane + 0.5) / Math.max(1, question.options.length)) * 100}%`;
  const setLane = (nextLane: number) => setAim({ itemId: question.itemId, lane: nextLane });

  function targetState(option: string) {
    if (correctAnswer) return option === correctAnswer ? "hit" : selected === option ? "miss" : "";
    if (selected === option && answerResult) return answerResult.correct ? "hit" : "miss";
    return "";
  }

  return (
    <div className={`arcade-stage space-blaster ${reducedMotion ? "reduced-motion" : ""}`}>
      <div className="space-question"><small>BLAST THE MISSING LANGUAGE</small><strong>{question.prompt}</strong>{question.hint && <span>{question.hint}</span>}</div>
      <div className="space-arena"><div className="space-stars" aria-hidden="true" /><div className="space-target-grid" style={{ gridTemplateColumns: `repeat(${question.options.length}, minmax(0, 1fr))` }}>{question.options.map((option, index) => <button key={`${question.itemId}-${option}`} className={`space-target ${lane === index ? "aimed" : ""} ${targetState(option)}`} onClick={() => !disabled && setLane(index)} disabled={disabled} aria-label={`${lane === index ? "Aimed at " : "Aim at "}${option}`}><span className="target-ring" aria-hidden="true"><i /></span><b>{option}</b></button>)}</div><div className="space-ship" style={{ left: shipLeft }} aria-label={currentOption ? `Ship aimed at ${currentOption}` : "Space ship"}><span className="ship-cockpit" /><span className="ship-wing left" /><span className="ship-wing right" /><span className="ship-flame" /></div></div>
      <div className="arcade-controls space-controls"><button onClick={() => setLane(Math.max(0, lane - 1))} disabled={disabled || lane === 0} aria-label="Move ship left"><AppIcon name="arrow-left" /></button><button className="arcade-fire" onClick={() => currentOption && void onAnswer(currentOption)} disabled={disabled || !currentOption}><AppIcon name="crosshair" /> FIRE</button><button onClick={() => setLane(Math.min(question.options.length - 1, lane + 1))} disabled={disabled || lane === question.options.length - 1} aria-label="Move ship right"><AppIcon name="arrow-right" /></button></div>
    </div>
  );
}

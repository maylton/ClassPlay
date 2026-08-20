"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { useQuestionTimer } from "@/hooks/useQuestionTimer";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { playArcadeTone } from "@/lib/arcade-audio";
import {
  TOWER_STACK_FOUNDATION,
  buildTowerStackRounds,
  chooseTowerStackSource,
  resolveTowerPlacement,
  resolveTowerStackAnswer,
  towerActiveBlockWidth,
  towerAnswerWidthPercent,
  towerHeightMeters,
  towerMovingBlockX,
  towerRank,
  towerSweepDurationMs,
  towerTimedBlockWidth,
  type TowerBlockGeometry,
  type TowerStackReward,
} from "@/lib/tower-stack-engine";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

type Phase = "question" | "stacking" | "feedback";
type Feedback = "wrong-answer" | "block-ready" | "perfect" | "placed" | "recovered" | "miss" | null;
type PlacedBlock = TowerBlockGeometry & { id: string; reward: TowerStackReward; perfect: boolean };

const FOUNDATION: PlacedBlock = {
  ...TOWER_STACK_FOUNDATION,
  id: "foundation",
  reward: "normal",
  perfect: true,
};

function rewardLabel(reward: TowerStackReward) {
  if (reward === "perfect") return "PERFECT BLOCK";
  if (reward === "wide") return "WIDE BLOCK";
  if (reward === "slow") return "SLOW MOTION";
  return "STANDARD BLOCK";
}

export function TowerStackGame({ activity, onComplete }: GameProps) {
  const { settings } = useClassroomSettings();
  const quizItems = useMemo(() => getPlayableItemsForMode(activity.items, "quiz"), [activity.items]);
  const gapItems = useMemo(() => getPlayableItemsForMode(activity.items, "gap-fill"), [activity.items]);
  const source = useMemo(
    () => chooseTowerStackSource(activity.kind, quizItems.length, gapItems.length),
    [activity.kind, gapItems.length, quizItems.length],
  );
  const rounds = useMemo(() => {
    if (!source) return [];
    return buildTowerStackRounds(source === "gap-fill" ? gapItems : quizItems, source);
  }, [gapItems, quizItems, source]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [stackCombo, setStackCombo] = useState(0);
  const [perfectStacks, setPerfectStacks] = useState(0);
  const [tower, setTower] = useState<PlacedBlock[]>([FOUNDATION]);
  const [phase, setPhase] = useState<Phase>("question");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [activeReward, setActiveReward] = useState<TowerStackReward>("normal");
  const [activeWidth, setActiveWidth] = useState(TOWER_STACK_FOUNDATION.width);
  const [activeX, setActiveX] = useState(TOWER_STACK_FOUNDATION.x);
  const [fallingX, setFallingX] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  const round = rounds[roundIndex];
  const { elapsedMs, stop } = useQuestionTimer(round?.itemId ?? "tower-empty");
  const topBlock = tower[tower.length - 1] ?? FOUNDATION;
  const floors = Math.max(0, tower.length - 1);
  const heightMeters = towerHeightMeters(floors);
  const answerWidthPercent = towerAnswerWidthPercent(elapsedMs);
  const questionPreviewWidth = towerTimedBlockWidth(topBlock.width, elapsedMs);
  const questionPreviewX = topBlock.x + (topBlock.width - questionPreviewWidth) / 2;
  const sweepDuration = towerSweepDurationMs(floors, activeReward);
  const cameraOffset = Math.max(0, (tower.length - 8) * 34);
  const activeBottom = 24 + tower.length * 34 - cameraOffset;
  const craneRigX = phase === "stacking"
    ? activeX + activeWidth / 2
    : questionPreviewX + questionPreviewWidth / 2;
  const showCraneRig = phase === "question" || phase === "stacking";

  const advance = useCallback((nextScore: number, nextCorrect: number) => {
    if (roundIndex === rounds.length - 1) {
      setFinished(true);
      onComplete(nextScore, nextCorrect, rounds.length);
      return;
    }
    setRoundIndex((current) => current + 1);
    setPhase("question");
    setFeedback(null);
    setSelected(null);
    setLocked(false);
    setActiveReward("normal");
    setFallingX(null);
  }, [onComplete, roundIndex, rounds.length]);

  const choose = useCallback((option: string) => {
    if (!round || locked || phase !== "question") return;
    setLocked(true);
    setSelected(option);
    const responseMs = stop();
    const correct = option === round.correctAnswer;
    const result = resolveTowerStackAnswer(correct, responseMs, streak);

    if (!correct) {
      setStreak(0);
      setStackCombo(0);
      setFeedback("wrong-answer");
      setPhase("feedback");
      playArcadeTone(settings.soundEnabled, "wrong");
      window.setTimeout(() => advance(score, correctCount), settings.reducedMotion ? 280 : 900);
      return;
    }

    const nextScore = score + result.points;
    const nextCorrect = correctCount + 1;
    const nextWidth = towerActiveBlockWidth(topBlock.width, result.reward, responseMs);
    setScore(nextScore);
    setCorrectCount(nextCorrect);
    setStreak(result.nextStreak);
    setActiveReward(result.reward);
    setActiveWidth(nextWidth);
    setFeedback("block-ready");
    playArcadeTone(settings.soundEnabled, "correct");

    window.setTimeout(() => {
      const startX = settings.reducedMotion
        ? topBlock.x + (topBlock.width - nextWidth) / 2
        : 0;
      setActiveX(Math.max(0, startX));
      setFeedback(null);
      setLocked(false);
      setPhase("stacking");
    }, settings.reducedMotion ? 140 : 420);
  }, [advance, correctCount, locked, phase, round, score, settings.reducedMotion, settings.soundEnabled, stop, streak, topBlock.width, topBlock.x]);

  useEffect(() => {
    if (phase !== "stacking" || settings.reducedMotion) return;

    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      setActiveX(towerMovingBlockX(now - startedAt, sweepDuration, activeWidth));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [activeWidth, phase, settings.reducedMotion, sweepDuration]);

  const dropBlock = useCallback(() => {
    if (phase !== "stacking" || locked) return;
    setLocked(true);
    const placement = resolveTowerPlacement(topBlock, { x: activeX, width: activeWidth }, activeReward);
    setPhase("feedback");

    if (!placement.landed) {
      setFallingX(activeX);
      setStackCombo(0);
      setFeedback("miss");
      playArcadeTone(settings.soundEnabled, "wrong");
      window.setTimeout(() => advance(score, correctCount), settings.reducedMotion ? 280 : 820);
      return;
    }

    const comboBonus = Math.min(stackCombo, 5) * 12;
    const nextScore = score + placement.points + comboBonus;
    const nextBlock: PlacedBlock = {
      x: placement.x,
      width: placement.width,
      id: `${round?.itemId ?? "tower"}-${tower.length}`,
      reward: activeReward,
      perfect: placement.perfect,
    };
    setTower((current) => [...current, nextBlock]);
    setStackCombo((current) => current + 1);
    setScore(nextScore);
    if (placement.perfect) setPerfectStacks((current) => current + 1);
    setFeedback(placement.recovered ? "recovered" : placement.perfect ? "perfect" : "placed");
    playArcadeTone(settings.soundEnabled, "correct");
    window.setTimeout(() => advance(nextScore, correctCount), settings.reducedMotion ? 260 : 760);
  }, [activeReward, activeWidth, activeX, advance, correctCount, locked, phase, round?.itemId, score, settings.reducedMotion, settings.soundEnabled, stackCombo, topBlock, tower.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (finished) return;
      if (phase === "stacking" && (event.code === "Space" || event.key === "Enter")) {
        event.preventDefault();
        dropBlock();
        return;
      }
      if (phase !== "question" || !round || locked) return;
      const index = Number(event.key) - 1;
      if (index < 0 || index >= round.options.length) return;
      const option = round.options[index];
      if (!option) return;
      event.preventDefault();
      choose(option);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [choose, dropBlock, finished, locked, phase, round]);

  function replay() {
    setRoundIndex(0);
    setScore(0);
    setCorrectCount(0);
    setStreak(0);
    setStackCombo(0);
    setPerfectStacks(0);
    setTower([FOUNDATION]);
    setPhase("question");
    setFeedback(null);
    setSelected(null);
    setLocked(false);
    setActiveReward("normal");
    setActiveWidth(TOWER_STACK_FOUNDATION.width);
    setActiveX(TOWER_STACK_FOUNDATION.x);
    setFallingX(null);
    setFinished(false);
  }

  if (!source || !rounds.length) {
    return <div className="empty-game"><span><AppIcon name="building" /></span><h2>Tower Stack needs more question-ready content.</h2><p>Add at least three usable Quiz pairs or three Gap Fill sentences.</p></div>;
  }

  if (finished) {
    return (
      <div className="tower-finish-shell">
        <div className="tower-final-banner">
          <span><AppIcon name="building-fill" /></span>
          <div><small>TOWER COMPLETE</small><strong>{floors} floors · {heightMeters} m</strong><p>{towerRank(heightMeters)} · {perfectStacks} perfect stacks</p></div>
        </div>
        <CompletionCard score={score} correct={correctCount} total={rounds.length} onReplay={replay} />
      </div>
    );
  }

  if (!round) return null;

  return (
    <div className={`arcade-stage tower-stack ${settings.reducedMotion ? "reduced-motion" : ""}`}>
      <div className="arcade-hud tower-hud">
        <div><small>ROUND</small><strong>{roundIndex + 1}/{rounds.length}</strong></div>
        <div><small>SCORE</small><strong>{score}</strong></div>
        <div><small>HEIGHT</small><strong>{heightMeters} m</strong></div>
        <div><small>STREAK</small><strong>{streak ? `×${streak}` : "—"}</strong></div>
      </div>

      <div className="tower-layout">
        <section className={`tower-question-panel phase-${phase} ${feedback === "wrong-answer" ? "is-wrong" : ""}`}>
          <div className="tower-question-heading">
            <div><small>{source === "gap-fill" ? "EARN A BLOCK · COMPLETE THE SENTENCE" : "EARN A BLOCK · CHOOSE THE ANSWER"}</small>{round.hint && <span>Hint: {round.hint}</span>}</div>
            <span className="tower-round-pill"><AppIcon name="layers" /> Floor {floors + 1}</span>
          </div>
          <h2>{round.prompt}</h2>

          {phase === "question" && (
            <>
              <div className="tower-answer-grid">
                {round.options.map((option, index) => (
                  <button
                    key={`${round.itemId}-${option}`}
                    type="button"
                    className={`${selected === option ? "selected" : ""}`}
                    onClick={() => choose(option)}
                    disabled={locked}
                  >
                    <kbd>{index + 1}</kbd><span>{option}</span>
                  </button>
                ))}
              </div>
              <div className="tower-time-pressure" aria-label={`Current block size ${answerWidthPercent}%`}>
                <div className="tower-time-pressure-copy">
                  <span><AppIcon name="hourglass-split" /> BLOCK SIZE</span>
                  <strong>{answerWidthPercent}%</strong>
                </div>
                <div className="tower-time-block-shell" aria-hidden="true"><span style={{ width: `${answerWidthPercent}%` }} /></div>
                <small>Think carefully — but the longer you take, the narrower your next block becomes.</small>
              </div>
            </>
          )}

          {phase === "stacking" && (
            <div className={`tower-drop-card reward-${activeReward}`}>
              <span className="tower-reward-icon"><AppIcon name={activeReward === "perfect" ? "stars" : activeReward === "wide" ? "arrows-expand" : activeReward === "slow" ? "hourglass-split" : "square-fill"} /></span>
              <div><small>BLOCK UNLOCKED · {answerWidthPercent}% SIZE</small><strong>{rewardLabel(activeReward)}</strong><p>{activeReward === "perfect" ? "It snaps safely to center, but answer time still decides its width." : activeReward === "wide" ? "Your streak widened this block. Center it well to recover space." : activeReward === "slow" ? "Fast English kept more width and earned slower movement." : "Time your drop and preserve as much surface as possible."}</p></div>
              <button type="button" onClick={dropBlock} disabled={locked}>DROP BLOCK <kbd>SPACE</kbd></button>
            </div>
          )}

          {phase === "feedback" && (
            <div className={`tower-feedback feedback-${feedback ?? "none"}`} aria-live="polite">
              {feedback === "wrong-answer" && <><AppIcon name="x-circle-fill" /><div><strong>No block this round.</strong><span>Correct answer: {round.correctAnswer}</span></div></>}
              {feedback === "perfect" && <><AppIcon name="stars" /><div><strong>Perfect stack!</strong><span>You kept every bit of the block you earned.</span></div></>}
              {feedback === "recovered" && <><AppIcon name="arrows-expand" /><div><strong>Reinforced floor!</strong><span>Your streak helped widen the tower.</span></div></>}
              {feedback === "placed" && <><AppIcon name="check-circle-fill" /><div><strong>Block placed.</strong><span>Keep the next one centered.</span></div></>}
              {feedback === "miss" && <><AppIcon name="arrow-down-circle-fill" /><div><strong>Missed the tower.</strong><span>Your English points stay safe. Next question!</span></div></>}
            </div>
          )}

          <div className="tower-progress-row">
            <span><AppIcon name="check2-circle" /> {correctCount} correct</span>
            <span><AppIcon name="bullseye" /> {perfectStacks} perfect</span>
            <span><AppIcon name="lightning-charge-fill" /> Build combo ×{stackCombo}</span>
          </div>
        </section>

        <section className={`tower-arena ${phase === "stacking" ? "can-drop" : ""}`} aria-label="Tower Stack building area">
          <div className="tower-sky-glow" aria-hidden="true" />
          <div className="tower-cloud tower-cloud-a" aria-hidden="true" />
          <div className="tower-cloud tower-cloud-b" aria-hidden="true" />
          <div className="tower-city" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</div>
          <div className="tower-crane" aria-hidden="true"><span /><i /></div>

          <div className="tower-playfield">
            <div className="tower-ground" aria-hidden="true" />

            {showCraneRig && (
              <div className="tower-crane-rig" aria-hidden="true" style={{ left: `${craneRigX}%`, bottom: `${activeBottom + 32}px` }}>
                <span className="tower-crane-trolley" />
                <i className="tower-crane-hook" />
              </div>
            )}

            {tower.map((block, index) => {
              const bottom = 24 + index * 34 - cameraOffset;
              return (
                <div
                  key={block.id}
                  className={`tower-block placed-block reward-${block.reward} ${block.perfect ? "is-perfect" : ""} ${index === 0 ? "foundation" : ""}`}
                  style={{ left: `${block.x}%`, width: `${block.width}%`, bottom: `${bottom}px` }}
                >
                  {index > 0 && <span>{index}</span>}
                </div>
              );
            })}

            {phase === "question" && (
              <div
                className="tower-block tower-preview-block"
                style={{ left: `${questionPreviewX}%`, width: `${questionPreviewWidth}%`, bottom: `${activeBottom}px` }}
                aria-hidden="true"
              ><span>?</span></div>
            )}

            {phase === "stacking" && (
              <div
                className={`tower-block active-block reward-${activeReward}`}
                style={{ left: `${activeX}%`, width: `${activeWidth}%`, bottom: `${activeBottom}px` }}
              ><span>{activeReward === "perfect" ? "★" : floors + 1}</span></div>
            )}

            {feedback === "wrong-answer" && <div className="tower-shatter" aria-hidden="true"><i /><i /><i /><i /></div>}
            {feedback === "miss" && fallingX !== null && (
              <div className={`tower-block falling-block reward-${activeReward}`} style={{ left: `${fallingX}%`, width: `${activeWidth}%`, bottom: `${activeBottom}px` }} />
            )}
          </div>

          <div className="tower-height-meter"><span style={{ height: `${Math.min(100, 12 + floors * 4)}%` }} /><b>{heightMeters} m</b></div>
          {phase === "stacking" && <button type="button" className="tower-tap-drop" onClick={dropBlock} disabled={locked}>Tap to drop</button>}
        </section>
      </div>

      <p className="arcade-key-help">Answer faster to keep a wider block · use <kbd>1</kbd>–<kbd>{round.options.length}</kbd> · then press <kbd>Space</kbd> / <kbd>Enter</kbd> or tap Drop</p>
    </div>
  );
}

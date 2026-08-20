"use client";

import { useCallback, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { useQuestionTimer } from "@/hooks/useQuestionTimer";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { playArcadeTone } from "@/lib/arcade-audio";
import {
  buildWordHuntBoard,
  chooseWordHuntSource,
  resolveWordHuntFind,
  wordHuntPathBetween,
  wordHuntSelectionMatches,
  type WordHuntCell,
} from "@/lib/word-hunt-engine";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

type HuntFeedback = "found" | "wrong" | "hint" | null;

function cellKey(cell: WordHuntCell) {
  return `${cell.row}-${cell.col}`;
}

export function WordHuntGame({ activity, onComplete }: GameProps) {
  const { settings } = useClassroomSettings();
  const quizItems = useMemo(() => getPlayableItemsForMode(activity.items, "quiz"), [activity.items]);
  const gapItems = useMemo(() => getPlayableItemsForMode(activity.items, "gap-fill"), [activity.items]);
  const source = useMemo(() => chooseWordHuntSource(activity.kind, quizItems.length, gapItems.length), [activity.kind, gapItems.length, quizItems.length]);
  const [boardKey, setBoardKey] = useState(0);
  const board = useMemo(() => {
    if (!source) return null;
    return buildWordHuntBoard(source === "gap-fill" ? gapItems : quizItems, source);
  }, [boardKey, gapItems, quizItems, source]);

  const [targetIndex, setTargetIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [foundIds, setFoundIds] = useState<string[]>([]);
  const [start, setStart] = useState<WordHuntCell | null>(null);
  const [selection, setSelection] = useState<WordHuntCell[]>([]);
  const [feedback, setFeedback] = useState<HuntFeedback>(null);
  const [hinted, setHinted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState(false);

  const target = board?.targets[targetIndex];
  const timerKey = `${boardKey}-${target?.itemId ?? "empty"}`;
  const { elapsedMs, stop } = useQuestionTimer(timerKey);
  const selectedKeys = useMemo(() => new Set(selection.map(cellKey)), [selection]);
  const foundKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!board) return keys;
    for (const candidate of board.targets) {
      if (!foundIds.includes(candidate.itemId)) continue;
      candidate.path.forEach((cell) => keys.add(cellKey(cell)));
    }
    return keys;
  }, [board, foundIds]);
  const hintedKey = hinted && target ? cellKey(target.path[0] ?? { row: -1, col: -1 }) : "";

  const advance = useCallback((nextScore: number, nextFound: string[]) => {
    if (!board) return;
    if (targetIndex >= board.targets.length - 1) {
      setFinished(true);
      onComplete(nextScore, nextFound.length, board.targets.length);
      return;
    }
    setTargetIndex((current) => current + 1);
    setStart(null);
    setSelection([]);
    setFeedback(null);
    setHinted(false);
    setLocked(false);
  }, [board, onComplete, targetIndex]);

  const submitPath = useCallback((path: WordHuntCell[]) => {
    if (!target || !board || locked || path.length < 2) return;
    setSelection(path);
    if (!wordHuntSelectionMatches(path, target.path)) {
      setStreak(0);
      setFeedback("wrong");
      playArcadeTone(settings.soundEnabled, "wrong");
      window.setTimeout(() => {
        setStart(null);
        setSelection([]);
        setFeedback(null);
      }, settings.reducedMotion ? 180 : 520);
      return;
    }

    setLocked(true);
    const responseMs = stop();
    const result = resolveWordHuntFind(responseMs, streak, hinted);
    const nextScore = score + result.points;
    const nextFound = [...foundIds, target.itemId];
    setScore(nextScore);
    setStreak(result.nextStreak);
    setFoundIds(nextFound);
    setFeedback("found");
    playArcadeTone(settings.soundEnabled, "correct");
    window.setTimeout(() => advance(nextScore, nextFound), settings.reducedMotion ? 240 : 720);
  }, [advance, board, foundIds, hinted, locked, score, settings.reducedMotion, settings.soundEnabled, stop, streak, target]);

  function selectCell(cell: WordHuntCell) {
    if (!board || !target || locked) return;
    if (!start) {
      setStart(cell);
      setSelection([cell]);
      setFeedback(null);
      return;
    }
    const path = wordHuntPathBetween(start, cell, board.size);
    if (!path.length) {
      setStart(cell);
      setSelection([cell]);
      setFeedback("wrong");
      window.setTimeout(() => setFeedback(null), 380);
      return;
    }
    submitPath(path);
  }

  function useHint() {
    if (!target || hinted || locked) return;
    setHinted(true);
    setFeedback("hint");
    window.setTimeout(() => setFeedback(null), settings.reducedMotion ? 180 : 700);
  }

  function replay() {
    setBoardKey((current) => current + 1);
    setTargetIndex(0);
    setScore(0);
    setStreak(0);
    setFoundIds([]);
    setStart(null);
    setSelection([]);
    setFeedback(null);
    setHinted(false);
    setLocked(false);
    setFinished(false);
  }

  if (!source || !board || !board.targets.length) {
    return <div className="empty-game"><span><AppIcon name="search" /></span><h2>Word Hunt needs shorter word-ready answers.</h2><p>Add at least three usable Quiz or Gap Fill answers with 3–12 letters after spaces and punctuation are removed.</p></div>;
  }

  if (finished) {
    return (
      <div className="hunt-finish-shell">
        <div className="hunt-final-banner"><span><AppIcon name="search" /></span><div><small>CASE CLOSED</small><strong>{foundIds.length} words found</strong><p>Best hunt streak ×{streak || 1}</p></div></div>
        <CompletionCard score={score} correct={foundIds.length} total={board.targets.length} onReplay={replay} />
      </div>
    );
  }

  if (!target) return null;

  return (
    <div className={`arcade-stage word-hunt ${settings.reducedMotion ? "reduced-motion" : ""}`}>
      <div className="arcade-hud hunt-hud">
        <div><small>WORD</small><strong>{targetIndex + 1}/{board.targets.length}</strong></div>
        <div><small>SCORE</small><strong>{score}</strong></div>
        <div><small>FOUND</small><strong>{foundIds.length}</strong></div>
        <div><small>STREAK</small><strong>{streak ? `×${streak}` : "—"}</strong></div>
      </div>

      <div className="hunt-layout">
        <section className="hunt-clue-panel">
          <span className="hunt-eyebrow"><AppIcon name="compass" /> CURRENT CLUE</span>
          <h2>{target.prompt}</h2>
          {target.hint && <p className="hunt-source-hint">Hint: {target.hint}</p>}
          <div className="hunt-answer-shape" aria-label={`${target.target.length} letters`}>
            {Array.from({ length: target.target.length }, (_, index) => <i key={index} />)}
          </div>
          <button type="button" className="hunt-hint-button" onClick={useHint} disabled={hinted || locked}><AppIcon name="lightbulb" /> {hinted ? "First letter revealed" : "Reveal first letter · −70 pts"}</button>
          <div className={`hunt-feedback feedback-${feedback ?? "idle"}`} aria-live="polite">
            {feedback === "found" && <><AppIcon name="check-circle-fill" /><span><b>Found it!</b> {target.displayAnswer}</span></>}
            {feedback === "wrong" && <><AppIcon name="x-circle" /><span><b>Not that line.</b> Keep hunting.</span></>}
            {feedback === "hint" && <><AppIcon name="lightbulb-fill" /><span><b>Signal detected.</b> The first letter is glowing.</span></>}
            {!feedback && <><AppIcon name="cursor" /><span>Tap the <b>first</b> and <b>last</b> letter of the hidden answer.</span></>}
          </div>
          <div className="hunt-found-list"><small>FOUND WORDS</small><div>{foundIds.length ? board.targets.filter((candidate) => foundIds.includes(candidate.itemId)).map((candidate) => <span key={candidate.itemId}><AppIcon name="check2" /> {candidate.displayAnswer}</span>) : <em>None yet — scan the grid.</em>}</div></div>
        </section>

        <section className="hunt-board-shell">
          <div className="hunt-board-glow" aria-hidden="true" />
          <div className="hunt-grid" style={{ gridTemplateColumns: `repeat(${board.size}, 1fr)` }}>
            {board.letters.flatMap((row, rowIndex) => row.map((letter, colIndex) => {
              const cell = { row: rowIndex, col: colIndex };
              const key = cellKey(cell);
              const classes = ["hunt-cell", selectedKeys.has(key) ? "selected" : "", foundKeys.has(key) ? "found" : "", hintedKey === key ? "hinted" : ""].filter(Boolean).join(" ");
              return <button key={key} type="button" className={classes} onClick={() => selectCell(cell)} disabled={locked}><span>{letter}</span></button>;
            }))}
          </div>
          <div className="hunt-board-footer"><span><AppIcon name="grid-3x3-gap-fill" /> {board.size}×{board.size}</span><span><AppIcon name="lightning-charge-fill" /> Faster finds = bigger score</span></div>
        </section>
      </div>

      <p className="arcade-key-help">Words can run horizontally, vertically or diagonally — forward or backward. Tap one end, then the other.</p>
    </div>
  );
}

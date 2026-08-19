"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { getPlayableItemsForMode, materializeItemsForMode } from "@/lib/activity-intelligence";
import { gapOptions, sentenceGapAnswer, shuffle, speedBonus } from "@/lib/game-engine";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

export function GapFillGame({ activity, onComplete }: GameProps) {
  const playableItems = useMemo(() => getPlayableItemsForMode(materializeItemsForMode(activity.items, "gap-fill"), "gap-fill"), [activity.items]);
  const [questions, setQuestions] = useState(() => shuffle(playableItems));
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [questionElapsedMs, setQuestionElapsedMs] = useState(0);
  const [lastPoints, setLastPoints] = useState(0);
  const questionStartedAtRef = useRef(Date.now());
  const questionTimerRef = useRef<number | null>(null);
  const item = questions[index];
  const options = useMemo(() => item ? gapOptions(item, playableItems) : [], [item, playableItems]);

  useEffect(() => {
    questionStartedAtRef.current = Date.now();
    setQuestionElapsedMs(0);
    if (questionTimerRef.current !== null) window.clearInterval(questionTimerRef.current);
    questionTimerRef.current = window.setInterval(() => setQuestionElapsedMs(Date.now() - questionStartedAtRef.current), 100);
    return () => {
      if (questionTimerRef.current !== null) window.clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    };
  }, [index, questions]);

  if (!item) return <div className="empty-game"><span><AppIcon name="pencil-square" /></span><h2>This set needs sentence targets.</h2><p>Add a full sentence and choose the word or expression to hide. ClassPlay will build the gap automatically.</p></div>;

  function stopQuestionClock() {
    if (questionTimerRef.current !== null) {
      window.clearInterval(questionTimerRef.current);
      questionTimerRef.current = null;
    }
    const elapsed = Date.now() - questionStartedAtRef.current;
    setQuestionElapsedMs(elapsed);
    return elapsed;
  }

  function choose(option: string) {
    if (selected) return;
    const responseMs = stopQuestionClock();
    setSelected(option);
    const right = option === sentenceGapAnswer(item);
    const points = right ? 100 + speedBonus(responseMs) : 0;
    const nextCorrect = correct + (right ? 1 : 0);
    const nextScore = score + points;
    setLastPoints(points); setCorrect(nextCorrect); setScore(nextScore);
    setTimeout(() => {
      if (index === questions.length - 1) { setFinished(true); onComplete(nextScore, nextCorrect, questions.length); }
      else { setIndex((value) => value + 1); setSelected(null); setLastPoints(0); }
    }, 900);
  }

  function replay() {
    setQuestions(shuffle(playableItems));
    setIndex(0); setCorrect(0); setScore(0); setSelected(null); setFinished(false); setQuestionElapsedMs(0); setLastPoints(0);
  }

  if (finished) return <CompletionCard score={score} correct={correct} total={questions.length} onReplay={replay} />;
  const correctAnswer = sentenceGapAnswer(item);

  return <div className="game-stage choice-stage"><div className="game-progress-label"><span>Question {index + 1} of {questions.length}</span><span><AppIcon name="clock" /> {(questionElapsedMs / 1000).toFixed(1)}s · {score} pts</span></div><div className="game-progress"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><div className="game-question"><span className="question-icon"><AppIcon name="pencil-square" /></span><small>GAP FILL</small><h2>Complete the sentence</h2><div className="sentence-prompt">{item.gapSentence}</div></div><div className="choice-grid">{options.map((option, optionIndex) => <button key={`${option}-${optionIndex}`} onClick={() => choose(option)} className={selected ? option === correctAnswer ? "correct" : selected === option ? "wrong" : "dimmed" : ""}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{selected && <div className={`feedback-message ${selected === correctAnswer ? "correct" : "wrong"}`}>{selected === correctAnswer ? <><AppIcon name="check-lg" /> That&apos;s it! +{lastPoints}</> : `The answer is “${correctAnswer}”.`}</div>}</div>;
}

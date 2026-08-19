"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { shuffle } from "@/lib/game-engine";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

export function QuizGame({ activity, onComplete }: GameProps) {
  const playableItems = useMemo(() => getPlayableItemsForMode(activity.items, "quiz"), [activity.items]);
  const [questions, setQuestions] = useState(() => shuffle(playableItems));
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const item = questions[index];
  const options = useMemo(() => {
    if (!item) return [];
    const otherAnswers = shuffle(playableItems.filter((candidate) => candidate.id !== item.id).map((candidate) => candidate.answer));
    return shuffle(Array.from(new Set([item.answer, ...otherAnswers]))).slice(0, 4);
  }, [item, playableItems]);

  if (!item) return <div className="empty-game"><span><AppIcon name="trophy" /></span><h2>This set needs usable answer pairs.</h2><p>Add at least two prompt + answer pairs with different answers.</p></div>;

  function choose(option: string) {
    if (selected) return;
    setSelected(option);
    const right = option === item.answer;
    const nextStreak = right ? streak + 1 : 0;
    const points = right ? 100 + Math.min(nextStreak, 5) * 20 : 0;
    const nextCorrect = correct + (right ? 1 : 0);
    const nextScore = score + points;
    setStreak(nextStreak); setCorrect(nextCorrect); setScore(nextScore);
    setTimeout(() => {
      if (index === questions.length - 1) { setFinished(true); onComplete(nextScore, nextCorrect, questions.length); }
      else { setIndex((value) => value + 1); setSelected(null); }
    }, 900);
  }

  function replay() {
    setQuestions(shuffle(playableItems)); setIndex(0); setCorrect(0); setScore(0); setStreak(0); setSelected(null); setFinished(false);
  }

  if (finished) return <CompletionCard score={score} correct={correct} total={questions.length} onReplay={replay} />;

  return <div className="game-stage choice-stage"><div className="game-progress-label"><span>Question {index + 1} of {questions.length}</span><span><AppIcon name="fire" /> {streak} streak · {score} pts</span></div><div className="game-progress"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><div className="game-question"><span className="question-icon">{item.hint || <AppIcon name="trophy" />}</span><small>QUICK QUIZ</small><h2>What does <em>“{item.prompt}”</em> mean?</h2></div><div className="choice-grid">{options.map((option, optionIndex) => <button key={`${option}-${optionIndex}`} onClick={() => choose(option)} className={selected ? option === item.answer ? "correct" : selected === option ? "wrong" : "dimmed" : ""}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{selected && <div className={`feedback-message ${selected === item.answer ? "correct" : "wrong"}`}>{selected === item.answer ? <><AppIcon name="check-lg" /> Correct!</> : `The answer is “${item.answer}”.`}</div>}</div>;
}

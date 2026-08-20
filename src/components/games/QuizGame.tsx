"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useQuestionTimer } from "@/hooks/useQuestionTimer";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { quizOptions, shuffle, speedBonus } from "@/lib/game-engine";
import type { ActivityItem } from "@/lib/types";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

function quizCopy(item: ActivityItem, kind: GameProps["activity"]["kind"]) {
  const prompt = item.prompt.trim();
  const hasGap = /_{2,}|\b___\b/.test(prompt);
  const promptLooksLikeSentence = prompt.split(/\s+/).length >= 5 || /[.!?]$/.test(prompt);
  const answerLooksLikeSentence = item.answer.trim().split(/\s+/).length >= 5 || /[.!?]$/.test(item.answer.trim());

  if (hasGap) {
    return {
      instruction: "Choose the option that completes the sentence",
      prompt,
    };
  }

  if (promptLooksLikeSentence && answerLooksLikeSentence) {
    return {
      instruction: "Choose the best response or equivalent sentence",
      prompt,
    };
  }

  if (kind === "vocabulary") {
    return {
      instruction: "Choose the best match",
      prompt,
    };
  }

  return {
    instruction: "Choose the correct answer",
    prompt,
  };
}

export function QuizGame({ activity, onComplete }: GameProps) {
  const playableItems = useMemo(() => getPlayableItemsForMode(activity.items, "quiz"), [activity.items]);
  const [questions, setQuestions] = useState(() => shuffle(playableItems));
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [lastPoints, setLastPoints] = useState(0);
  const item = questions[index];
  const { elapsedMs: questionElapsedMs, restart: restartQuestionClock, stop: stopQuestionClock } = useQuestionTimer(`${index}:${item?.id ?? "empty"}`);
  const options = useMemo(() => item ? quizOptions(item, playableItems) : [], [item, playableItems]);
  const copy = useMemo(() => item ? quizCopy(item, activity.kind) : null, [item, activity.kind]);

  if (!item || !copy) return <div className="empty-game"><span><AppIcon name="trophy" /></span><h2>This set needs usable answer pairs.</h2><p>Add at least two prompt + answer pairs with different answers.</p></div>;

  function choose(option: string) {
    if (selected) return;
    const responseMs = stopQuestionClock();
    setSelected(option);
    const right = option === item.answer;
    const nextStreak = right ? streak + 1 : 0;
    const points = right ? 100 + speedBonus(responseMs) + Math.min(nextStreak, 5) * 20 : 0;
    const nextCorrect = correct + (right ? 1 : 0);
    const nextScore = score + points;
    setLastPoints(points); setStreak(nextStreak); setCorrect(nextCorrect); setScore(nextScore);
    setTimeout(() => {
      if (index === questions.length - 1) { setFinished(true); onComplete(nextScore, nextCorrect, questions.length); }
      else { setIndex((value) => value + 1); setSelected(null); setLastPoints(0); }
    }, 900);
  }

  function replay() {
    restartQuestionClock();
    setQuestions(shuffle(playableItems)); setIndex(0); setCorrect(0); setScore(0); setStreak(0); setSelected(null); setFinished(false); setLastPoints(0);
  }

  if (finished) return <CompletionCard score={score} correct={correct} total={questions.length} onReplay={replay} />;

  return <div className="game-stage choice-stage"><div className="game-progress-label"><span>Question {index + 1} of {questions.length}</span><span><AppIcon name="clock" /> {(questionElapsedMs / 1000).toFixed(1)}s · <AppIcon name="fire" /> {streak} streak · {score} pts</span></div><div className="game-progress"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><div className="game-question"><span className="question-icon">{item.hint || <AppIcon name="trophy" />}</span><small>QUICK QUIZ</small><h2>{copy.instruction}</h2><div className="sentence-prompt">{copy.prompt}</div></div><div className="choice-grid">{options.map((option, optionIndex) => <button key={`${option}-${optionIndex}`} onClick={() => choose(option)} className={selected ? option === item.answer ? "correct" : selected === option ? "wrong" : "dimmed" : ""}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{selected && <div className={`feedback-message ${selected === item.answer ? "correct" : "wrong"}`}>{selected === item.answer ? <><AppIcon name="check-lg" /> Correct! +{lastPoints}</> : `The answer is “${item.answer}”.`}</div>}</div>;
}

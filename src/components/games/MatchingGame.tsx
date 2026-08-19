"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { shuffle } from "@/lib/game-engine";
import type { ActivityItem } from "@/lib/types";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

function normalizedMatchValue(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function uniqueVisiblePairs(items: ActivityItem[]) {
  const seenAnswers = new Set<string>();
  return shuffle(items).filter((item) => {
    const key = normalizedMatchValue(item.answer);
    if (!key || seenAnswers.has(key)) return false;
    seenAnswers.add(key);
    return true;
  });
}

function averageLength(items: ActivityItem[], field: "prompt" | "answer") {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + item[field].trim().length, 0) / items.length;
}

export function MatchingGame({ activity, onComplete }: GameProps) {
  const playableItems = useMemo(
    () => uniqueVisiblePairs(getPlayableItemsForMode(activity.items, "matching")),
    [activity.items],
  );
  const matchingCopy = useMemo(() => {
    const context = `${activity.title} ${activity.topic}`.toLocaleLowerCase();
    const isAdviceActivity = context.includes("advice") || context.includes("should / shouldn't") || context.includes("should / shouldn’t");
    const isPastSimple = context.includes("past simple") && context.includes("verb");
    const isComparatives = context.includes("comparative") || context.includes("superlative");
    const isConditional = context.includes("conditional");
    const isThereIsAre = context.includes("there is") || context.includes("there are");
    const isReportedSpeech = context.includes("reported speech");
    const lexicalKeywords = [
      "vocabulary", "phrasal verb", "idiom", "slang", "gaming", "anime", "manga",
      "environment", "job interview", "school life", "social media", "technology",
      "travel", "academic collocation", "hedging",
    ];
    const isLexicalActivity = activity.kind === "vocabulary" || lexicalKeywords.some((keyword) => context.includes(keyword));

    if (isAdviceActivity) {
      return {
        instruction: "Connect each situation to the best advice",
        leftLabel: "SITUATION",
        rightLabel: "ADVICE",
      };
    }

    if (isPastSimple) {
      return {
        instruction: "Match each base verb to its past form",
        leftLabel: "BASE VERB",
        rightLabel: "PAST FORM",
      };
    }

    if (isComparatives) {
      return {
        instruction: "Connect each adjective clue to the correct form",
        leftLabel: "ADJECTIVE / CLUE",
        rightLabel: "CORRECT FORM",
      };
    }

    if (isConditional) {
      return {
        instruction: "Match each condition to the result that completes it",
        leftLabel: "CONDITION",
        rightLabel: "RESULT",
      };
    }

    if (isReportedSpeech) {
      return {
        instruction: "Connect what was said to the reported version",
        leftLabel: "DIRECT SPEECH",
        rightLabel: "REPORTED SPEECH",
      };
    }

    if (isLexicalActivity) {
      const definitionFirst = averageLength(playableItems, "prompt") > averageLength(playableItems, "answer");
      return definitionFirst
        ? {
            instruction: "Connect each meaning or clue to the English expression",
            leftLabel: "MEANING / CLUE",
            rightLabel: "ENGLISH",
          }
        : {
            instruction: "Connect each English expression to its meaning",
            leftLabel: "ENGLISH",
            rightLabel: "MEANING",
          };
    }

    if (isThereIsAre) {
      return {
        instruction: "Connect each clue to the sentence that expresses it",
        leftLabel: "CLUE",
        rightLabel: "SENTENCE",
      };
    }

    return {
      instruction: "Connect each clue to its correct answer",
      leftLabel: "CLUE",
      rightLabel: "ANSWER",
    };
  }, [activity.kind, activity.title, activity.topic, playableItems]);

  const [left, setLeft] = useState(() => shuffle(playableItems));
  const [right, setRight] = useState(() => shuffle(playableItems));
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [finished, setFinished] = useState(false);

  if (playableItems.length < 2) return <div className="empty-game"><span><AppIcon name="link-45deg" /></span><h2>This set does not have enough clear relationships for Matching.</h2><p>ClassPlay now hides Matching when the content behaves more like sentence completion than association.</p></div>;

  function evaluate(leftId: string | null, rightId: string | null) {
    if (!leftId || !rightId) return;
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    if (leftId === rightId) {
      const nextMatched = [...matched, leftId];
      setMatched(nextMatched);
      setFeedback("correct");
      setTimeout(() => { setSelectedLeft(null); setSelectedRight(null); setFeedback(null); }, 300);
      if (nextMatched.length === playableItems.length) {
        const score = Math.max(200, playableItems.length * 120 - (nextAttempts - playableItems.length) * 40);
        setTimeout(() => { setFinished(true); onComplete(score, playableItems.length, nextAttempts); }, 400);
      }
    } else {
      setFeedback("wrong");
      setTimeout(() => { setSelectedLeft(null); setSelectedRight(null); setFeedback(null); }, 550);
    }
  }

  function replay() {
    const nextItems = uniqueVisiblePairs(getPlayableItemsForMode(activity.items, "matching"));
    setLeft(shuffle(nextItems)); setRight(shuffle(nextItems)); setSelectedLeft(null); setSelectedRight(null); setMatched([]); setAttempts(0); setFeedback(null); setFinished(false);
  }

  if (finished) return <CompletionCard score={Math.max(200, playableItems.length * 120 - (attempts - playableItems.length) * 40)} correct={playableItems.length} total={attempts} onReplay={replay} />;

  return <div className="game-stage"><div className="game-progress-label"><span>{matchingCopy.instruction}</span><span>{matched.length}/{playableItems.length} matched</span></div><div className={`matching-board ${feedback ? `feedback-${feedback}` : ""}`}><div className="matching-column"><small>{matchingCopy.leftLabel}</small>{left.map((item) => <button key={item.id} disabled={matched.includes(item.id)} onClick={() => { setSelectedLeft(item.id); evaluate(item.id, selectedRight); }} className={selectedLeft === item.id ? "selected" : ""}>{item.prompt}{matched.includes(item.id) && <i><AppIcon name="check-lg" /></i>}</button>)}</div><div className="matching-column"><small>{matchingCopy.rightLabel}</small>{right.map((item) => <button key={item.id} disabled={matched.includes(item.id)} onClick={() => { setSelectedRight(item.id); evaluate(selectedLeft, item.id); }} className={selectedRight === item.id ? "selected" : ""}>{item.answer}{matched.includes(item.id) && <i><AppIcon name="check-lg" /></i>}</button>)}</div></div></div>;
}

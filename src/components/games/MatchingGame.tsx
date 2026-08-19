"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { shuffle } from "@/lib/game-engine";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

export function MatchingGame({ activity, onComplete }: GameProps) {
  const playableItems = useMemo(() => getPlayableItemsForMode(activity.items, "matching"), [activity.items]);
  const [left, setLeft] = useState(() => shuffle(playableItems));
  const [right, setRight] = useState(() => shuffle(playableItems));
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [finished, setFinished] = useState(false);

  if (!playableItems.length) return <div className="empty-game"><span><AppIcon name="link-45deg" /></span><h2>This set needs prompt + answer pairs.</h2><p>Add at least two usable pairs in the activity editor.</p></div>;

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
    setLeft(shuffle(playableItems)); setRight(shuffle(playableItems)); setSelectedLeft(null); setSelectedRight(null); setMatched([]); setAttempts(0); setFeedback(null); setFinished(false);
  }

  if (finished) return <CompletionCard score={Math.max(200, playableItems.length * 120 - (attempts - playableItems.length) * 40)} correct={playableItems.length} total={attempts} onReplay={replay} />;

  return <div className="game-stage"><div className="game-progress-label"><span>Connect each English phrase to its meaning</span><span>{matched.length}/{playableItems.length} matched</span></div><div className={`matching-board ${feedback ? `feedback-${feedback}` : ""}`}><div className="matching-column"><small>ENGLISH</small>{left.map((item) => <button key={item.id} disabled={matched.includes(item.id)} onClick={() => { setSelectedLeft(item.id); evaluate(item.id, selectedRight); }} className={selectedLeft === item.id ? "selected" : ""}>{item.hint && <span>{item.hint}</span>}{item.prompt}{matched.includes(item.id) && <i><AppIcon name="check-lg" /></i>}</button>)}</div><div className="matching-column"><small>MEANING</small>{right.map((item) => <button key={item.id} disabled={matched.includes(item.id)} onClick={() => { setSelectedRight(item.id); evaluate(selectedLeft, item.id); }} className={selectedRight === item.id ? "selected" : ""}>{item.answer}{matched.includes(item.id) && <i><AppIcon name="check-lg" /></i>}</button>)}</div></div></div>;
}

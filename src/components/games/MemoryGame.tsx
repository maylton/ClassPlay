"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { shuffle } from "@/lib/game-engine";
import type { ActivityItem } from "@/lib/types";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

type Card = { key: string; pairId: string; text: string; type: "prompt" | "answer"; hint?: string };

function makeCards(items: ActivityItem[]): Card[] {
  return shuffle(items.slice(0, 8).flatMap((item) => [
    { key: `${item.id}-p`, pairId: item.id, text: item.prompt, type: "prompt" as const, hint: item.hint },
    { key: `${item.id}-a`, pairId: item.id, text: item.answer, type: "answer" as const, hint: item.hint },
  ]));
}

export function MemoryGame({ activity, onComplete }: GameProps) {
  const playableItems = useMemo(() => getPlayableItemsForMode(activity.items, "memory"), [activity.items]);
  const [cards, setCards] = useState<Card[]>(() => makeCards(playableItems));
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [finished, setFinished] = useState(false);
  const [locked, setLocked] = useState(false);

  if (!cards.length) return <div className="empty-game"><span><AppIcon name="grid-3x3-gap" /></span><h2>This set needs prompt + answer pairs.</h2><p>Add at least two usable pairs in the activity editor.</p></div>;

  function choose(card: Card) {
    if (locked || matched.includes(card.pairId) || open.includes(card.key)) return;
    if (open.length === 0) return setOpen([card.key]);
    const first = cards.find((candidate) => candidate.key === open[0]);
    const nextMoves = moves + 1;
    setMoves(nextMoves);
    setOpen([open[0], card.key]);
    if (first?.pairId === card.pairId && first.key !== card.key) {
      const nextMatched = [...matched, card.pairId];
      setMatched(nextMatched);
      setTimeout(() => setOpen([]), 350);
      if (nextMatched.length === cards.length / 2) {
        const score = Math.max(200, cards.length * 90 - nextMoves * 20);
        setTimeout(() => { setFinished(true); onComplete(score, nextMatched.length, cards.length / 2); }, 450);
      }
    } else {
      setLocked(true);
      setTimeout(() => { setOpen([]); setLocked(false); }, 800);
    }
  }

  function replay() {
    setCards(makeCards(playableItems)); setOpen([]); setMatched([]); setMoves(0); setFinished(false); setLocked(false);
  }

  if (finished) return <CompletionCard score={Math.max(200, cards.length * 90 - moves * 20)} correct={matched.length} total={cards.length / 2} onReplay={replay} />;

  return <div className="game-stage"><div className="game-progress-label"><span>Find all matching pairs</span><span>{moves} moves · {matched.length}/{cards.length / 2} pairs</span></div><div className="memory-grid">{cards.map((card) => { const visible = open.includes(card.key) || matched.includes(card.pairId); return <button key={card.key} onClick={() => choose(card)} className={`memory-card ${visible ? "revealed" : ""} ${matched.includes(card.pairId) ? "matched" : ""}`}><span className="memory-back">C</span><span className="memory-front"><small>{card.type === "prompt" ? "EN" : "MEANING"}</small><b>{card.type === "prompt" && card.hint ? `${card.hint} ` : ""}{card.text}</b></span></button>; })}</div></div>;
}

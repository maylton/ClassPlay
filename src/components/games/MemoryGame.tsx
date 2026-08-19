"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { AppIcon } from "@/components/AppIcon";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { shuffle } from "@/lib/game-engine";
import {
  chooseMemoryItems,
  memoryCardFontSize,
  memoryCardMinHeight,
  memoryGridColumns,
} from "@/lib/memory-board";
import type { ActivityItem } from "@/lib/types";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

type Card = { key: string; pairId: string; text: string; type: "prompt" | "answer"; hint?: string };
type MemoryBoard = { pairIds: string[]; cards: Card[] };

type MemoryGridStyle = CSSProperties & {
  "--memory-columns": number;
  "--memory-card-min-height": string;
  "--memory-card-font-size": string;
};

function makeBoard(items: ActivityItem[], previousPairIds: readonly string[] = []): MemoryBoard {
  const selectedItems = chooseMemoryItems(items, previousPairIds);
  return {
    pairIds: selectedItems.map((item) => item.id),
    cards: shuffle(selectedItems.flatMap((item) => [
      { key: `${item.id}-p`, pairId: item.id, text: item.prompt, type: "prompt" as const, hint: item.hint },
      { key: `${item.id}-a`, pairId: item.id, text: item.answer, type: "answer" as const, hint: item.hint },
    ])),
  };
}

export function MemoryGame({ activity, onComplete }: GameProps) {
  const playableItems = useMemo(() => getPlayableItemsForMode(activity.items, "memory"), [activity.items]);
  const [board, setBoard] = useState<MemoryBoard>(() => makeBoard(playableItems));
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [finished, setFinished] = useState(false);
  const [locked, setLocked] = useState(false);
  const cards = board.cards;
  const pairCount = cards.length / 2;

  const gridStyle = useMemo<MemoryGridStyle>(() => ({
    "--memory-columns": memoryGridColumns(pairCount),
    "--memory-card-min-height": `${memoryCardMinHeight(pairCount)}px`,
    "--memory-card-font-size": `${memoryCardFontSize(pairCount)}rem`,
  }), [pairCount]);

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
      if (nextMatched.length === pairCount) {
        const score = Math.max(200, cards.length * 90 - nextMoves * 20);
        setTimeout(() => { setFinished(true); onComplete(score, nextMatched.length, pairCount); }, 450);
      }
    } else {
      setLocked(true);
      setTimeout(() => { setOpen([]); setLocked(false); }, 800);
    }
  }

  function replay() {
    setBoard(makeBoard(playableItems, board.pairIds));
    setOpen([]);
    setMatched([]);
    setMoves(0);
    setFinished(false);
    setLocked(false);
  }

  if (finished) return <CompletionCard score={Math.max(200, cards.length * 90 - moves * 20)} correct={matched.length} total={pairCount} onReplay={replay} />;

  const boardDescription = playableItems.length > pairCount
    ? `${pairCount} random pairs from ${playableItems.length}`
    : `${pairCount} pairs`;

  return <div className="game-stage"><div className="game-progress-label"><span>Find all matching pairs · {boardDescription}</span><span>{moves} moves · {matched.length}/{pairCount} pairs</span></div><div className="memory-grid memory-grid-adaptive" style={gridStyle}>{cards.map((card) => { const visible = open.includes(card.key) || matched.includes(card.pairId); return <button key={card.key} onClick={() => choose(card)} className={`memory-card ${visible ? "revealed" : ""} ${matched.includes(card.pairId) ? "matched" : ""}`}><span className="memory-back">C</span><span className="memory-front"><small>{card.type === "prompt" ? "EN" : "MEANING"}</small><b>{card.type === "prompt" && card.hint ? `${card.hint} ` : ""}{card.text}</b></span></button>; })}</div></div>;
}

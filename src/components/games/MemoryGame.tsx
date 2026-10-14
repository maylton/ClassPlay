"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
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

type Card = {
  key: string;
  pairId: string;
  text: string;
  type: "prompt" | "answer";
  imageUrl?: string;
};

type CardBackStyle = "numbers" | "brand";
type MemoryBoard = { pairIds: string[]; cards: Card[] };

type MemoryGridStyle = CSSProperties & {
  "--memory-columns": number;
  "--memory-card-height": string;
  "--memory-card-font-size": string;
};

function makeBoard(items: ActivityItem[], previousPairIds: readonly string[] = []): MemoryBoard {
  const selectedItems = chooseMemoryItems(items, previousPairIds);
  return {
    pairIds: selectedItems.map((item) => item.id),
    cards: shuffle(selectedItems.flatMap((item) => [
      {
        key: `${item.id}-p`,
        pairId: item.id,
        text: item.prompt,
        type: "prompt" as const,
        imageUrl: item.imageUrl || undefined,
      },
      {
        key: `${item.id}-a`,
        pairId: item.id,
        text: item.answer,
        type: "answer" as const,
      },
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
  const [cardBackStyle, setCardBackStyle] = useState<CardBackStyle>("numbers");
  const gridRef = useRef<HTMLDivElement>(null);
  const cards = board.cards;
  const pairCount = cards.length / 2;
  const [cardHeight, setCardHeight] = useState(() => memoryCardMinHeight(pairCount));

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    let frame = 0;
    const fitCardsToViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = grid.getBoundingClientRect();
        const styles = window.getComputedStyle(grid);
        const gap = Number.parseFloat(styles.rowGap) || 0;
        const columns = Math.max(1, styles.gridTemplateColumns.split(" ").filter(Boolean).length);
        const rows = Math.max(1, Math.ceil(cards.length / columns));
        const availableHeight = Math.max(1, window.innerHeight - rect.top - 16);
        const availableWidth = Math.max(1, rect.width - gap * (columns - 1));
        const widthPerCard = availableWidth / columns;
        const heightPerCard = (availableHeight - gap * (rows - 1)) / rows;
        const nextHeight = Math.max(64, Math.floor(Math.min(heightPerCard, widthPerCard * 0.76)));
        setCardHeight((current) => current === nextHeight ? current : nextHeight);
      });
    };

    const observer = new ResizeObserver(fitCardsToViewport);
    observer.observe(grid);
    window.addEventListener("resize", fitCardsToViewport);
    fitCardsToViewport();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fitCardsToViewport);
      window.cancelAnimationFrame(frame);
    };
  }, [cards.length, pairCount]);

  const gridStyle = useMemo<MemoryGridStyle>(() => ({
    "--memory-columns": memoryGridColumns(pairCount),
    "--memory-card-height": `${cardHeight}px`,
    "--memory-card-font-size": `${memoryCardFontSize(pairCount)}rem`,
  }), [cardHeight, pairCount]);

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

  return <div className="game-stage memory-game-stage">
    <div className="memory-toolbar">
      <div className="game-progress-label"><span>Find all matching pairs · {boardDescription}</span><span>{moves} moves · {matched.length}/{pairCount} pairs</span></div>
      <div className="memory-back-toggle" role="group" aria-label="Card back style">
        <button type="button" className={cardBackStyle === "numbers" ? "active" : ""} aria-pressed={cardBackStyle === "numbers"} onClick={() => setCardBackStyle("numbers")}><AppIcon name="123" /> Numbers</button>
        <button type="button" className={cardBackStyle === "brand" ? "active" : ""} aria-pressed={cardBackStyle === "brand"} onClick={() => setCardBackStyle("brand")}><span aria-hidden="true">C</span> ClassPlay</button>
      </div>
    </div>
    <div ref={gridRef} className="memory-grid memory-grid-adaptive" style={gridStyle}>{cards.map((card, index) => {
      const visible = open.includes(card.key) || matched.includes(card.pairId);
      const cardLabel = visible ? card.text : cardBackStyle === "numbers" ? `Card ${index + 1}` : "ClassPlay card";
      return <button key={card.key} aria-label={cardLabel} onClick={() => choose(card)} className={`memory-card ${visible ? "revealed" : ""} ${matched.includes(card.pairId) ? "matched" : ""}`}><span className={`memory-back ${cardBackStyle === "numbers" ? "memory-back-number" : "memory-back-brand"}`}>{cardBackStyle === "numbers" ? index + 1 : "C"}</span><span className={`memory-front ${card.imageUrl ? "memory-front-image" : ""}`}>{card.imageUrl ? <ActivityImage refValue={card.imageUrl} alt={card.text || "Vocabulary picture"} className="memory-card-image" /> : <b>{card.text}</b>}</span></button>;
    })}</div>
  </div>;
}

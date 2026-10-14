"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { languageLabel } from "@/lib/languages";
import { speakEnglish } from "@/lib/tts";

/** "Review again" sends a card to the back of the deck, up to this many times. */
const MAX_REVIEWS_PER_CARD = 2;

export function FlashcardsGame({ activity, onComplete }: GameProps) {
  const items = useMemo(() => getPlayableItemsForMode(activity.items, "flashcards"), [activity.items]);
  const initialQueue = useMemo(() => items.map((_, index) => index), [items]);
  const [queue, setQueue] = useState<number[]>(initialQueue);
  const [position, setPosition] = useState(0);
  const [reviews, setReviews] = useState<Record<string, number>>({});
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [finished, setFinished] = useState(false);
  const { settings } = useClassroomSettings();
  const item = items[queue[position] ?? -1];
  const language = activity.targetLanguage;

  useEffect(() => {
    if (settings.soundEnabled && settings.readAloud && item?.prompt) speakEnglish(item.prompt, language);
  }, [position, item?.prompt, language, settings.readAloud, settings.soundEnabled]);

  if (!item) return <div className="empty-game"><span><AppIcon name="card-text" /></span><h2>This set needs prompt + answer pairs.</h2><p>Add at least two usable pairs in the activity editor.</p></div>;

  function respond(gotIt: boolean) {
    const reviewCount = reviews[item.id] ?? 0;
    const requeue = !gotIt && reviewCount < MAX_REVIEWS_PER_CARD;
    const nextQueue = requeue ? [...queue, queue[position]] : queue;
    const nextKnown = known + (gotIt ? 1 : 0);
    if (requeue) {
      setQueue(nextQueue);
      setReviews({ ...reviews, [item.id]: reviewCount + 1 });
    }
    setKnown(nextKnown);
    if (position >= nextQueue.length - 1) {
      setFinished(true);
      onComplete(nextKnown * 100, nextKnown, items.length);
      return;
    }
    setPosition((value) => value + 1);
    setFlipped(false);
  }

  function replay() {
    setQueue(initialQueue); setPosition(0); setReviews({}); setFlipped(false); setKnown(0); setFinished(false);
  }

  if (finished) return <CompletionCard score={known * 100} correct={known} total={items.length} onReplay={replay} />;

  const reviewing = position >= items.length;

  return (
    <div className="flashcard-game game-stage">
      <div className="game-progress-label"><span>{reviewing ? "Review" : "Card"} {position + 1} of {queue.length}</span><span>{known} mastered</span></div>
      <div className="game-progress"><span style={{ width: `${((position + 1) / queue.length) * 100}%` }} /></div>
      <div className="flashcard-shell">
        {settings.soundEnabled && <button className="tts-button" onClick={(event) => { event.stopPropagation(); speakEnglish(item.prompt, language); }} aria-label={`Read the ${languageLabel(language)} prompt aloud`}><AppIcon name="volume-up" /></button>}
        <button className={`big-flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped((value) => !value)}>
          {item.imageUrl ? <ActivityImage refValue={item.imageUrl} alt={item.prompt} className="flashcard-image" /> : <span className="flashcard-hint">{item.hint || "Aa"}</span>}
          <small>{flipped ? "ANSWER" : languageLabel(language).toUpperCase()}</small>
          <strong>{flipped ? item.answer : item.prompt}</strong>
          {flipped && item.example && <p>{item.example}</p>}
          <em>{flipped ? "Tap to see the prompt" : "Tap to reveal"}</em>
        </button>
      </div>
      {flipped && <div className="self-check"><button className="button button-soft" onClick={() => respond(false)}><AppIcon name="arrow-repeat" /> Review again</button><button className="button button-success" onClick={() => respond(true)}><AppIcon name="check-lg" /> Got it</button></div>}
    </div>
  );
}

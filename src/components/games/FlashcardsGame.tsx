"use client";

import { useEffect, useState } from "react";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { speakEnglish } from "@/lib/tts";

export function FlashcardsGame({ activity, onComplete }: GameProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [finished, setFinished] = useState(false);
  const { settings } = useClassroomSettings();
  const item = activity.items[index];

  useEffect(() => {
    if (settings.soundEnabled && settings.readAloud && item?.prompt) speakEnglish(item.prompt);
  }, [index, item?.prompt, settings.readAloud, settings.soundEnabled]);

  function respond(gotIt: boolean) {
    const nextKnown = known + (gotIt ? 1 : 0);
    if (index === activity.items.length - 1) {
      setKnown(nextKnown);
      setFinished(true);
      onComplete(nextKnown * 100, nextKnown, activity.items.length);
      return;
    }
    setKnown(nextKnown);
    setIndex((value) => value + 1);
    setFlipped(false);
  }

  function replay() {
    setIndex(0); setFlipped(false); setKnown(0); setFinished(false);
  }

  if (finished) return <CompletionCard score={known * 100} correct={known} total={activity.items.length} onReplay={replay} />;

  return (
    <div className="flashcard-game game-stage">
      <div className="game-progress-label"><span>Card {index + 1} of {activity.items.length}</span><span>{known} mastered</span></div>
      <div className="game-progress"><span style={{ width: `${((index + 1) / activity.items.length) * 100}%` }} /></div>
      <div className="flashcard-shell">
        {settings.soundEnabled && <button className="tts-button" onClick={(event) => { event.stopPropagation(); speakEnglish(item.prompt); }} aria-label="Read English prompt aloud"><AppIcon name="volume-up" /></button>}
        <button className={`big-flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped((value) => !value)}>
          {item.imageUrl ? <ActivityImage refValue={item.imageUrl} alt={item.prompt} className="flashcard-image" /> : <span className="flashcard-hint">{item.hint || "Aa"}</span>}
          <small>{flipped ? "ANSWER" : "ENGLISH"}</small>
          <strong>{flipped ? item.answer : item.prompt}</strong>
          {flipped && item.example && <p>{item.example}</p>}
          <em>{flipped ? "Tap to see the prompt" : "Tap to reveal"}</em>
        </button>
      </div>
      {flipped && <div className="self-check"><button className="button button-soft" onClick={() => respond(false)}><AppIcon name="arrow-repeat" /> Review again</button><button className="button button-success" onClick={() => respond(true)}><AppIcon name="check-lg" /> Got it</button></div>}
    </div>
  );
}

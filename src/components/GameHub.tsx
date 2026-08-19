"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addGameResult } from "@/lib/storage";
import { loadActivity } from "@/lib/repositories/activity-repository";
import { GAME_MODE_CATALOG } from "@/lib/game-catalog";
import type { ActivitySet, GameType } from "@/lib/types";
import { AppIcon } from "./AppIcon";
import { SettingsPanel } from "./settings/SettingsPanel";
import { FlashcardsGame } from "./games/FlashcardsGame";
import { MemoryGame } from "./games/MemoryGame";
import { MatchingGame } from "./games/MatchingGame";
import { SentenceBuilderGame } from "./games/SentenceBuilderGame";
import { GapFillGame } from "./games/GapFillGame";
import { QuizGame } from "./games/QuizGame";

export function GameHub({ activityId }: { activityId: string }) {
  const [activity, setActivity] = useState<ActivitySet | null>(null);
  const [mode, setMode] = useState<GameType | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void loadActivity(activityId).then((loaded) => {
      if (!active) return;
      if (!loaded) setMissing(true);
      else setActivity(loaded);
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : "Could not load activity."));
    return () => { active = false; };
  }, [activityId]);

  if (error) return <main className="not-found"><span><AppIcon name="exclamation-triangle" /></span><h1>Could not open activity</h1><p>{error}</p><Link className="button button-primary" href="/dashboard">Back to library</Link></main>;
  if (missing) return <main className="not-found"><span><AppIcon name="search" /></span><h1>Activity not found</h1><p>This activity may have been deleted or belongs to another workspace.</p><Link className="button button-primary" href="/dashboard">Back to library</Link></main>;
  if (!activity) return <main className="loading-screen">Loading ClassPlay…</main>;

  function complete(game: GameType, score: number, correct: number, total: number) {
    addGameResult({ game, activityId: activity!.id, score, correct, total, completedAt: new Date().toISOString() });
  }

  if (mode) {
    const common = { activity, onComplete: (score: number, correct: number, total: number) => complete(mode, score, correct, total) };
    return (
      <main className="play-screen">
        <header className="play-header">
          <button className="play-brand" onClick={() => setMode(null)}><b>C</b><span>ClassPlay</span></button>
          <div className="play-title"><small>{activity.topic}</small><strong>{activity.title}</strong></div>
          <div className="play-header-actions"><SettingsPanel compact /><button className="button button-soft button-small" onClick={() => setMode(null)}><AppIcon name="arrow-left" /> Game modes</button></div>
        </header>
        <section className="play-canvas">
          {mode === "flashcards" && <FlashcardsGame {...common} />}
          {mode === "memory" && <MemoryGame {...common} />}
          {mode === "matching" && <MatchingGame {...common} />}
          {mode === "sentence-builder" && <SentenceBuilderGame {...common} />}
          {mode === "gap-fill" && <GapFillGame {...common} />}
          {mode === "quiz" && <QuizGame {...common} />}
        </section>
      </main>
    );
  }

  return (
    <main className="mode-screen">
      <header className="mode-header"><Link className="play-brand" href="/dashboard"><b>C</b><span>ClassPlay</span></Link><div className="mode-header-actions"><SettingsPanel compact /><Link href={`/edit/${activity.id}`} className="button button-soft button-small">Edit</Link><Link href="/dashboard" className="button button-soft button-small"><AppIcon name="arrow-left" /> Library</Link></div></header>
      <section className="mode-hero">
        <span className="eyebrow">Ready to play</span>
        <h1>{activity.title}</h1>
        <p>{activity.description}</p>
        <div className="mode-meta"><span>{activity.grade}</span><span>{activity.level}</span><span>{activity.items.length} items</span></div>
        <div className="connected-cta"><div><b><AppIcon name="wifi" /> Connected Classroom</b><span>Students join by code or QR. Play individually or in teams.</span></div><Link href={`/host/new?activity=${encodeURIComponent(activity.id)}`} className="button button-primary">Start live room <AppIcon name="arrow-right" /></Link></div>
      </section>
      <section className="mode-picker">
        <div className="mode-picker-heading"><div><small>CHOOSE A MODE</small><h2>How do you want to practise?</h2></div><span>{activity.enabledGames.length} games available</span></div>
        <div className="mode-grid">
          {activity.enabledGames.map((game) => {
            const info = GAME_MODE_CATALOG[game];
            return <button key={game} className={`mode-card ${info.colorClass}`} onClick={() => setMode(game)}><span className="mode-icon"><AppIcon name={info.icon} /></span><span><strong>{info.name}</strong><small>{info.pickerDescription}</small></span><i><AppIcon name="arrow-right" /></i></button>;
          })}
        </div>
      </section>
    </main>
  );
}

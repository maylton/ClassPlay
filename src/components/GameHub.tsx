"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addGameResult } from "@/lib/storage";
import { loadActivity, saveActivity } from "@/lib/repositories/activity-repository";
import { compatibleVariants, enableCompatibleMode, getPlayableItemsForMode } from "@/lib/activity-intelligence";
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
import { SpaceBlasterGame } from "./games/SpaceBlasterGame";
import { WordMazeGame } from "./games/WordMazeGame";

const ARCADE_MODES: readonly GameType[] = ["space-blaster", "word-maze"];

export function GameHub({ activityId }: { activityId: string }) {
  const [activity, setActivity] = useState<ActivitySet | null>(null);
  const [mode, setMode] = useState<GameType | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [addingMode, setAddingMode] = useState<GameType | null>(null);

  useEffect(() => {
    let active = true;
    void loadActivity(activityId).then((loaded) => {
      if (!active) return;
      if (!loaded) setMissing(true);
      else setActivity(loaded);
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : "Could not load activity."));
    return () => { active = false; };
  }, [activityId]);

  const variants = useMemo(() => activity ? compatibleVariants(activity) : [], [activity]);
  const liveReady = useMemo(() => activity ? (
    getPlayableItemsForMode(activity.items, "quiz").length >= 2 ||
    getPlayableItemsForMode(activity.items, "gap-fill").length >= 2
  ) : false, [activity]);

  if (error) return <main className="not-found"><span><AppIcon name="exclamation-triangle" /></span><h1>Could not open activity</h1><p>{error}</p><Link className="button button-primary" href="/dashboard">Back to library</Link></main>;
  if (missing) return <main className="not-found"><span><AppIcon name="search" /></span><h1>Activity not found</h1><p>This activity may have been deleted or belongs to another workspace.</p><Link className="button button-primary" href="/dashboard">Back to library</Link></main>;
  if (!activity) return <main className="loading-screen">Loading ClassPlay…</main>;

  function complete(game: GameType, score: number, correct: number, total: number) {
    addGameResult({ game, activityId: activity!.id, score, correct, total, completedAt: new Date().toISOString() });
  }

  async function addVariant(game: GameType) {
    const next = enableCompatibleMode(activity!, game);
    if (!next) return;
    setAddingMode(game); setError("");
    try {
      const saved = await saveActivity(next);
      setActivity(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add this game mode.");
    } finally {
      setAddingMode(null);
    }
  }

  if (mode) {
    const common = { activity, onComplete: (score: number, correct: number, total: number) => complete(mode, score, correct, total) };
    return (
      <main className={`play-screen ${ARCADE_MODES.includes(mode) ? "arcade-play-screen" : ""}`}>
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
          {mode === "space-blaster" && <SpaceBlasterGame {...common} />}
          {mode === "word-maze" && <WordMazeGame {...common} />}
        </section>
      </main>
    );
  }

  const enabledCoreGames = activity.enabledGames.filter((game) => !ARCADE_MODES.includes(game));
  const enabledArcadeGames = activity.enabledGames.filter((game) => ARCADE_MODES.includes(game));

  function modeCard(game: GameType) {
    const info = GAME_MODE_CATALOG[game];
    return <button key={game} className={`mode-card ${info.colorClass}`} onClick={() => setMode(game)}><span className="mode-icon"><AppIcon name={info.icon} /></span><span><strong>{info.name}</strong><small>{info.pickerDescription}</small></span><i><AppIcon name="arrow-right" /></i></button>;
  }

  return (
    <main className="mode-screen">
      <header className="mode-header"><Link className="play-brand" href="/dashboard"><b>C</b><span>ClassPlay</span></Link><div className="mode-header-actions"><SettingsPanel compact /><Link href={`/edit/${activity.id}`} className="button button-soft button-small">Edit</Link><Link href="/dashboard" className="button button-soft button-small"><AppIcon name="arrow-left" /> Library</Link></div></header>
      <section className="mode-hero">
        <span className="eyebrow">Ready to play</span>
        <h1>{activity.title}</h1>
        <p>{activity.description}</p>
        <div className="mode-meta"><span>{activity.grade}</span><span>{activity.level}</span><span>{activity.items.length} items</span></div>
        {liveReady ? <div className="connected-cta"><div><b><AppIcon name="wifi" /> Connected Classroom</b><span>Students join by code or QR. Play individually or in teams.</span></div><Link href={`/host/new?activity=${encodeURIComponent(activity.id)}`} className="button button-primary">Start live room <AppIcon name="arrow-right" /></Link></div> : <div className="connected-cta"><div><b><AppIcon name="wifi-off" /> Connected Classroom needs question-ready content</b><span>Add at least two prompt + answer pairs or two usable Gap Fill sentences before hosting live.</span></div><Link href={`/edit/${activity.id}`} className="button button-primary">Prepare live content <AppIcon name="arrow-right" /></Link></div>}
      </section>
      <section className="mode-picker">
        <div className="mode-picker-heading"><div><small>CHOOSE A MODE</small><h2>How do you want to practise?</h2></div><span>{activity.enabledGames.length} games available</span></div>
        {enabledCoreGames.length > 0 && <div className="mode-grid">{enabledCoreGames.map(modeCard)}</div>}
        {enabledArcadeGames.length > 0 && <section className="arcade-mode-section"><div className="arcade-mode-heading"><div><small>CLASSPLAY ARCADE</small><h3>Move more. Play louder.</h3></div><span><AppIcon name="controller" /></span></div><div className="mode-grid arcade-mode-grid">{enabledArcadeGames.map(modeCard)}</div></section>}

        <section className="compatible-variants-panel">
          <div className="compatible-variants-heading">
            <div><small>SMART VARIANTS</small><h2>{variants.length ? "Your content can do more." : "Want to unlock more ways to play?"}</h2><p>{variants.length ? "ClassPlay found other game modes that can use the content you already created. Add them without retyping anything." : "Edit this activity and add richer source content. ClassPlay will detect new compatible modes automatically."}</p></div>
            <span className="smart-engine-mark"><AppIcon name="stars" /></span>
          </div>
          {variants.length > 0 ? <div className="compatible-variant-grid">{variants.map((variant) => {
            const info = GAME_MODE_CATALOG[variant.mode];
            const arcade = ARCADE_MODES.includes(variant.mode);
            return <article className={`compatible-variant-card ${info.colorClass} ${arcade ? "arcade-variant" : ""}`} key={variant.mode}><span className="variant-icon"><AppIcon name={info.icon} /></span><div><small>{arcade ? "ARCADE READY" : "READY TO GENERATE"}</small><strong>{info.name}</strong><p>{variant.reason}</p>{variant.generated.length > 0 && <span className="generated-note"><AppIcon name="lightning-charge" /> Generates {variant.generated.join(" + ")}</span>}</div><button className="button button-dark button-small" disabled={addingMode === variant.mode} onClick={() => void addVariant(variant.mode)}>{addingMode === variant.mode ? "Adding…" : <>Add mode <AppIcon name="plus-lg" /></>}</button></article>;
          })}</div> : <Link href={`/edit/${activity.id}`} className="button button-soft">Edit content to unlock variants <AppIcon name="arrow-right" /></Link>}
        </section>
      </section>
    </main>
  );
}

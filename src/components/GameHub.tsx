"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addGameResult } from "@/lib/storage";
import {
  loadActivity,
  loadPracticeActivity,
  publishActivityForPractice,
  saveActivity,
  unpublishActivityFromPractice,
} from "@/lib/repositories/activity-repository";
import { compatibleVariants, enableCompatibleMode } from "@/lib/activity-intelligence";
import { getDerivedArcadeReadiness } from "@/lib/derived-arcade";
import { GAME_MODE_CATALOG, isArcadeMode } from "@/lib/game-catalog";
import type { ActivitySet, GameType } from "@/lib/types";
import { AppIcon } from "./AppIcon";
import { GAME_COMPONENTS } from "./games/game-registry";
import { PracticeLeaderboard } from "./leaderboard/PracticeLeaderboard";
import { SettingsPanel } from "./settings/SettingsPanel";

type PracticeCompletion = { game: GameType; score: number; correct: number; total: number };

export function GameHub({ activityId, practice = false }: { activityId: string; practice?: boolean }) {
  const [activity, setActivity] = useState<ActivitySet | null>(null);
  const [mode, setMode] = useState<GameType | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [addingMode, setAddingMode] = useState<GameType | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [practiceCompletion, setPracticeCompletion] = useState<PracticeCompletion | null>(null);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    let active = true;
    const loader = practice ? loadPracticeActivity : loadActivity;
    void loader(activityId).then((loaded) => {
      if (!active) return;
      if (!loaded) setMissing(true);
      else setActivity(loaded);
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : "Could not load activity."));
    return () => { active = false; };
  }, [activityId, practice]);

  const variants = useMemo(() => !practice && activity ? compatibleVariants(activity) : [], [activity, practice]);
  const derivedArcade = useMemo(() => activity ? getDerivedArcadeReadiness(activity) : { quiz: 0, gap: 0, sentenceBuilder: 0, modes: [] as GameType[] }, [activity]);
  const liveQuestionPools = practice ? { quiz: 0, gap: 0 } : derivedArcade;
  const liveReady = liveQuestionPools.quiz >= 2 || liveQuestionPools.gap >= 2;
  const wildcardReady = liveQuestionPools.quiz >= 12 || liveQuestionPools.gap >= 12;

  if (error && !activity) {
    return <main className="not-found"><span><AppIcon name="exclamation-triangle" /></span><h1>Could not open activity</h1><p>{error}</p><Link className="button button-primary" href={practice ? "/" : "/dashboard"}>{practice ? "ClassPlay home" : "Back to library"}</Link></main>;
  }
  if (missing) {
    return <main className="not-found"><span><AppIcon name="search" /></span><h1>{practice ? "Practice link unavailable" : "Activity not found"}</h1><p>{practice ? "This practice link may have been turned off by your teacher." : "This activity may have been deleted or belongs to another workspace."}</p><Link className="button button-primary" href={practice ? "/" : "/dashboard"}>{practice ? "ClassPlay home" : "Back to library"}</Link></main>;
  }
  if (!activity) return <main className="loading-screen">Loading ClassPlay…</main>;

  function complete(game: GameType, score: number, correct: number, total: number) {
    if (practice) {
      setPracticeCompletion({ game, score, correct, total });
      return;
    }
    addGameResult({ game, activityId: activity!.id, score, correct, total, completedAt: new Date().toISOString() });
  }

  function replayPractice() {
    setPracticeCompletion(null);
    setRunKey((current) => current + 1);
  }

  function leavePracticeGame() {
    setPracticeCompletion(null);
    setMode(null);
    setRunKey((current) => current + 1);
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

  async function sharePracticeLink() {
    setSharing(true); setError(""); setShareMessage("");
    try {
      const saved = await publishActivityForPractice(activity!);
      setActivity(saved);
      const url = `${window.location.origin}/practice/${saved.id}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareMessage("Practice link copied to clipboard.");
      } catch {
        setShareMessage(url);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the practice link.");
    } finally {
      setSharing(false);
    }
  }

  async function stopSharingPractice() {
    setSharing(true); setError(""); setShareMessage("");
    try {
      const saved = await unpublishActivityFromPractice(activity!);
      setActivity(saved);
      setShareMessage("Practice link turned off.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not turn off the practice link.");
    } finally {
      setSharing(false);
    }
  }

  if (mode) {
    const GameComponent = GAME_COMPONENTS[mode];
    const common = { activity, onComplete: (score: number, correct: number, total: number) => complete(mode, score, correct, total) };
    const gameKey = `${mode}-${runKey}`;
    return (
      <main className={`play-screen ${isArcadeMode(mode) ? "arcade-play-screen" : ""} ${practice ? "student-practice-play" : ""}`}>
        <header className="play-header">
          {practice ? <Link className="play-brand" href="/"><b>C</b><span>ClassPlay</span></Link> : <button className="play-brand" onClick={() => setMode(null)}><b>C</b><span>ClassPlay</span></button>}
          <div className="play-title"><small>{practice ? "Student practice" : activity.topic}</small><strong>{activity.title}</strong></div>
          <div className="play-header-actions"><SettingsPanel compact /><button className="button button-soft button-small" onClick={() => { setPracticeCompletion(null); setMode(null); }}><AppIcon name="arrow-left" /> Game modes</button></div>
        </header>
        <section className="play-canvas"><GameComponent key={gameKey} {...common} /></section>
        {practice && practiceCompletion && (
          <PracticeLeaderboard
            activityId={activity.id}
            game={practiceCompletion.game}
            score={practiceCompletion.score}
            correct={practiceCompletion.correct}
            total={practiceCompletion.total}
            onReplay={replayPractice}
            onOtherGames={leavePracticeGame}
          />
        )}
      </main>
    );
  }

  const enabledCoreGames = activity.enabledGames.filter((game) => !isArcadeMode(game));
  const enabledArcadeGames = activity.enabledGames.filter(isArcadeMode);
  const availableArcadeGames: GameType[] = [...enabledArcadeGames];
  for (const game of derivedArcade.modes) {
    if (!availableArcadeGames.includes(game)) availableArcadeGames.push(game);
  }
  const derivedModeCount = derivedArcade.modes.filter((game) => !activity.enabledGames.includes(game)).length;
  const teacherModeCount = activity.enabledGames.length + derivedModeCount + (liveReady ? 1 : 0) + (wildcardReady ? 1 : 0);
  const practiceModeCount = activity.enabledGames.length + derivedModeCount;

  function modeCard(game: GameType) {
    const info = GAME_MODE_CATALOG[game];
    return <button key={game} className={`mode-card ${info.colorClass}`} onClick={() => { setPracticeCompletion(null); setMode(game); }}><span className="mode-icon"><AppIcon name={info.icon} /></span><span><strong>{info.name}</strong><small>{info.pickerDescription}</small></span><i><AppIcon name="arrow-right" /></i></button>;
  }

  if (practice) {
    return (
      <main className="mode-screen practice-mode-screen">
        <header className="mode-header"><Link className="play-brand" href="/"><b>C</b><span>ClassPlay</span></Link><div className="mode-header-actions"><span className="practice-link-badge"><AppIcon name="link-45deg" /> Practice link</span><SettingsPanel compact /></div></header>
        <section className="mode-hero practice-hero">
          <span className="eyebrow">Choose your challenge</span>
          <h1>{activity.title}</h1>
          <p>{activity.description}</p>
          <div className="mode-meta"><span>{activity.grade}</span><span>{activity.level}</span><span>{activity.items.length} items</span></div>
          <div className="practice-hero-note"><AppIcon name="trophy" /><div><b>Play for the Top 10</b><span>Finish a game, enter your name, and see how your score compares with other players.</span></div></div>
        </section>
        <section className="mode-picker">
          <div className="mode-picker-heading"><div><small>CHOOSE A MODE</small><h2>What do you want to practise?</h2></div><span>{practiceModeCount} games available</span></div>
          {enabledCoreGames.length > 0 && <div className="mode-grid">{enabledCoreGames.map(modeCard)}</div>}
          {availableArcadeGames.length > 0 && <section className="arcade-mode-section"><div className="arcade-mode-heading"><div><small>CLASSPLAY ARCADE</small><h3>Move more. Play louder.</h3></div><span><AppIcon name="controller" /></span></div><div className="mode-grid arcade-mode-grid">{availableArcadeGames.map(modeCard)}</div></section>}
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
        {error && <div className="alert-error practice-share-error">{error}</div>}
        <div className="teacher-play-actions">
          {liveReady ? <div className="connected-cta"><div><b><AppIcon name="wifi" /> Connected Classroom</b><span>Run live modes on the projector; student phones are available when a mode uses or supports them.</span></div><Link href={`/host/new?activity=${encodeURIComponent(activity.id)}`} className="button button-primary">Start live room <AppIcon name="arrow-right" /></Link></div> : <div className="connected-cta"><div><b><AppIcon name="wifi-off" /> Connected Classroom needs question-ready content</b><span>Add at least two prompt + answer pairs or two usable Gap Fill sentences before hosting live.</span></div><Link href={`/edit/${activity.id}`} className="button button-primary">Prepare live content <AppIcon name="arrow-right" /></Link></div>}
          <div className={`practice-share-cta ${activity.visibility === "unlisted" ? "shared" : ""}`}>
            <div><b><AppIcon name="send" /> Student practice link</b><span>{activity.visibility === "unlisted" ? "Anyone with the link can practise and join each game's Top 10." : "Create an unlisted link students can use for independent practice."}</span>{shareMessage && <small className="practice-share-message">{shareMessage}</small>}</div>
            <div className="practice-share-actions">
              <button className="button button-primary" disabled={sharing} onClick={() => void sharePracticeLink()}>{sharing ? "Working…" : <>{activity.visibility === "unlisted" ? "Copy link" : "Create link"} <AppIcon name="link-45deg" /></>}</button>
              {activity.visibility === "unlisted" && <button className="button button-soft" disabled={sharing} onClick={() => void stopSharingPractice()}>Turn off</button>}
            </div>
          </div>
        </div>
      </section>
      <section className="mode-picker">
        <div className="mode-picker-heading"><div><small>CHOOSE A MODE</small><h2>How do you want to practise?</h2></div><span>{teacherModeCount} modes available</span></div>
        {enabledCoreGames.length > 0 && <div className="mode-grid">{enabledCoreGames.map(modeCard)}</div>}
        {availableArcadeGames.length > 0 && <section className="arcade-mode-section"><div className="arcade-mode-heading"><div><small>CLASSPLAY ARCADE</small><h3>Move more. Play louder.</h3></div><span><AppIcon name="controller" /></span></div><div className="mode-grid arcade-mode-grid">{availableArcadeGames.map(modeCard)}</div></section>}
        {liveReady && <section className="arcade-mode-section"><div className="arcade-mode-heading"><div><small>CLASSPLAY LIVE</small><h3>Party modes for the whole room.</h3></div><span><AppIcon name="wifi" /></span></div><div className="mode-grid arcade-mode-grid"><Link href={`/host/new?activity=${encodeURIComponent(activity.id)}&mode=dynamite`} className="mode-card pink"><span className="mode-icon"><AppIcon name="fire" /></span><span><strong>Dynamite</strong><small>LIVE ONLY · Pass it before it blows!</small></span><i><AppIcon name="arrow-right" /></i></Link>{wildcardReady && <Link href={`/host/new?activity=${encodeURIComponent(activity.id)}&mode=wildcard-grid`} className="mode-card green"><span className="mode-icon"><AppIcon name="grid-3x3-gap-fill" /></span><span><strong>Wildcard Grid</strong><small>LIVE ONLY · Pick a tile. Answer. Expect a twist.</small></span><i><AppIcon name="arrow-right" /></i></Link>}</div></section>}

        <section className="compatible-variants-panel">
          <div className="compatible-variants-heading">
            <div><small>SMART VARIANTS</small><h2>{variants.length ? "Your content can do more." : "Want to unlock more ways to play?"}</h2><p>{variants.length ? "ClassPlay found other game modes that can use the content you already created. Add them without retyping anything." : "Edit this activity and add richer source content. ClassPlay will detect new compatible modes automatically."}</p></div>
            <span className="smart-engine-mark"><AppIcon name="stars" /></span>
          </div>
          {variants.length > 0 ? <div className="compatible-variant-grid">{variants.map((variant) => {
            const info = GAME_MODE_CATALOG[variant.mode];
            const arcade = isArcadeMode(variant.mode);
            return <article className={`compatible-variant-card ${info.colorClass} ${arcade ? "arcade-variant" : ""}`} key={variant.mode}><span className="variant-icon"><AppIcon name={info.icon} /></span><div><small>{arcade ? "ARCADE READY" : "READY TO GENERATE"}</small><strong>{info.name}</strong><p>{variant.reason}</p>{variant.generated.length > 0 && <span className="generated-note"><AppIcon name="lightning-charge" /> Generates {variant.generated.join(" + ")}</span>}</div><button className="button button-dark button-small" disabled={addingMode === variant.mode} onClick={() => void addVariant(variant.mode)}>{addingMode === variant.mode ? "Adding…" : <>Add mode <AppIcon name="plus-lg" /></>}</button></article>;
          })}</div> : <Link href={`/edit/${activity.id}`} className="button button-soft">Edit content to unlock variants <AppIcon name="arrow-right" /></Link>}
        </section>
      </section>
    </main>
  );
}

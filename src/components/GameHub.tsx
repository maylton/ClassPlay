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
import { GameIcon, ToneIcon } from "./GameIcon";
import { GAME_COMPONENTS } from "./games/game-registry";
import { LeaderboardModerationPanel } from "./leaderboard/LeaderboardModerationPanel";
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
  const [moderating, setModerating] = useState(false);

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

  useEffect(() => {
    if (mode) window.scrollTo({ top: 0, behavior: "auto" });
  }, [mode]);

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
          <div className="play-title"><small>{GAME_MODE_CATALOG[mode].name}</small><strong>{activity.title}</strong></div>
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
  const liveModeCount = liveReady ? (wildcardReady ? 2 : 1) : 0;

  function modeTile(game: GameType) {
    const info = GAME_MODE_CATALOG[game];
    return (
      <button key={game} type="button" className="cp-mode-tile" onClick={() => { setPracticeCompletion(null); setMode(game); }}>
        <GameIcon game={game} />
        <span><b>{info.name}</b><small>{info.pickerDescription}</small></span>
      </button>
    );
  }

  const gameGroups = (
    <>
      {enabledCoreGames.length > 0 && (
        <section className="cp-mode-group" aria-labelledby="classic-games">
          <h2 className="cp-mode-group-title" id="classic-games">Classic games <small>{enabledCoreGames.length}</small></h2>
          <div className="cp-mode-grid">{enabledCoreGames.map(modeTile)}</div>
        </section>
      )}
      {availableArcadeGames.length > 0 && (
        <section className="cp-mode-group" aria-labelledby="arcade-games">
          <h2 className="cp-mode-group-title" id="arcade-games">Arcade <small>{availableArcadeGames.length}</small></h2>
          <div className="cp-mode-grid">{availableArcadeGames.map(modeTile)}</div>
        </section>
      )}
    </>
  );

  const heading = (
    <div>
      <span className="eyebrow">{practice ? "Practice" : activity.topic}</span>
      <h1>{activity.title}</h1>
      {activity.description && <p>{activity.description}</p>}
      <div className="cp-hub-tags"><span className="cp-tag">{activity.grade}</span><span className="cp-tag">{activity.level}</span><span className="cp-tag">{activity.items.length} items</span></div>
    </div>
  );

  if (practice) {
    return (
      <main className="mode-screen cp-hub practice-mode-screen">
        <header className="mode-header"><Link className="play-brand" href="/"><b>C</b><span>ClassPlay</span></Link><div className="mode-header-actions"><span className="cp-tag green"><AppIcon name="link-45deg" /> Practice link</span><SettingsPanel compact /></div></header>
        <div className="cp-page">
          <div className="cp-hub-head">{heading}</div>
          <div className="cp-banner"><ToneIcon icon="trophy" tone="butter" /><div><b>Play for the Top 10</b><p>Finish a game, enter your name and see how your score compares with other players.</p></div></div>
          {gameGroups}
        </div>
      </main>
    );
  }

  return (
    <main className="mode-screen cp-hub">
      <header className="mode-header"><Link className="play-brand" href="/dashboard"><b>C</b><span>ClassPlay</span></Link><div className="mode-header-actions"><SettingsPanel compact /><Link href={`/edit/${activity.id}`} className="button button-soft button-small"><AppIcon name="pencil" /> Edit</Link><Link href="/dashboard" className="button button-soft button-small"><AppIcon name="arrow-left" /> Library</Link></div></header>
      <div className="cp-page">
        <div className="cp-hub-head">
          {heading}
          <div className="cp-hub-actions">
            {liveReady
              ? <Link href={`/host/new?activity=${encodeURIComponent(activity.id)}`} className="button button-primary button-large"><AppIcon name="broadcast" /> Start live room</Link>
              : <Link href={`/edit/${activity.id}`} className="button button-soft">Prepare live content <AppIcon name="arrow-right" /></Link>}
          </div>
        </div>
        {error && <div className="alert-error practice-share-error">{error}</div>}

        <div className="cp-rows">
          {!liveReady && (
            <div className="cp-row"><ToneIcon icon="wifi-off" tone="butter" /><div><b>Live room needs question-ready content</b><small>Add at least two prompt + answer pairs or two Gap Fill sentences to host a live room.</small></div></div>
          )}
          <div className="cp-row">
            <ToneIcon icon="link-45deg" tone="mint" />
            <div><b>Student practice link</b><small>{activity.visibility === "unlisted" ? "On — anyone with the link can practise and join each game’s Top 10." : "Students practise on their own and join each game’s Top 10."}</small></div>
            <div className="cp-row-actions">
              <button className="button button-soft button-small" disabled={sharing} onClick={() => void sharePracticeLink()}>{sharing ? "Working…" : <><AppIcon name={activity.visibility === "unlisted" ? "copy" : "link-45deg"} /> {activity.visibility === "unlisted" ? "Copy link" : "Create link"}</>}</button>
              {activity.visibility === "unlisted" && <button className="button button-soft button-small" disabled={sharing} onClick={() => setModerating(true)}><AppIcon name="shield-check" /> Moderate scores</button>}
              {activity.visibility === "unlisted" && <button className="cp-link-button" disabled={sharing} onClick={() => void stopSharingPractice()}>Turn off</button>}
            </div>
            {shareMessage && <p className="cp-row-note">{shareMessage}</p>}
          </div>
        </div>

        {gameGroups}

        {liveReady && (
          <section className="cp-mode-group" aria-labelledby="live-games">
            <h2 className="cp-mode-group-title" id="live-games">Live with the whole class <small>{liveModeCount}</small></h2>
            <div className="cp-mode-grid">
              <Link href={`/host/new?activity=${encodeURIComponent(activity.id)}&mode=dynamite`} className="cp-mode-tile"><ToneIcon icon="fire" tone="rose" /><span><b>Dynamite</b><small>Pass it before it blows. Last player standing wins.</small></span></Link>
              {wildcardReady && <Link href={`/host/new?activity=${encodeURIComponent(activity.id)}&mode=wildcard-grid`} className="cp-mode-tile"><ToneIcon icon="grid-3x3-gap-fill" tone="mint" /><span><b>Wildcard Grid</b><small>Teams pick tiles, answer and get a twist.</small></span></Link>}
            </div>
          </section>
        )}

        <section className="cp-mode-group" aria-labelledby="more-games">
          <h2 className="cp-mode-group-title" id="more-games">Unlock more games <small>{variants.length}</small></h2>
          {variants.length > 0 ? (
            <div className="cp-rows">
              {variants.map((variant) => (
                <div className="cp-row" key={variant.mode}>
                  <GameIcon game={variant.mode} />
                  <div><b>{GAME_MODE_CATALOG[variant.mode].name}</b><small>{variant.reason}</small></div>
                  <button className="button button-soft button-small" disabled={addingMode === variant.mode} onClick={() => void addVariant(variant.mode)}>{addingMode === variant.mode ? "Adding…" : <><AppIcon name="plus-lg" /> Add</>}</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="cp-muted-note">Your content already uses every game that fits. Add example sentences or more items in <Link href={`/edit/${activity.id}`}>Edit</Link> to unlock more.</p>
          )}
        </section>
      </div>
      {moderating && <LeaderboardModerationPanel activityId={activity.id} onClose={() => setModerating(false)} />}
    </main>
  );
}

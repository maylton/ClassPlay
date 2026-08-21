"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { ActivityImage } from "@/components/media/ActivityImage";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { playArcadeTone } from "@/lib/arcade-audio";
import {
  buildEchoChainGame,
  buildEchoChainItems,
  echoChainMatches,
  ECHO_CHAIN_DIFFICULTIES,
  ECHO_CHAIN_MIN_ITEMS,
  resolveEchoChainRound,
  type EchoChainDifficulty,
} from "@/lib/echo-chain-engine";
import {
  cancelEnglishSpeech,
  prepareEnglishVoice,
  speakEnglish,
  speakEnglishSequence,
  type EnglishVoiceProfile,
} from "@/lib/tts";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

type EchoPhase = "ready" | "speaking" | "answering" | "feedback";
type EchoFeedback = "correct" | "wrong" | null;
type VoiceStatus = "loading" | "ready" | "unavailable";

const DIFFICULTY_OPTIONS: { id: EchoChainDifficulty; kicker: string; icon: string }[] = [
  { id: "easy", kicker: "FIND THE BEAT", icon: "volume-up" },
  { id: "medium", kicker: "BUILD THE CHAIN", icon: "soundwave" },
  { id: "challenge", kicker: "MEMORY MIX", icon: "headphones" },
];

export function EchoChainGame({ activity, onComplete }: GameProps) {
  const { settings } = useClassroomSettings();
  const readyItems = useMemo(() => buildEchoChainItems(activity.items), [activity.items]);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("loading");
  const [voice, setVoice] = useState<EnglishVoiceProfile | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [difficulty, setDifficulty] = useState<EchoChainDifficulty | null>(null);
  const game = useMemo(() => difficulty ? buildEchoChainGame(activity.items, difficulty) : null, [activity.items, difficulty]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [replays, setReplays] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [phase, setPhase] = useState<EchoPhase>("ready");
  const [feedback, setFeedback] = useState<EchoFeedback>(null);
  const [speakingIndex, setSpeakingIndex] = useState(-1);
  const [finished, setFinished] = useState(false);
  const answerStartedAtRef = useRef(0);
  const playRunRef = useRef(0);
  const voiceRequestRef = useRef(0);
  const advanceTimerRef = useRef<number | null>(null);

  const round = game?.rounds[roundIndex];
  const boardById = useMemo(() => new Map((game?.board ?? []).map((item) => [item.itemId, item])), [game]);
  const expectedItems = useMemo(() => (round?.itemIds ?? []).map((itemId) => boardById.get(itemId)).filter(Boolean), [boardById, round]);
  const difficultyConfig = difficulty ? ECHO_CHAIN_DIFFICULTIES[difficulty] : null;

  const checkVoice = useCallback(async () => {
    const request = voiceRequestRef.current + 1;
    voiceRequestRef.current = request;
    setVoiceStatus("loading");
    const profile = await prepareEnglishVoice(1800);
    if (request !== voiceRequestRef.current) return;
    setVoice(profile);
    setVoiceStatus(profile ? "ready" : "unavailable");
  }, []);

  useEffect(() => {
    const request = voiceRequestRef.current + 1;
    voiceRequestRef.current = request;
    void prepareEnglishVoice(1800).then((profile) => {
      if (request !== voiceRequestRef.current) return;
      setVoice(profile);
      setVoiceStatus(profile ? "ready" : "unavailable");
    });
    return () => { voiceRequestRef.current += 1; };
  }, []);

  useEffect(() => () => {
    playRunRef.current += 1;
    cancelEnglishSpeech();
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
  }, []);

  const resetRun = useCallback(() => {
    playRunRef.current += 1;
    cancelEnglishSpeech();
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    setRoundIndex(0);
    setScore(0);
    setCorrectCount(0);
    setStreak(0);
    setBestStreak(0);
    setReplays(0);
    setSelected([]);
    setPhase("ready");
    setFeedback(null);
    setSpeakingIndex(-1);
    setFinished(false);
    setVoiceError("");
  }, []);

  function chooseDifficulty(nextDifficulty: EchoChainDifficulty) {
    resetRun();
    setDifficulty(nextDifficulty);
  }

  const advance = useCallback((nextScore: number, nextCorrect: number) => {
    if (!game) return;
    if (roundIndex >= game.rounds.length - 1) {
      setFinished(true);
      onComplete(nextScore, nextCorrect, game.rounds.length);
      return;
    }
    setRoundIndex((current) => current + 1);
    setReplays(0);
    setSelected([]);
    setFeedback(null);
    setSpeakingIndex(-1);
    setPhase("ready");
  }, [game, onComplete, roundIndex]);

  const submitSequence = useCallback((nextSelected: string[]) => {
    if (!round || !difficulty || phase !== "answering") return;
    const correct = echoChainMatches(nextSelected, round.itemIds);
    const result = resolveEchoChainRound({
      correct,
      responseMs: Math.max(0, performance.now() - answerStartedAtRef.current),
      streak,
      replays,
      sequenceLength: round.itemIds.length,
      difficulty,
    });
    const nextScore = score + result.points;
    const nextCorrect = correctCount + (correct ? 1 : 0);
    setScore(nextScore);
    setCorrectCount(nextCorrect);
    setStreak(result.nextStreak);
    setBestStreak((current) => Math.max(current, result.nextStreak));
    setFeedback(correct ? "correct" : "wrong");
    setPhase("feedback");
    playArcadeTone(settings.soundEnabled, correct ? "correct" : "wrong");
    advanceTimerRef.current = window.setTimeout(
      () => advance(nextScore, nextCorrect),
      settings.reducedMotion ? 850 : 1600,
    );
  }, [advance, correctCount, difficulty, phase, replays, round, score, settings.reducedMotion, settings.soundEnabled, streak]);

  const selectTile = useCallback((itemId: string) => {
    if (!round || phase !== "answering" || selected.includes(itemId)) return;
    const nextSelected = [...selected, itemId];
    setSelected(nextSelected);
    if (nextSelected.length === round.itemIds.length) submitSequence(nextSelected);
  }, [phase, round, selected, submitSequence]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (phase !== "answering" || event.altKey || event.ctrlKey || event.metaKey) return;
      const index = Number(event.key) - 1;
      const item = game?.board[index];
      if (Number.isInteger(index) && item) selectTile(item.itemId);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [game, phase, selectTile]);

  async function playSequence(replay = false) {
    if (!round || expectedItems.length !== round.itemIds.length || phase === "speaking") return;
    const playRun = playRunRef.current + 1;
    playRunRef.current = playRun;
    setVoiceError("");
    setFeedback(null);
    setSelected([]);
    setSpeakingIndex(0);
    setPhase("speaking");
    if (replay) setReplays((current) => current + 1);
    const spoken = await speakEnglishSequence(expectedItems.map((item) => item!.spokenText), {
      pauseMs: settings.reducedMotion ? 260 : 460,
      rate: 0.88,
      onSegmentStart: setSpeakingIndex,
    });
    if (playRun !== playRunRef.current) return;
    setSpeakingIndex(-1);
    if (!spoken) {
      setVoiceError("The English voice stopped unexpectedly. Check this device's audio and try again.");
      setPhase("ready");
      return;
    }
    answerStartedAtRef.current = performance.now();
    setPhase("answering");
  }

  function replayGame() {
    resetRun();
    setDifficulty(null);
  }

  function testAudio() {
    const sample = readyItems[0]?.spokenText;
    if (sample) speakEnglish(sample);
  }

  if (readyItems.length < ECHO_CHAIN_MIN_ITEMS) {
    return <div className="empty-game"><span><AppIcon name="headphones" /></span><h2>Echo Chain needs more listening-ready content.</h2><p>Add at least {ECHO_CHAIN_MIN_ITEMS} items with a clear prompt, distinct answer and, ideally, a complete English example sentence.</p></div>;
  }

  if (!difficulty) {
    return (
      <div className={`arcade-stage echo-chain echo-setup ${settings.reducedMotion ? "reduced-motion" : ""}`}>
        <section className="echo-setup-hero">
          <span className="echo-eyebrow"><AppIcon name="headphones" /> ECHO CHAIN</span>
          <h1>Listen. Hold the chain. Tap it back.</h1>
          <p>The words stay hidden while they play. Rebuild each audio sequence from the persistent language grid.</p>
          <div className={`echo-voice-check status-${voiceStatus}`}>
            <span><AppIcon name={voiceStatus === "ready" ? "volume-up-fill" : voiceStatus === "loading" ? "hourglass-split" : "volume-mute-fill"} /></span>
            <div>
              <small>AUDIO CHECK</small>
              <strong>{voiceStatus === "loading" ? "Finding the best English voice…" : voiceStatus === "ready" ? `${voice?.name} · ${voice?.lang}` : "No English voice is available"}</strong>
              <p>{voiceStatus === "ready" ? `${voice?.quality === "enhanced" ? "Enhanced" : "Best available"} voice selected automatically. Audio comes from this activity's own language.` : voiceStatus === "unavailable" ? "Install or enable an English system voice before playing this listening mode." : "The game will unlock as soon as the device voice list is ready."}</p>
            </div>
            {voiceStatus === "ready" ? <button type="button" onClick={testAudio}><AppIcon name="play-fill" /> Test audio</button> : voiceStatus === "unavailable" ? <button type="button" onClick={() => void checkVoice()}><AppIcon name="arrow-repeat" /> Check again</button> : null}
          </div>
        </section>
        <div className="echo-difficulty-grid">
          {DIFFICULTY_OPTIONS.map((option) => {
            const config = ECHO_CHAIN_DIFFICULTIES[option.id];
            return (
              <button type="button" className={`echo-difficulty-card difficulty-${option.id}`} disabled={voiceStatus !== "ready"} onClick={() => chooseDifficulty(option.id)} key={option.id}>
                <span className="echo-difficulty-icon"><AppIcon name={option.icon} /></span>
                <small>{option.kicker}</small>
                <h2>{config.label}</h2>
                <p>{config.description}</p>
                <div><span>Longest chain</span><b>{Math.max(...config.pattern)} echoes</b></div>
                <strong>Play {config.label} <AppIcon name="arrow-right" /></strong>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (!game || !round || !difficultyConfig) {
    return <div className="empty-game"><span><AppIcon name="headphones" /></span><h2>This Echo Chain could not be prepared.</h2><p>Check that the activity still has at least six distinct listening pairs.</p><button className="button button-primary" type="button" onClick={() => setDifficulty(null)}>Choose another level</button></div>;
  }

  if (finished) {
    return (
      <div className="echo-finish-shell">
        <div className="echo-final-banner"><span><AppIcon name="headphones" /></span><div><small>CHAIN COMPLETE · {difficultyConfig.label}</small><strong>{correctCount}/{game.rounds.length} sequences rebuilt</strong><p>Best listening streak ×{bestStreak}</p></div></div>
        <CompletionCard score={score} correct={correctCount} total={game.rounds.length} onReplay={replayGame} />
      </div>
    );
  }

  return (
    <div className={`arcade-stage echo-chain phase-${phase} ${settings.reducedMotion ? "reduced-motion" : ""}`}>
      <div className="arcade-hud echo-hud">
        <div><small>CHAIN</small><strong>{roundIndex + 1}/{game.rounds.length}</strong></div>
        <div><small>SCORE</small><strong>{score}</strong></div>
        <div><small>LENGTH</small><strong>{round.itemIds.length}</strong></div>
        <div><small>STREAK</small><strong>{streak ? `×${streak}` : "—"}</strong></div>
      </div>

      <div className="echo-game-layout">
        <section className="echo-listening-console">
          <div className="echo-console-topline"><span className="echo-eyebrow"><AppIcon name="broadcast" /> LISTENING CHANNEL</span><b>{difficultyConfig.label}</b></div>
          <div className={`echo-speaker ${phase === "speaking" ? "is-speaking" : ""}`} aria-hidden="true"><i /><i /><i /><span><AppIcon name="volume-up-fill" /></span></div>
          <div className="echo-pulse-row" aria-label={phase === "speaking" ? `Playing echo ${speakingIndex + 1} of ${round.itemIds.length}` : `${round.itemIds.length} echoes in this chain`}>
            {round.itemIds.map((itemId, index) => <i className={phase === "speaking" && index === speakingIndex ? "active" : phase === "answering" || phase === "feedback" ? "heard" : ""} key={itemId} />)}
          </div>
          <h2>{phase === "ready" ? "Ready for the next chain?" : phase === "speaking" ? `Echo ${speakingIndex + 1} of ${round.itemIds.length}` : phase === "answering" ? "Tap the echoes in the order you heard them." : feedback === "correct" ? "Chain locked!" : "That order slipped away."}</h2>
          <p>{phase === "ready" ? "The written phrase stays hidden until your attempt is complete." : phase === "speaking" ? "Listen closely — the grid unlocks when the final voice ends." : phase === "answering" ? `${selected.length}/${round.itemIds.length} selected · replaying reduces only the score bonus.` : "The transcript is revealed below before the next chain."}</p>
          {phase === "ready" && <button type="button" className="echo-play-button" onClick={() => void playSequence(false)}><AppIcon name="play-fill" /> Play sequence</button>}
          {phase === "answering" && <button type="button" className="echo-replay-button" onClick={() => void playSequence(true)}><AppIcon name="arrow-repeat" /> Hear it again {replays ? `· ${replays} used` : ""}</button>}
          {voiceError && <div className="echo-audio-error"><AppIcon name="exclamation-triangle-fill" /> {voiceError}</div>}
          {phase === "feedback" && (
            <div className={`echo-transcript feedback-${feedback}`} aria-live="polite">
              <strong><AppIcon name={feedback === "correct" ? "check-circle-fill" : "x-circle-fill"} /> {feedback === "correct" ? "Perfect listening" : "Correct echo order"}</strong>
              <ol>{expectedItems.map((item) => <li key={item!.itemId}><span>{item!.spokenText}</span><small>{item!.tileText}</small></li>)}</ol>
            </div>
          )}
        </section>

        <section className="echo-board-shell">
          <div className="echo-board-heading"><div><small>LANGUAGE GRID</small><strong>{phase === "answering" ? "Build the chain" : phase === "feedback" ? "Transcript revealed" : "Listen first"}</strong></div><span>{game.board.length} tiles</span></div>
          <div className="echo-board">
            {game.board.map((item, index) => {
              const selectionIndex = selected.indexOf(item.itemId);
              return (
                <button
                  type="button"
                  className={selectionIndex >= 0 ? "selected" : ""}
                  disabled={phase !== "answering" || selectionIndex >= 0}
                  onClick={() => selectTile(item.itemId)}
                  key={item.itemId}
                  aria-label={`Tile ${index + 1}: ${item.tileText}`}
                >
                  <kbd>{index + 1}</kbd>
                  {item.imageUrl && <ActivityImage refValue={item.imageUrl} alt="" className="echo-tile-image" />}
                  <strong>{item.tileText}</strong>
                  {selectionIndex >= 0 && <i>{selectionIndex + 1}</i>}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <p className="arcade-key-help">Use headphones or classroom speakers · listen first · tap the matching language tiles in the same order</p>
    </div>
  );
}

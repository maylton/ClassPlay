"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { useQuestionTimer } from "@/hooks/useQuestionTimer";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { playArcadeTone } from "@/lib/arcade-audio";
import {
  BOSS_BATTLE_STARTING_HEARTS,
  bossForKind,
  bossMaxHp,
  buildBossBattleRounds,
  chooseBossBattleSource,
  resolveBossBattleHit,
} from "@/lib/boss-battle-engine";
import type { GameProps } from "./GameTypes";

export function BossBattleGame({ activity, onComplete }: GameProps) {
  const { settings } = useClassroomSettings();
  const quizItems = useMemo(() => getPlayableItemsForMode(activity.items, "quiz"), [activity.items]);
  const gapItems = useMemo(() => getPlayableItemsForMode(activity.items, "gap-fill"), [activity.items]);
  const source = useMemo(
    () => chooseBossBattleSource(activity.kind, quizItems.length, gapItems.length),
    [activity.kind, gapItems.length, quizItems.length],
  );
  const sourceItems = source === "gap-fill" ? gapItems : source === "quiz" ? quizItems : [];
  const rounds = useMemo(() => source ? buildBossBattleRounds(sourceItems, source) : [], [source, sourceItems]);
  const boss = useMemo(() => bossForKind(activity.kind), [activity.kind]);
  const maxHp = useMemo(() => bossMaxHp(rounds.length), [rounds.length]);

  const [roundIndex, setRoundIndex] = useState(0);
  const [bossHp, setBossHp] = useState(maxHp);
  const [hearts, setHearts] = useState(BOSS_BATTLE_STARTING_HEARTS);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [locked, setLocked] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"hit" | "critical" | "wrong" | null>(null);
  const [damageFlash, setDamageFlash] = useState(0);
  const [outcome, setOutcome] = useState<"victory" | "defeat" | null>(null);
  const round = rounds[roundIndex];
  const { stop } = useQuestionTimer(round?.itemId ?? "boss-empty");

  useEffect(() => {
    setBossHp(maxHp);
  }, [maxHp]);

  const finish = useCallback((result: "victory" | "defeat", nextScore: number, nextCorrect: number) => {
    setOutcome(result);
    onComplete(nextScore, nextCorrect, rounds.length);
  }, [onComplete, rounds.length]);

  const answer = useCallback((option: string) => {
    if (!round || locked || outcome) return;
    setLocked(true);
    setSelected(option);
    const responseMs = stop();
    const hit = resolveBossBattleHit(option === round.correctAnswer, responseMs, streak);
    const nextScore = score + hit.points;
    const nextCorrect = correctCount + (hit.correct ? 1 : 0);
    const nextHearts = Math.max(0, hearts - hit.heartsLost);
    const nextHp = Math.max(0, bossHp - hit.damage);

    setScore(nextScore);
    setCorrectCount(nextCorrect);
    setStreak(hit.nextStreak);
    setHearts(nextHearts);
    setBossHp(nextHp);
    setDamageFlash(hit.damage);
    setFeedback(hit.correct ? (hit.critical ? "critical" : "hit") : "wrong");
    playArcadeTone(settings.soundEnabled, hit.correct ? "correct" : "wrong");

    const won = nextHp === 0;
    const lostLives = nextHearts === 0;
    const outOfQuestions = roundIndex === rounds.length - 1;
    window.setTimeout(() => {
      if (won) return finish("victory", nextScore, nextCorrect);
      if (lostLives || outOfQuestions) return finish("defeat", nextScore, nextCorrect);
      setRoundIndex((current) => current + 1);
      setLocked(false);
      setSelected(null);
      setFeedback(null);
      setDamageFlash(0);
    }, settings.reducedMotion ? 280 : 720);
  }, [bossHp, correctCount, finish, hearts, locked, outcome, round, roundIndex, rounds.length, score, settings.reducedMotion, settings.soundEnabled, stop, streak]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!round || locked || outcome) return;
      const index = Number(event.key) - 1;
      if (index < 0 || index >= round.options.length) return;
      event.preventDefault();
      const option = round.options[index];
      if (option) answer(option);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answer, locked, outcome, round]);

  function replay() {
    window.dispatchEvent(new Event("classplay:game-replay"));
    setRoundIndex(0);
    setBossHp(maxHp);
    setHearts(BOSS_BATTLE_STARTING_HEARTS);
    setScore(0);
    setCorrectCount(0);
    setStreak(0);
    setLocked(false);
    setSelected(null);
    setFeedback(null);
    setDamageFlash(0);
    setOutcome(null);
  }

  if (!source || !rounds.length) {
    return <div className="empty-game"><span><AppIcon name="shield-shaded" /></span><h2>Boss Battle needs more question-ready content.</h2><p>Add at least three usable Quiz pairs or three Gap Fill sentences.</p></div>;
  }

  const hpPercent = Math.max(0, Math.round((bossHp / maxHp) * 100));
  const enraged = hpPercent <= 35 && !outcome;

  if (outcome) {
    return (
      <div className={`boss-result ${outcome}`}>
        <span className="boss-result-icon"><AppIcon name={outcome === "victory" ? "trophy-fill" : "heartbreak-fill"} /></span>
        <small>{outcome === "victory" ? "BOSS DEFEATED" : "RUN ENDED"}</small>
        <h2>{outcome === "victory" ? `${boss.name} is down!` : `${boss.name} survives this round.`}</h2>
        <p>{outcome === "victory" ? "Your streak broke through the final phase." : "Build the streak again and finish the fight."}</p>
        <div className="boss-result-stats"><div><b>{score}</b><span>Score</span></div><div><b>{correctCount}/{rounds.length}</b><span>Correct</span></div><div><b>{Math.max(0, hearts)}</b><span>Hearts</span></div></div>
        <button className="button button-primary button-large" onClick={replay}><AppIcon name="arrow-repeat" /> Fight again</button>
      </div>
    );
  }

  return (
    <div className={`arcade-stage boss-battle ${enraged ? "enraged" : ""} ${settings.reducedMotion ? "reduced-motion" : ""}`}>
      <div className="arcade-hud boss-hud">
        <div><small>ROUND</small><strong>{roundIndex + 1}/{rounds.length}</strong></div>
        <div><small>SCORE</small><strong>{score}</strong></div>
        <div><small>STREAK</small><strong>{streak ? `×${streak}` : "—"}</strong></div>
      </div>

      <section className="boss-arena" aria-label={`Battle against ${boss.name}`}>
        <div className="boss-status">
          <div><small>{enraged ? "ENRAGED" : "BOSS"}</small><h2>{boss.name}</h2><p>{boss.subtitle}</p></div>
          <div className="boss-hearts" aria-label={`${hearts} hearts remaining`}>
            {Array.from({ length: BOSS_BATTLE_STARTING_HEARTS }, (_, index) => <AppIcon key={index} name={index < hearts ? "heart-fill" : "heart"} />)}
          </div>
        </div>

        <div className="boss-hp-wrap" aria-label={`${bossHp} of ${maxHp} boss health remaining`}>
          <div className="boss-hp-label"><span>HP</span><b>{bossHp} / {maxHp}</b></div>
          <div className="boss-hp-track"><span style={{ width: `${hpPercent}%` }} /></div>
        </div>

        <div className={`boss-character ${boss.id} ${feedback === "hit" || feedback === "critical" ? "taking-hit" : ""}`} aria-hidden="true">
          <span className="boss-aura" />
          <span className="boss-body"><i className="boss-eye left" /><i className="boss-eye right" /><i className="boss-mouth" /></span>
          <span className="boss-arm left" /><span className="boss-arm right" />
          {damageFlash > 0 && <b className={`boss-damage ${feedback === "critical" ? "critical" : ""}`}>−{damageFlash}</b>}
        </div>

        <div className="boss-question-card">
          <div className="boss-question-meta"><span>{source === "gap-fill" ? "FILL THE GAP" : "QUIZ ATTACK"}</span>{round.hint && <small>Hint: {round.hint}</small>}</div>
          <strong>{round.prompt}</strong>
          <div className="boss-options">
            {round.options.map((option, index) => {
              const picked = selected === option;
              const right = locked && option === round.correctAnswer;
              const wrong = picked && option !== round.correctAnswer;
              return <button key={`${round.itemId}-${option}`} className={`${right ? "correct" : ""} ${wrong ? "wrong" : ""}`} disabled={locked} onClick={() => answer(option)}><kbd>{index + 1}</kbd><span>{option}</span></button>;
            })}
          </div>
          <div className="boss-feedback" aria-live="polite">
            {feedback === "critical" && <span className="critical"><AppIcon name="lightning-charge-fill" /> CRITICAL HIT!</span>}
            {feedback === "hit" && <span className="hit"><AppIcon name="crosshair" /> Direct hit!</span>}
            {feedback === "wrong" && <span className="wrong"><AppIcon name="heartbreak" /> Boss attack! Answer: <b>{round.correctAnswer}</b></span>}
          </div>
        </div>
      </section>
      <p className="arcade-key-help">Click or tap an answer · keyboard <kbd>1</kbd>–<kbd>{round.options.length}</kbd></p>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import { useQuestionTimer } from "@/hooks/useQuestionTimer";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { playArcadeTone } from "@/lib/arcade-audio";
import {
  PHRASE_FORGE_STARTING_HEAT,
  buildPhraseForgeRounds,
  phraseForgeHeatLabel,
  phraseForgeIsCorrect,
  resolvePhraseForgeAttempt,
} from "@/lib/phrase-forge-engine";
import { reorderWordTokens, type WordToken } from "@/lib/word-token-engine";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

function ForgeToken({ token, onRemove, locked }: { token: WordToken; onRemove: () => void; locked: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: token.id, disabled: locked });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 4 : undefined }}
      className={`forge-token ${isDragging ? "dragging" : ""}`}
    >
      <button type="button" className="forge-grip" {...attributes} {...listeners} disabled={locked} aria-label={`Drag ${token.text} to reorder`}><AppIcon name="grip-vertical" /></button>
      <button type="button" className="forge-token-text" disabled={locked} onClick={onRemove} title="Return this word to the conveyor">{token.text}</button>
    </div>
  );
}

export function PhraseForgeGame({ activity, onComplete }: GameProps) {
  const { settings } = useClassroomSettings();
  const items = useMemo(() => getPlayableItemsForMode(activity.items, "sentence-builder"), [activity.items]);
  const rounds = useMemo(() => buildPhraseForgeRounds(items), [items]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [pool, setPool] = useState<WordToken[]>(() => rounds[0]?.tokens ?? []);
  const [answer, setAnswer] = useState<WordToken[]>([]);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [heat, setHeat] = useState(PHRASE_FORGE_STARTING_HEAT);
  const [mistakes, setMistakes] = useState(0);
  const [feedback, setFeedback] = useState<"master" | "correct" | "wrong" | null>(null);
  const [hammering, setHammering] = useState(false);
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState(false);
  const round = rounds[roundIndex];
  const { elapsedMs, stop } = useQuestionTimer(round?.itemId ?? "forge-empty");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function loadRound(index: number) {
    setPool(rounds[index]?.tokens ?? []);
    setAnswer([]);
    setMistakes(0);
    setFeedback(null);
    setHammering(false);
    setLocked(false);
  }

  function addToken(token: WordToken) {
    if (locked) return;
    setPool((current) => current.filter((entry) => entry.id !== token.id));
    setAnswer((current) => [...current, token]);
    setFeedback(null);
  }

  function removeToken(token: WordToken) {
    if (locked) return;
    setAnswer((current) => current.filter((entry) => entry.id !== token.id));
    setPool((current) => [...current, token]);
    setFeedback(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (locked || !event.over) return;
    setAnswer((current) => reorderWordTokens(current, event.active.id, event.over!.id));
    setFeedback(null);
  }

  function hammerPhrase() {
    if (!round || locked || hammering || answer.length !== round.tokens.length) return;
    setHammering(true);
    const correct = phraseForgeIsCorrect(answer, round.target);
    const responseMs = correct ? stop() : elapsedMs;
    const result = resolvePhraseForgeAttempt({ correct, responseMs, streak, previousMistakes: mistakes, heat });
    setStreak(result.nextStreak);
    setHeat(result.nextHeat);
    playArcadeTone(settings.soundEnabled, correct ? "correct" : "wrong");

    if (!correct) {
      setMistakes((current) => current + 1);
      setFeedback("wrong");
      window.setTimeout(() => setHammering(false), settings.reducedMotion ? 120 : 500);
      return;
    }

    setLocked(true);
    setFeedback(result.masterForge ? "master" : "correct");
    const nextScore = score + result.points;
    const nextCorrect = correctCount + 1;
    setScore(nextScore);
    setCorrectCount(nextCorrect);
    window.setTimeout(() => {
      if (roundIndex === rounds.length - 1) {
        setFinished(true);
        onComplete(nextScore, nextCorrect, rounds.length);
        return;
      }
      const next = roundIndex + 1;
      setRoundIndex(next);
      loadRound(next);
    }, settings.reducedMotion ? 280 : result.masterForge ? 980 : 760);
  }

  function replay() {
    window.dispatchEvent(new Event("classplay:game-replay"));
    setRoundIndex(0);
    setScore(0);
    setCorrectCount(0);
    setStreak(0);
    setHeat(PHRASE_FORGE_STARTING_HEAT);
    setFinished(false);
    loadRound(0);
  }

  if (!rounds.length) return <div className="empty-game"><span><AppIcon name="hammer" /></span><h2>Phrase Forge needs complete sentences.</h2><p>Add at least two sentences that can be rebuilt word by word.</p></div>;
  if (finished) return <CompletionCard score={score} correct={correctCount} total={rounds.length} onReplay={replay} />;
  if (!round) return null;

  const heatLabel = phraseForgeHeatLabel(heat);
  return (
    <div className={`arcade-stage phrase-forge heat-${heatLabel.toLowerCase().replace(" ", "-")} ${settings.reducedMotion ? "reduced-motion" : ""}`}>
      <div className="arcade-hud forge-hud">
        <div><small>PHRASE</small><strong>{roundIndex + 1}/{rounds.length}</strong></div>
        <div><small>SCORE</small><strong>{score}</strong></div>
        <div><small>STREAK</small><strong>{streak ? `×${streak}` : "—"}</strong></div>
      </div>

      <div className="forge-heat-panel">
        <div><small>FORGE HEAT</small><strong>{heatLabel}</strong></div>
        <div className="forge-heat-track" aria-label={`Forge heat ${heat} percent`}><span style={{ width: `${heat}%` }} /></div>
        <b>{heat}%</b>
      </div>

      <section className={`forge-workshop ${feedback ? `feedback-${feedback}` : ""}`}>
        <div className="forge-backdrop" aria-hidden="true">
          <span className="forge-pipe pipe-a" /><span className="forge-pipe pipe-b" />
          <span className="forge-furnace"><i /><b /></span>
          <span className="forge-spark spark-a" /><span className="forge-spark spark-b" /><span className="forge-spark spark-c" />
        </div>

        <div className="forge-instruction">
          <small>PHRASE FORGE</small>
          <strong>Forge the sentence in the right order</strong>
          {round.hint && <span>Hint: {round.hint}</span>}
        </div>

        <div className={`forge-hammer ${hammering ? "is-hammering" : ""}`} aria-hidden="true"><span /><i /></div>
        <div className="forge-anvil" aria-hidden="true"><span /><i /></div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={answer.map((token) => token.id)} strategy={rectSortingStrategy}>
            <div className="forge-assembly" aria-label="Phrase on the anvil">
              {answer.length === 0 && <span className="forge-placeholder">Place word ingots on the anvil…</span>}
              {answer.map((token) => <ForgeToken key={token.id} token={token} locked={locked} onRemove={() => removeToken(token)} />)}
            </div>
          </SortableContext>
        </DndContext>

        <div className="forge-conveyor-wrap">
          <div className="forge-conveyor-label"><span>WORD INGOTS</span><small>{pool.length} remaining</small></div>
          <div className="forge-conveyor">
            <div className="forge-belt" aria-hidden="true" />
            <div className="forge-pool">{pool.map((token) => <button type="button" key={token.id} disabled={locked} onClick={() => addToken(token)}><span>{token.text}</span></button>)}</div>
          </div>
        </div>

        <div className="forge-feedback" aria-live="polite">
          {feedback === "master" && <span className="master"><AppIcon name="lightning-charge-fill" /> MASTER FORGE!</span>}
          {feedback === "correct" && <span className="correct"><AppIcon name="check-circle-fill" /> Phrase forged!</span>}
          {feedback === "wrong" && <span className="wrong"><AppIcon name="arrow-repeat" /> Reheat and reorder — your phrase stays on the anvil.</span>}
        </div>
      </section>

      <button className="button button-primary button-large forge-strike" disabled={locked || hammering || answer.length !== round.tokens.length} onClick={hammerPhrase}><AppIcon name="hammer" /> Hammer phrase</button>
      <p className="arcade-key-help">Tap ingots to add · tap assembled words to return · drag to reorder · wrong attempts keep your work</p>
    </div>
  );
}

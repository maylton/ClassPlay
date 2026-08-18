"use client";

import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AppIcon } from "@/components/AppIcon";
import { isCorrectAnswer, sentenceAnswer, shuffle } from "@/lib/game-engine";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

type Token = { id: string; text: string };

function SortableToken({ token, onRemove }: { token: Token; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: token.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 2 : undefined }}
      className={`sortable-token ${isDragging ? "dragging" : ""}`}
    >
      <button className="drag-handle" {...attributes} {...listeners} aria-label={`Drag ${token.text} to reorder`} title="Drag to reorder"><AppIcon name="grip-vertical" /></button>
      <button className="token-text" onClick={onRemove} title="Tap to return this chunk">{token.text}</button>
    </div>
  );
}

export function SentenceBuilderGame({ activity, onComplete }: GameProps) {
  const questions = useMemo(() => activity.items.filter((item) => (item.sentenceParts?.length ?? 0) > 1), [activity]);
  const [index, setIndex] = useState(0);
  const [pool, setPool] = useState<Token[]>(() => shuffle((questions[0]?.sentenceParts ?? []).map((text, i) => ({ id: `${i}-${text}`, text }))));
  const [answer, setAnswer] = useState<Token[]>([]);
  const [correct, setCorrect] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [finished, setFinished] = useState(false);
  const item = questions[index];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!item) return <div className="empty-game"><span><AppIcon name="puzzle" /></span><h2>This set needs sentence chunks.</h2><p>Add chunks such as <b>She | goes to school | every day</b> in the activity editor.</p></div>;

  function resetQuestion(nextIndex: number) {
    setAnswer([]); setFeedback(null);
    setPool(shuffle((questions[nextIndex]?.sentenceParts ?? []).map((text, i) => ({ id: `${i}-${text}`, text }))));
  }
  function addToken(token: Token) { setPool((current) => current.filter((entry) => entry.id !== token.id)); setAnswer((current) => [...current, token]); }
  function removeToken(token: Token) { if (feedback) return; setAnswer((current) => current.filter((entry) => entry.id !== token.id)); setPool((current) => [...current, token]); }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || feedback) return;
    setAnswer((current) => {
      const oldIndex = current.findIndex((token) => token.id === active.id);
      const newIndex = current.findIndex((token) => token.id === over.id);
      return oldIndex >= 0 && newIndex >= 0 ? arrayMove(current, oldIndex, newIndex) : current;
    });
  }
  function check() {
    if (answer.length !== item.sentenceParts?.length) return;
    const isCorrect = isCorrectAnswer(answer.map((token) => token.text).join(" "), sentenceAnswer(item));
    setFeedback(isCorrect ? "correct" : "wrong");
    const nextCorrect = correct + (isCorrect ? 1 : 0);
    const nextScore = score + (isCorrect ? 120 : 0);
    setCorrect(nextCorrect); setScore(nextScore);
    setTimeout(() => {
      if (index === questions.length - 1) { setFinished(true); onComplete(nextScore, nextCorrect, questions.length); }
      else { const next = index + 1; setIndex(next); resetQuestion(next); }
    }, 850);
  }
  function replay() { setIndex(0); setCorrect(0); setScore(0); setFinished(false); resetQuestion(0); }
  if (finished) return <CompletionCard score={score} correct={correct} total={questions.length} onReplay={replay} />;

  return (
    <div className="game-stage builder-stage">
      <div className="game-progress-label"><span>Sentence {index + 1} of {questions.length}</span><span>{score} points</span></div>
      <div className="game-progress"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
      <div className="game-question"><span className="question-icon"><AppIcon name="puzzle" /></span><small>SENTENCE BUILDER</small><h2>Put the sentence in order</h2>{item.hint && <p>Hint: {item.hint} {item.answer}</p>}<p className="drag-help">Tap chunks to add/remove them. Drag chosen chunks to reorder.</p></div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={answer.map((token) => token.id)} strategy={horizontalListSortingStrategy}>
          <div className={`builder-answer ${feedback ? `feedback-${feedback}` : ""}`}>
            {answer.length === 0 && <span className="builder-placeholder">Choose the chunks below…</span>}
            {answer.map((token) => <SortableToken key={token.id} token={token} onRemove={() => removeToken(token)} />)}
          </div>
        </SortableContext>
      </DndContext>
      <div className="builder-pool">{pool.map((token) => <button key={token.id} onClick={() => addToken(token)}>{token.text}</button>)}</div>
      {feedback && <div className={`feedback-message ${feedback}`}>{feedback === "correct" ? <><AppIcon name="check-lg" /> Excellent!</> : `Not quite — ${sentenceAnswer(item)}`}</div>}
      <button className="button button-primary button-large builder-check" disabled={answer.length !== item.sentenceParts?.length || !!feedback} onClick={check}>Check answer</button>
    </div>
  );
}

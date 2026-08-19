"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useClassroomSettings } from "@/hooks/useClassroomSettings";
import {
  buildArcadeRounds,
  buildMazeLevel,
  mazePortalIndex,
  moveMazePlayer,
  type MazeDirection,
  type MazeMonster,
  type MazePosition,
} from "@/lib/arcade-engine";
import { playArcadeTone } from "@/lib/arcade-audio";
import { getPlayableItemsForMode } from "@/lib/activity-intelligence";
import { nextCommittedMazeMonsterStep } from "@/lib/maze-chase";
import type { GameProps } from "./GameTypes";
import { CompletionCard } from "./CompletionCard";

const MAX_LIVES = 3;

type MazeFeedback = "correct" | "wrong" | "caught" | null;

function samePosition(left: MazePosition, right: MazePosition) {
  return left.x === right.x && left.y === right.y;
}

function cloneMonsters(monsters: readonly MazeMonster[]) {
  return monsters.map((monster) => ({ ...monster, position: { ...monster.position } }));
}

function mazeActorStyle(
  position: MazePosition,
  columns: number,
  rows: number,
  moveMs: number,
): CSSProperties {
  return {
    "--maze-x": position.x,
    "--maze-y": position.y,
    "--maze-columns": columns,
    "--maze-rows": rows,
    "--maze-move-ms": `${moveMs}ms`,
  } as CSSProperties;
}

export function WordMazeGame({ activity, onComplete }: GameProps) {
  const { settings } = useClassroomSettings();
  const items = useMemo(() => getPlayableItemsForMode(activity.items, "word-maze"), [activity.items]);
  const rounds = useMemo(() => buildArcadeRounds(items, 3), [items]);
  const levels = useMemo(() => rounds.map((round, index) => buildMazeLevel(round, index)), [rounds]);
  const firstLevel = levels[0];

  const [roundIndex, setRoundIndex] = useState(0);
  const [player, setPlayer] = useState<MazePosition>(() => firstLevel?.start ?? { x: 0, y: 0 });
  const [monsters, setMonsters] = useState<MazeMonster[]>(() => cloneMonsters(firstLevel?.monsters ?? []));
  const [actorEpoch, setActorEpoch] = useState(0);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<MazeFeedback>(null);
  const [disabledPortals, setDisabledPortals] = useState<Set<number>>(() => new Set());
  const [finished, setFinished] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const round = rounds[roundIndex];
  const level = levels[roundIndex];

  const playerRef = useRef(player);
  const monstersRef = useRef(monsters);
  const monsterPreviousRef = useRef<Record<string, MazePosition>>({});
  const livesRef = useRef(lives);
  const lockedRef = useRef(locked);
  const gameOverRef = useRef(gameOver);
  const finishedRef = useRef(finished);

  useEffect(() => {
    playerRef.current = player;
    monstersRef.current = monsters;
    livesRef.current = lives;
    lockedRef.current = locked;
    gameOverRef.current = gameOver;
    finishedRef.current = finished;
  }, [finished, gameOver, lives, locked, monsters, player]);

  const respawnLevel = useCallback(() => {
    if (!level) return;
    const nextPlayer = { ...level.start };
    const nextMonsters = cloneMonsters(level.monsters);
    playerRef.current = nextPlayer;
    monstersRef.current = nextMonsters;
    monsterPreviousRef.current = {};
    setPlayer(nextPlayer);
    setMonsters(nextMonsters);
    setActorEpoch((current) => current + 1);
  }, [level]);

  const loseLife = useCallback((reason: "wrong" | "caught", portalIndex?: number) => {
    if (!level || lockedRef.current || gameOverRef.current || finishedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    setCombo(0);
    setFeedback(reason);
    playArcadeTone(settings.soundEnabled, "wrong");

    if (typeof portalIndex === "number") {
      setDisabledPortals((current) => {
        const next = new Set(current);
        next.add(portalIndex);
        return next;
      });
      setScore((current) => Math.max(0, current - 25));
    }

    const nextLives = Math.max(0, livesRef.current - 1);
    livesRef.current = nextLives;
    setLives(nextLives);
    window.setTimeout(() => {
      if (nextLives === 0) {
        gameOverRef.current = true;
        setGameOver(true);
        setLocked(false);
        lockedRef.current = false;
        return;
      }
      respawnLevel();
      setFeedback(null);
      setLocked(false);
      lockedRef.current = false;
    }, settings.reducedMotion ? 280 : 620);
  }, [level, respawnLevel, settings.reducedMotion, settings.soundEnabled]);

  const enterPortal = useCallback((portalIndex: number) => {
    if (!round || !level || lockedRef.current || disabledPortals.has(portalIndex)) return;
    const option = round.options[portalIndex];
    if (!option) return;
    const right = option === round.correctAnswer;

    if (!right) {
      loseLife("wrong", portalIndex);
      return;
    }

    lockedRef.current = true;
    setLocked(true);
    setFeedback("correct");
    playArcadeTone(settings.soundEnabled, "correct");
    const gained = 180 + Math.min(5, combo) * 30 + lives * 10;
    const nextScore = score + gained;
    const nextCorrect = correct + 1;
    setScore(nextScore);
    setCorrect(nextCorrect);
    setCombo((current) => current + 1);

    window.setTimeout(() => {
      const lastRound = roundIndex === rounds.length - 1;
      if (lastRound) {
        finishedRef.current = true;
        setFinished(true);
        onComplete(nextScore, nextCorrect, rounds.length);
        return;
      }

      const nextIndex = roundIndex + 1;
      const nextLevel = levels[nextIndex];
      const nextPlayer = { ...nextLevel.start };
      const nextMonsters = cloneMonsters(nextLevel.monsters);
      playerRef.current = nextPlayer;
      monstersRef.current = nextMonsters;
      monsterPreviousRef.current = {};
      setRoundIndex(nextIndex);
      setPlayer(nextPlayer);
      setMonsters(nextMonsters);
      setActorEpoch((current) => current + 1);
      setDisabledPortals(new Set());
      setFeedback(null);
      setLocked(false);
      lockedRef.current = false;
    }, settings.reducedMotion ? 320 : 720);
  }, [combo, correct, disabledPortals, levels, lives, loseLife, onComplete, round, roundIndex, rounds.length, score, settings.reducedMotion, settings.soundEnabled, level]);

  const move = useCallback((direction: MazeDirection) => {
    if (!round || !level || lockedRef.current || gameOverRef.current || finishedRef.current) return;
    const current = playerRef.current;
    const next = moveMazePlayer(current, direction, level.map);
    if (samePosition(next, current)) return;

    playerRef.current = next;
    setPlayer(next);
    playArcadeTone(settings.soundEnabled, "move");

    if (monstersRef.current.some((monster) => samePosition(monster.position, next))) {
      window.setTimeout(() => loseLife("caught"), 0);
      return;
    }

    const portalIndex = mazePortalIndex(next, level.portals);
    if (portalIndex >= 0 && !disabledPortals.has(portalIndex)) {
      window.setTimeout(() => enterPortal(portalIndex), 0);
    }
  }, [disabledPortals, enterPortal, level, loseLife, round, settings.soundEnabled]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLocaleLowerCase();
      const directions: Record<string, MazeDirection> = {
        arrowup: "up", w: "up",
        arrowdown: "down", s: "down",
        arrowleft: "left", a: "left",
        arrowright: "right", d: "right",
      };
      const direction = directions[key];
      if (!direction) return;
      event.preventDefault();
      move(direction);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move]);

  useEffect(() => {
    if (!level || locked || gameOver || finished || !monsters.length) return;
    const timer = window.setInterval(() => {
      if (lockedRef.current || gameOverRef.current || finishedRef.current) return;
      const target = playerRef.current;
      const occupied: MazePosition[] = [];
      const nextPrevious: Record<string, MazePosition> = {};
      const nextMonsters = monstersRef.current.map((monster) => {
        const previous = monsterPreviousRef.current[monster.id];
        const nextPosition = nextCommittedMazeMonsterStep(level.map, monster.position, previous, target, occupied);
        occupied.push(nextPosition);
        if (!samePosition(nextPosition, monster.position)) nextPrevious[monster.id] = { ...monster.position };
        else if (previous) nextPrevious[monster.id] = previous;
        return { ...monster, position: nextPosition };
      });
      monsterPreviousRef.current = nextPrevious;
      monstersRef.current = nextMonsters;
      setMonsters(nextMonsters);

      if (nextMonsters.some((monster) => samePosition(monster.position, target))) {
        window.setTimeout(() => loseLife("caught"), 0);
      }
    }, level.monsterIntervalMs);
    return () => window.clearInterval(timer);
  }, [finished, gameOver, level, locked, loseLife, monsters.length]);

  function replay() {
    const resetLevel = levels[0];
    const resetPlayer = resetLevel ? { ...resetLevel.start } : { x: 0, y: 0 };
    const resetMonsters = cloneMonsters(resetLevel?.monsters ?? []);
    playerRef.current = resetPlayer;
    monstersRef.current = resetMonsters;
    monsterPreviousRef.current = {};
    livesRef.current = MAX_LIVES;
    lockedRef.current = false;
    gameOverRef.current = false;
    finishedRef.current = false;
    setRoundIndex(0);
    setPlayer(resetPlayer);
    setMonsters(resetMonsters);
    setActorEpoch((current) => current + 1);
    setScore(0);
    setCorrect(0);
    setCombo(0);
    setLives(MAX_LIVES);
    setLocked(false);
    setFeedback(null);
    setDisabledPortals(new Set());
    setFinished(false);
    setGameOver(false);
  }

  if (!round || !level) return <div className="empty-game"><span><AppIcon name="map" /></span><h2>Word Maze needs sentence targets.</h2><p>Add at least three full sentences and choose the missing word or expression in each one.</p></div>;

  if (gameOver) {
    return <div className="completion-card maze-game-over"><div className="completion-burst"><AppIcon name="x-circle-fill" /></div><span className="eyebrow">Maze run over</span><h2>Out of lives!</h2><p>You reached <strong>Level {roundIndex + 1}</strong> with <strong>{score}</strong> points. Try the maze again and protect your three lives.</p><div className="completion-stats"><div><b>{correct}</b><span>Cleared</span></div><div><b>{roundIndex + 1}</b><span>Level reached</span></div><div><b>{score}</b><span>Points</span></div></div><button className="button button-primary button-large" onClick={replay}><AppIcon name="arrow-repeat" /> Try again</button></div>;
  }

  if (finished) return <CompletionCard score={score} correct={correct} total={rounds.length} onReplay={replay} />;

  const threatNames = Array.from(new Set(level.monsters.map((monster) => monster.kind))).join(" + ");
  const mazeColumns = level.map[0].length;
  const mazeRows = level.map.length;
  const playerMoveMs = settings.reducedMotion ? 1 : 120;
  const monsterMoveMs = settings.reducedMotion
    ? 1
    : Math.min(780, Math.max(240, Math.round(level.monsterIntervalMs * 0.78)));

  return (
    <div className={`arcade-stage word-maze advanced-maze ${settings.reducedMotion ? "reduced-motion" : ""}`}>
      <div className="arcade-hud maze-level-hud">
        <div><small>LEVEL</small><strong>{roundIndex + 1}/{rounds.length}</strong></div>
        <div><small>SCORE</small><strong>{score}</strong></div>
        <div className="maze-lives"><small>LIVES</small><strong aria-label={`${lives} of ${MAX_LIVES} lives remaining`}>{Array.from({ length: MAX_LIVES }, (_, index) => <AppIcon key={index} name={index < lives ? "heart-fill" : "heart"} />)}</strong></div>
      </div>

      <div className="maze-question"><small>FIND THE CORRECT PORTAL · THREAT: {threatNames.toLocaleUpperCase()}</small><strong>{round.prompt}</strong></div>

      <div className="maze-shell">
        <div className="maze-map-label"><span><AppIcon name="map" /> MAP {level.id.split("-").slice(1).join(" ").toLocaleUpperCase()}</span><span>{level.monsters.length} {level.monsters.length === 1 ? "MONSTER" : "MONSTERS"}</span></div>
        <div className="maze-board" style={{ gridTemplateColumns: `repeat(${mazeColumns}, 1fr)` }}>
          {level.map.flatMap((row, y) => [...row].map((cell, x) => {
            const portalIndex = level.portals.findIndex((portal) => portal.x === x && portal.y === y);
            const isPortal = portalIndex >= 0;
            const portalOption = isPortal ? round.options[portalIndex] : undefined;
            const portalCorrect = isPortal && feedback === "correct" && portalOption === round.correctAnswer;
            const portalDisabled = isPortal && disabledPortals.has(portalIndex);
            return (
              <div
                key={`${x}-${y}`}
                className={`maze-cell ${cell === "#" ? "wall" : "path"} ${isPortal ? "portal-cell" : ""}`}
                aria-hidden={!isPortal}
              >
                {cell !== "#" && !isPortal && <span className="maze-spark" aria-hidden="true" />}
                {isPortal && (
                  <div className={`maze-portal ${portalCorrect ? "correct" : ""} ${portalDisabled ? "disabled" : ""}`}>
                    <b>{portalDisabled ? "LOCKED" : portalOption}</b>
                  </div>
                )}
              </div>
            );
          }))}

          <div className="maze-actors" key={`${roundIndex}-${actorEpoch}`}>
            {monsters.map((monster) => (
              <div
                key={monster.id}
                className="maze-actor maze-monster-actor"
                style={mazeActorStyle(monster.position, mazeColumns, mazeRows, monsterMoveMs)}
              >
                <div className={`maze-monster ${monster.kind}`} aria-label={`${monster.kind} monster`}><i /><i /><span /></div>
              </div>
            ))}
            <div
              className="maze-actor maze-player-actor"
              style={mazeActorStyle(player, mazeColumns, mazeRows, playerMoveMs)}
            >
              <div className="maze-player" aria-label="ClassPlay player"><b>C</b><span /></div>
            </div>
          </div>
        </div>

        <div className="maze-feedback" aria-live="polite">
          {feedback === "correct" && <span className="correct"><AppIcon name="stars" /> Level clear! New maze incoming.</span>}
          {feedback === "wrong" && <span className="wrong"><AppIcon name="heartbreak" /> Wrong portal — one life lost. That portal is now locked.</span>}
          {feedback === "caught" && <span className="wrong"><AppIcon name="heartbreak" /> Caught! One life lost — restarting this level.</span>}
        </div>
      </div>

      <div className="maze-dpad" aria-label="Maze controls">
        <button className="up" onClick={() => move("up")} disabled={locked} aria-label="Move up"><AppIcon name="arrow-up" /></button>
        <button className="left" onClick={() => move("left")} disabled={locked} aria-label="Move left"><AppIcon name="arrow-left" /></button>
        <button className="center" disabled aria-hidden="true"><AppIcon name="diamond-fill" /></button>
        <button className="right" onClick={() => move("right")} disabled={locked} aria-label="Move right"><AppIcon name="arrow-right" /></button>
        <button className="down" onClick={() => move("down")} disabled={locked} aria-label="Move down"><AppIcon name="arrow-down" /></button>
      </div>
      <p className="arcade-key-help"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> or <kbd>WASD</kbd> to move · avoid the monsters</p>
    </div>
  );
}

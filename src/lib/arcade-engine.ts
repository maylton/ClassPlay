import { sentenceGapAnswer } from "./game-engine";
import type { ActivityItem } from "./types";

export type ArcadeRound = {
  itemId: string;
  prompt: string;
  correctAnswer: string;
  options: string[];
};

export type MazePosition = { x: number; y: number };
export type MazeDirection = "up" | "down" | "left" | "right";
export type MazeMonsterKind = "crawler" | "spark" | "shade";

export type MazeTemplate = {
  id: string;
  map: readonly string[];
  start: MazePosition;
};

export type MazeMonster = {
  id: string;
  kind: MazeMonsterKind;
  position: MazePosition;
};

export type MazeLevel = {
  id: string;
  map: readonly string[];
  start: MazePosition;
  portals: MazePosition[];
  monsters: MazeMonster[];
  monsterIntervalMs: number;
};

/*
 * Word Maze layouts deliberately favor loops over single corridors. Besides
 * making the chase more interesting, this gives the player a genuine escape
 * route around answer portals instead of forcing them through a wrong answer.
 */
export const WORD_MAZE_TEMPLATES: readonly MazeTemplate[] = [
  {
    id: "crossroads",
    map: [
      "###############",
      "#.....#.......#",
      "#.###.#.###.#.#",
      "#.#.........#.#",
      "#.#.###.###.#.#",
      "#.............#",
      "#.###.#.#.###.#",
      "#.....#.#.....#",
      "#.###...###.#.#",
      "#......S......#",
      "###############",
    ],
    start: { x: 7, y: 9 },
  },
  {
    id: "upper-ring",
    map: [
      "###############",
      "#.............#",
      "#.###.###.###.#",
      "#...#.....#...#",
      "###.#.###.#.###",
      "#.............#",
      "#.###.#.#.###.#",
      "#.....#.#.....#",
      "#.###.....###.#",
      "#......S......#",
      "###############",
    ],
    start: { x: 7, y: 9 },
  },
  {
    id: "switchback",
    map: [
      "###############",
      "#.....#.......#",
      "#.###.#.#####.#",
      "#.#...........#",
      "#.#.#####.###.#",
      "#.............#",
      "#.#####.#.###.#",
      "#.......#.....#",
      "#.###.#####.#.#",
      "#......S......#",
      "###############",
    ],
    start: { x: 7, y: 9 },
  },
  {
    id: "ziggurat",
    map: [
      "###############",
      "#.............#",
      "#.#####.#####.#",
      "#.....#.#.....#",
      "#.###.#.#.###.#",
      "#.............#",
      "#.#.#######.#.#",
      "#.#.........#.#",
      "#.###.###.###.#",
      "#......S......#",
      "###############",
    ],
    start: { x: 7, y: 9 },
  },
  {
    id: "sidewinder",
    map: [
      "###############",
      "#.......#.....#",
      "#.#####.#.###.#",
      "#.....#.......#",
      "###.#.#####.#.#",
      "#.............#",
      "#.#.#####.###.#",
      "#.#.....#.....#",
      "#.###.#.#.###.#",
      "#......S......#",
      "###############",
    ],
    start: { x: 7, y: 9 },
  },
  {
    id: "spiral-gates",
    map: [
      "###############",
      "#.....#.......#",
      "#.###.#.#####.#",
      "#.#...#.......#",
      "#.#.#####.###.#",
      "#.............#",
      "#.###.#####.#.#",
      "#.....#.....#.#",
      "#.###...###.#.#",
      "#......S......#",
      "###############",
    ],
    start: { x: 7, y: 9 },
  },
] as const;

// Backwards-compatible aliases for the first maze layout.
export const WORD_MAZE_MAP = WORD_MAZE_TEMPLATES[0].map;
export const WORD_MAZE_START = WORD_MAZE_TEMPLATES[0].start;
export const WORD_MAZE_PORTALS: readonly MazePosition[] = [
  { x: 1, y: 1 },
  { x: 13, y: 1 },
  { x: 7, y: 4 },
];

function shuffleWith<T>(items: readonly T[], random: () => number = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function unique(values: readonly string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLocaleLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function positionKey(position: MazePosition) {
  return `${position.x},${position.y}`;
}

function samePosition(left: MazePosition, right: MazePosition) {
  return left.x === right.x && left.y === right.y;
}

function manhattan(left: MazePosition, right: MazePosition) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

export function buildArcadeRound(
  item: ActivityItem,
  items: readonly ActivityItem[],
  optionCount: number,
  random: () => number = Math.random,
): ArcadeRound {
  const correctAnswer = sentenceGapAnswer(item);
  const distractors = items
    .filter((candidate) => candidate.id !== item.id)
    .map(sentenceGapAnswer);
  const candidates = unique([correctAnswer, ...(item.distractors ?? []), ...distractors]);
  const shuffledDistractors = shuffleWith(candidates.filter((candidate) => candidate !== correctAnswer), random);
  const options = shuffleWith([correctAnswer, ...shuffledDistractors.slice(0, Math.max(0, optionCount - 1))], random);

  return {
    itemId: item.id,
    prompt: item.gapSentence ?? item.example ?? item.prompt,
    correctAnswer,
    options,
  };
}

export function buildArcadeRounds(
  items: readonly ActivityItem[],
  optionCount: number,
  random: () => number = Math.random,
) {
  return shuffleWith(items, random).map((item) => buildArcadeRound(item, items, optionCount, random));
}

export function isMazeOpen(position: MazePosition, map: readonly string[] = WORD_MAZE_MAP) {
  const row = map[position.y];
  if (!row) return false;
  const cell = row[position.x];
  return Boolean(cell && cell !== "#");
}

export function moveMazePlayer(
  position: MazePosition,
  direction: MazeDirection,
  map: readonly string[] = WORD_MAZE_MAP,
): MazePosition {
  const delta = direction === "up" ? { x: 0, y: -1 }
    : direction === "down" ? { x: 0, y: 1 }
      : direction === "left" ? { x: -1, y: 0 }
        : { x: 1, y: 0 };
  const next = { x: position.x + delta.x, y: position.y + delta.y };
  return isMazeOpen(next, map) ? next : position;
}

export function mazePortalIndex(position: MazePosition, portals: readonly MazePosition[] = WORD_MAZE_PORTALS) {
  return portals.findIndex((portal) => samePosition(portal, position));
}

function reachableMazePositionsAvoiding(
  map: readonly string[],
  start: MazePosition,
  blocked?: MazePosition,
) {
  const directions: MazeDirection[] = ["up", "right", "down", "left"];
  const blockedKey = blocked ? positionKey(blocked) : null;
  if (!isMazeOpen(start, map) || positionKey(start) === blockedKey) return [];

  const queue = [start];
  const seen = new Set([positionKey(start)]);
  const positions = [start];

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    for (const direction of directions) {
      const next = moveMazePlayer(current, direction, map);
      const key = positionKey(next);
      if (key === blockedKey || seen.has(key)) continue;
      seen.add(key);
      positions.push(next);
      queue.push(next);
    }
  }

  return positions;
}

export function reachableMazePositions(map: readonly string[], start: MazePosition) {
  return reachableMazePositionsAvoiding(map, start);
}

function openNeighborCount(map: readonly string[], position: MazePosition) {
  const neighbors: MazePosition[] = [
    { x: position.x, y: position.y - 1 },
    { x: position.x + 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x - 1, y: position.y },
  ];
  return neighbors.filter((neighbor) => isMazeOpen(neighbor, map)).length;
}

/**
 * A portal is safe only when treating its cell as a wall still leaves every
 * other reachable cell connected to the launch point. This keeps answer
 * choices out of articulation points / mandatory corridors.
 */
export function isMazePortalSafe(
  map: readonly string[],
  start: MazePosition,
  candidate: MazePosition,
) {
  if (samePosition(start, candidate) || !isMazeOpen(candidate, map)) return false;
  const reachable = reachableMazePositions(map, start);
  if (!reachable.some((position) => samePosition(position, candidate))) return false;
  const withoutCandidate = reachableMazePositionsAvoiding(map, start, candidate);
  return withoutCandidate.length === reachable.length - 1;
}

function nearestUnusedPortalPosition(
  map: readonly string[],
  candidates: readonly MazePosition[],
  anchor: MazePosition,
  used: readonly MazePosition[],
) {
  const unused = candidates.filter((position) => !used.some((taken) => samePosition(taken, position)));
  const spread = unused.filter((position) => used.every((taken) => manhattan(taken, position) >= 3));
  const pool = spread.length ? spread : unused;
  return pool.slice().sort((left, right) => {
    const distanceDelta = manhattan(left, anchor) - manhattan(right, anchor);
    if (distanceDelta) return distanceDelta;
    return openNeighborCount(map, left) - openNeighborCount(map, right);
  })[0];
}

export function mazePortalCandidates(map: readonly string[], start: MazePosition) {
  const width = map[0]?.length ?? 0;
  const height = map.length;
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const anchors: MazePosition[] = [
    { x: 1, y: 1 },
    { x: width - 2, y: 1 },
    { x: 1, y: height - 2 },
    { x: width - 2, y: height - 2 },
    { x: centerX, y: centerY },
    { x: 1, y: centerY },
    { x: width - 2, y: centerY },
    { x: centerX, y: 1 },
    { x: centerX, y: height - 2 },
  ];

  const safe = reachableMazePositions(map, start)
    .filter((position) => !samePosition(position, start))
    .filter((position) => manhattan(position, start) >= 4)
    .filter((position) => isMazePortalSafe(map, start, position));

  // Low-traffic cells are less likely to be crossed accidentally. Fall back
  // to any non-blocking cell only if a future maze has too few of them.
  const lowTraffic = safe.filter((position) => openNeighborCount(map, position) <= 2);
  const pool = lowTraffic.length >= 7 ? lowTraffic : safe;
  const candidates: MazePosition[] = [];

  for (const anchor of anchors) {
    const candidate = nearestUnusedPortalPosition(map, pool, anchor, candidates);
    if (!candidate) continue;
    candidates.push(candidate);
  }
  return candidates;
}

export function mazeMonsterProfile(levelIndex: number) {
  if (levelIndex < 2) return { count: 1, intervalMs: 1050, kinds: ["crawler"] as MazeMonsterKind[] };
  if (levelIndex < 4) return { count: 2, intervalMs: 850, kinds: ["crawler", "spark"] as MazeMonsterKind[] };
  if (levelIndex < 6) return { count: 2, intervalMs: 690, kinds: ["spark", "shade"] as MazeMonsterKind[] };
  return { count: 3, intervalMs: Math.max(430, 590 - (levelIndex - 6) * 30), kinds: ["shade", "spark", "crawler"] as MazeMonsterKind[] };
}

function monsterSpawnPositions(
  map: readonly string[],
  start: MazePosition,
  portals: readonly MazePosition[],
  count: number,
) {
  const blocked = new Set(portals.map(positionKey));
  blocked.add(positionKey(start));
  const open = reachableMazePositions(map, start)
    .filter((position) => !blocked.has(positionKey(position)))
    .sort((left, right) => manhattan(right, start) - manhattan(left, start));

  const selected: MazePosition[] = [];
  for (const candidate of open) {
    const farEnough = selected.every((position) => manhattan(position, candidate) >= 4);
    if (!farEnough && open.length > count * 2) continue;
    selected.push(candidate);
    if (selected.length === count) break;
  }
  return selected;
}

export function buildMazeLevel(
  round: ArcadeRound,
  levelIndex: number,
  random: () => number = Math.random,
): MazeLevel {
  const template = WORD_MAZE_TEMPLATES[levelIndex % WORD_MAZE_TEMPLATES.length];
  const candidates = mazePortalCandidates(template.map, template.start);
  const portals = shuffleWith(candidates, random).slice(0, Math.min(round.options.length, 3));
  const profile = mazeMonsterProfile(levelIndex);
  const spawns = monsterSpawnPositions(template.map, template.start, portals, profile.count);
  const monsters = spawns.map((position, index): MazeMonster => ({
    id: `monster-${levelIndex}-${index}`,
    kind: profile.kinds[index % profile.kinds.length],
    position,
  }));

  return {
    id: `${levelIndex + 1}-${template.id}`,
    map: template.map,
    start: template.start,
    portals,
    monsters,
    monsterIntervalMs: profile.intervalMs,
  };
}

export function nextMazeMonsterStep(
  map: readonly string[],
  from: MazePosition,
  target: MazePosition,
  occupied: readonly MazePosition[] = [],
): MazePosition {
  if (samePosition(from, target)) return from;
  const directions: MazeDirection[] = ["up", "left", "right", "down"];
  const blocked = new Set(occupied.map(positionKey));
  blocked.delete(positionKey(target));
  const queue: Array<{ position: MazePosition; firstStep: MazePosition }> = [];
  const seen = new Set([positionKey(from)]);

  for (const direction of directions) {
    const next = moveMazePlayer(from, direction, map);
    const key = positionKey(next);
    if (samePosition(next, from) || blocked.has(key) || seen.has(key)) continue;
    if (samePosition(next, target)) return next;
    seen.add(key);
    queue.push({ position: next, firstStep: next });
  }

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    for (const direction of directions) {
      const next = moveMazePlayer(current.position, direction, map);
      const key = positionKey(next);
      if (samePosition(next, current.position) || blocked.has(key) || seen.has(key)) continue;
      if (samePosition(next, target)) return current.firstStep;
      seen.add(key);
      queue.push({ position: next, firstStep: current.firstStep });
    }
  }

  return from;
}

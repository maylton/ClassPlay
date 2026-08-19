import { isMazeOpen, type MazePosition } from "./arcade-engine";

const DIRECTIONS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
] as const;

function key(position: MazePosition) {
  return `${position.x},${position.y}`;
}

function samePosition(left: MazePosition, right: MazePosition) {
  return left.x === right.x && left.y === right.y;
}

function openNeighbors(map: readonly string[], position: MazePosition) {
  return DIRECTIONS
    .map((delta) => ({ x: position.x + delta.x, y: position.y + delta.y }))
    .filter((candidate) => isMazeOpen(candidate, map));
}

function shortestStep(
  map: readonly string[],
  from: MazePosition,
  target: MazePosition,
  occupied: readonly MazePosition[],
) {
  const blocked = new Set(occupied.map(key));
  blocked.delete(key(target));
  const queue: Array<{ position: MazePosition; firstStep: MazePosition }> = [];
  const seen = new Set([key(from)]);

  for (const next of openNeighbors(map, from)) {
    const nextKey = key(next);
    if (blocked.has(nextKey) || seen.has(nextKey)) continue;
    if (samePosition(next, target)) return next;
    seen.add(nextKey);
    queue.push({ position: next, firstStep: next });
  }

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    for (const next of openNeighbors(map, current.position)) {
      const nextKey = key(next);
      if (blocked.has(nextKey) || seen.has(nextKey)) continue;
      if (samePosition(next, target)) return current.firstStep;
      seen.add(nextKey);
      queue.push({ position: next, firstStep: current.firstStep });
    }
  }

  return from;
}

/**
 * Chase movement with corridor commitment.
 *
 * Once a monster enters a corridor it follows that corridor — including bends —
 * until it reaches the next junction. Only at a junction (3+ exits), at its
 * initial spawn, or at a dead end does it recalculate the shortest route to the
 * player's current position. This prevents mid-corridor U-turns when the player
 * moves behind the monster.
 */
export function nextCommittedMazeMonsterStep(
  map: readonly string[],
  from: MazePosition,
  previous: MazePosition | undefined,
  target: MazePosition,
  occupied: readonly MazePosition[] = [],
): MazePosition {
  if (samePosition(from, target)) return from;

  const structuralNeighbors = openNeighbors(map, from);
  const blocked = new Set(occupied.map(key));
  blocked.delete(key(target));

  if (previous && structuralNeighbors.length === 2) {
    const forward = structuralNeighbors.find((candidate) => !samePosition(candidate, previous));
    if (!forward || blocked.has(key(forward))) return from;
    return forward;
  }

  if (previous && structuralNeighbors.length === 1) {
    const onlyExit = structuralNeighbors[0];
    return blocked.has(key(onlyExit)) ? from : onlyExit;
  }

  return shortestStep(map, from, target, occupied);
}

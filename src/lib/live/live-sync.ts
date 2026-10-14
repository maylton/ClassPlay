import type { LiveQuestion } from "@/lib/types";

type Schedule = (callback: () => void, delayMs: number) => unknown;
type Cancel = (handle: unknown) => void;

/**
 * Coalesces bursts of "something changed" signals into at most one run per
 * `minIntervalMs`, never overlapping. Realtime broadcasts can be sent by any
 * participant, so every handler that reacts to them must be flood-safe.
 */
export function createCoalescedTask(
  task: () => Promise<void>,
  minIntervalMs: number,
  {
    now = () => Date.now(),
    schedule = (callback, delayMs) => setTimeout(callback, delayMs),
    cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }: { now?: () => number; schedule?: Schedule; cancel?: Cancel } = {},
) {
  let running = false;
  let pending = false;
  let timer: unknown = null;
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  let stopped = false;

  async function run() {
    timer = null;
    if (stopped) return;
    running = true;
    pending = false;
    lastStartedAt = now();
    try {
      await task();
    } catch {
      // The task reports its own errors; a failed sync must not wedge the queue.
    } finally {
      running = false;
      if (pending) trigger();
    }
  }

  function trigger() {
    if (stopped) return;
    if (running) {
      pending = true;
      return;
    }
    if (timer !== null) return;
    timer = schedule(() => void run(), Math.max(0, lastStartedAt + minIntervalMs - now()));
  }

  function stop() {
    stopped = true;
    pending = false;
    if (timer !== null) cancel(timer);
    timer = null;
  }

  return { trigger, stop };
}

/** Identity of the question on screen; per-question UI state resets when it changes. */
export function liveQuestionKey(question?: LiveQuestion | null) {
  if (!question) return "";
  return [question.itemId, question.index, question.dynamiteTurnId ?? "", question.wildcardTileNumber ?? ""].join("|");
}

/** Players eliminated since the previous snapshot (Dynamite explosion moments). */
export function newlyEliminated(previous: readonly string[] | null | undefined, next: readonly string[] | null | undefined) {
  if (!previous) return [];
  const before = new Set(previous);
  return (next ?? []).filter((id) => !before.has(id));
}

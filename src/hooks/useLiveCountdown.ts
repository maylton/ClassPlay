"use client";

import { useEffect, useState } from "react";

type CountdownSnapshot = {
  key: string;
  remaining: number;
  preciseRemaining: number;
};

export function useLiveCountdown({
  active,
  startedAt,
  timerSeconds,
  intervalMs = 200,
}: {
  active: boolean;
  startedAt?: string | null;
  timerSeconds: number;
  intervalMs?: number;
}) {
  const started = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const key = active && Number.isFinite(started) ? `${started}:${timerSeconds}` : null;
  const [snapshot, setSnapshot] = useState<CountdownSnapshot | null>(null);

  useEffect(() => {
    if (!key || !Number.isFinite(started)) return;

    const tick = () => {
      const precise = Math.max(0, timerSeconds - ((Date.now() - started) / 1000));
      setSnapshot({ key, preciseRemaining: precise, remaining: Math.ceil(precise) });
    };

    const initial = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [intervalMs, key, started, timerSeconds]);

  if (!key) return { remaining: null, preciseRemaining: null };
  if (snapshot?.key !== key) {
    return { remaining: Math.ceil(timerSeconds), preciseRemaining: timerSeconds };
  }
  return { remaining: snapshot.remaining, preciseRemaining: snapshot.preciseRemaining };
}

"use client";

import { useEffect, useState } from "react";

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
  const [remaining, setRemaining] = useState<number | null>(null);
  const [preciseRemaining, setPreciseRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!active || !startedAt) {
      setRemaining(null);
      setPreciseRemaining(null);
      return;
    }

    const started = new Date(startedAt).getTime();
    if (!Number.isFinite(started)) {
      setRemaining(null);
      setPreciseRemaining(null);
      return;
    }

    const tick = () => {
      const precise = Math.max(0, timerSeconds - ((Date.now() - started) / 1000));
      setPreciseRemaining(precise);
      setRemaining(Math.ceil(precise));
    };

    const initial = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [active, intervalMs, startedAt, timerSeconds]);

  return { remaining, preciseRemaining };
}

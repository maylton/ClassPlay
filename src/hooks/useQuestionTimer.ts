"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useQuestionTimer(questionKey: string | number) {
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const restart = useCallback(() => {
    clearTimer();
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = window.setInterval(() => {
      const startedAt = startedAtRef.current;
      if (startedAt === null) return;
      setElapsedMs(Date.now() - startedAt);
    }, 100);
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();
    const timeout = window.setTimeout(restart, 0);
    return () => {
      window.clearTimeout(timeout);
      clearTimer();
    };
  }, [clearTimer, questionKey, restart]);

  const stop = useCallback(() => {
    clearTimer();
    const now = Date.now();
    const startedAt = startedAtRef.current ?? now;
    startedAtRef.current = startedAt;
    const elapsed = now - startedAt;
    setElapsedMs(elapsed);
    return elapsed;
  }, [clearTimer]);

  return { elapsedMs, restart, stop };
}

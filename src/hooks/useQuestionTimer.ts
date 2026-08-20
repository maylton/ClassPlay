"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useQuestionTimer(questionKey: string | number) {
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    clearTimer();
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 100);
    return clearTimer;
  }, [clearTimer, questionKey]);

  const stop = useCallback(() => {
    clearTimer();
    const elapsed = Date.now() - startedAtRef.current;
    setElapsedMs(elapsed);
    return elapsed;
  }, [clearTimer]);

  return { elapsedMs, stop };
}

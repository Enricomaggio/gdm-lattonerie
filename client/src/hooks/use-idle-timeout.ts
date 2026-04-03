import { useEffect, useRef, useCallback } from "react";

const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const THROTTLE_MS = 30_000; // reset timer at most every 30s

export function useIdleTimeout(onIdle: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResetRef = useRef<number>(Date.now());

  const resetTimer = useCallback(() => {
    const now = Date.now();
    if (now - lastResetRef.current < THROTTLE_MS) return;
    lastResetRef.current = now;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onIdle, IDLE_TIMEOUT_MS);
  }, [onIdle]);

  useEffect(() => {
    timerRef.current = setTimeout(onIdle, IDLE_TIMEOUT_MS);

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    for (const event of events) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of events) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [onIdle, resetTimer]);
}

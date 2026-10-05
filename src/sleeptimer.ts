import { getActiveEngine } from "./engines.js";

let timer: number | null = null;
let fadeTimer: number | null = null;

export function setSleepTimer(minutes: number): void {
  clearSleepTimer();
  const ms = minutes * 60 * 1000;
  timer = window.setTimeout(() => {
    // fade last 10s
    const engine = getActiveEngine();
    let steps = 10;
    const startVol = 1; // assume full; will use engine current?
    fadeTimer = window.setInterval(() => {
      steps -= 1;
      const v = Math.max(0, startVol * (steps / 10));
      try { engine.setVolume(v); } catch {}
      if (steps <= 0) {
        if (fadeTimer !== null) clearInterval(fadeTimer);
        try { engine.pause(); } catch {}
      }
    }, 1000);
  }, Math.max(0, ms - 10_000));
}

export function clearSleepTimer(): void {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  if (fadeTimer !== null) { clearInterval(fadeTimer); fadeTimer = null; }
}
export function isSleepActive(): boolean { return timer !== null; }

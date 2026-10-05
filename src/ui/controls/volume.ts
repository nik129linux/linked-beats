import { volumeBar, muteBtn, volumeReadoutEl, muteIconEl } from "../dom.js";
import { engineSetVolume, engineSetMuted, engineCurrentTime, getActiveEngine } from "../../engines.js";

const VOLUME_KEY = "linkedBeats:volume";

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0.9;
  return Math.max(0, Math.min(1, v));
}

export function loadPersistedVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampVolume(n);
    }
  } catch {}
  return 0.9;
}

export function persistVolume(v: number): void {
  try { localStorage.setItem(VOLUME_KEY, String(clampVolume(v))); } catch {}
}

function speakerIcon(kind: "muted" | "low" | "high"): string {
  if (kind === "muted") return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M16 8l4 4M20 8l-4 4"/></svg>`;
  if (kind === "low") return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M13.5 9.5a3 3 0 010 5"/></svg>`;
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 9a6 6 0 010 6"/></svg>`;
}

export function updateMuteIcon(): void {
  if (!muteIconEl || !muteBtn) return;
  // derive mute from engine state
  const eng = getActiveEngine();
  const paused = eng.paused;
  void paused;
  // volume derived from slider value
  const v = clampVolume(Number(volumeBar.value));
  // check if engine reports muted? engines doesn't expose muted; we keep local flag via volume bar and muted attr
  const muted = (volumeBar.value === "0") || v === 0;
  // fallback check via engine? try to infer
  let kind: "muted" | "low" | "high" = "high";
  if (muted) kind = "muted";
  else if (v < 0.5) kind = "low";
  muteIconEl.innerHTML = speakerIcon(kind);
  muteBtn.setAttribute("aria-pressed", String(muted));
  muteBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  muteBtn.title = muted ? "Unmute" : "Mute";
}

export function updateVolumeFill(): void {
  const v = clampVolume(Number(volumeBar.value));
  const isMuted = v === 0;
  const pct = isMuted ? 0 : v * 100;
  volumeBar.style.setProperty("--range-fill", `${pct}%`);
  volumeBar.style.setProperty("--range-buffered", "0%");
  if (volumeReadoutEl) {
    const disp = isMuted ? 0 : Math.round(v * 100);
    volumeReadoutEl.textContent = `${disp}%`;
  }
  updateMuteIcon();
}

export function updateVolumeReadoutVisibility(show: boolean): void {
  if (!volumeReadoutEl) return;
  volumeReadoutEl.style.opacity = show ? "1" : "0";
}

export function initVolumeControls(): void {
  muteBtn?.addEventListener("click", () => {
    const cur = Number(volumeBar.value);
    const isMuted = cur === 0;
    if (isMuted) { volumeBar.value = "0.5"; engineSetMuted(false); engineSetVolume(0.5); persistVolume(0.5); }
    else { engineSetMuted(true); volumeBar.value = "0"; persistVolume(0); }
    updateVolumeFill();
  });
  volumeBar.addEventListener("input", () => {
    const v = clampVolume(Number(volumeBar.value));
    engineSetVolume(v);
    engineSetMuted(false);
    persistVolume(v);
    updateVolumeFill();
    updateVolumeReadoutVisibility(true);
  });
  volumeBar.addEventListener("pointerenter", () => updateVolumeReadoutVisibility(true));
  volumeBar.addEventListener("pointerleave", () => updateVolumeReadoutVisibility(false));
  volumeBar.addEventListener("focus", () => updateVolumeReadoutVisibility(true));
  volumeBar.addEventListener("blur", () => updateVolumeReadoutVisibility(false));
  volumeBar.addEventListener("change", () => {
    updateVolumeReadoutVisibility(true);
    window.setTimeout(() => updateVolumeReadoutVisibility(false), 1200);
  });
  muteBtn?.addEventListener("mouseenter", () => updateVolumeReadoutVisibility(true));
  muteBtn?.addEventListener("mouseleave", () => updateVolumeReadoutVisibility(false));
  // keep legacy audio event for audio engine fallback via engines
  const audioElFallback = document.getElementById("audio") as HTMLAudioElement | null;
  audioElFallback?.addEventListener("volumechange", () => {
    updateVolumeFill();
    const fallbackV = clampVolume(Number(volumeBar.value));
    persistVolume(fallbackV);
  });
  // listen to engine mute events if available
  try { getActiveEngine().on("state", () => updateVolumeFill()); } catch {}
  void engineCurrentTime;
}

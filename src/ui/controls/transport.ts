import { library, player, getActiveList } from "../../state.js";
import { speedBtn } from "../dom.js";
import { showToast } from "../toast.js";
import { prevAction } from "../../player.js";
import { playNode } from "../actions.js";
import { isPreviewActive, stopPreviewIfPlaying } from "../searchPanel.js";
import { resumeContext } from "../visualizer.js";
import { updateProgressFill, resetProgressOnSongChange } from "./seek.js";
import { enginePlay, enginePause, engineSeek, engineSetRate, engineCurrentTime, enginePaused, getActiveEngine } from "../../engines.js";
import { audioEl } from "../dom.js";

const SPEED_KEY = "linkedBeats:speed";
const SPEEDS: number[] = [0.75, 1, 1.25, 1.5, 2];

function loadPersistedSpeed(): number {
  try {
    const raw = localStorage.getItem(SPEED_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (SPEEDS.includes(n)) return n;
    }
  } catch {}
  return 1;
}
function persistSpeed(v: number): void {
  try { localStorage.setItem(SPEED_KEY, String(v)); } catch {}
}

export function initSpeedControl(): void {
  const initSpeed = loadPersistedSpeed();
  try { engineSetRate(initSpeed); (audioEl as unknown as { preservesPitch: boolean }).preservesPitch = true; } catch {}
  if (speedBtn) {
    speedBtn.textContent = `${initSpeed}x`;
    speedBtn.setAttribute("aria-label", `Playback speed ${initSpeed}x`);
  }
  speedBtn?.addEventListener("click", () => {
    const curRate = Number((speedBtn?.textContent ?? "1x").replace("x","") ?? "1");
    let idx = SPEEDS.indexOf(curRate);
    if (idx === -1) idx = SPEEDS.indexOf(1);
    const next = SPEEDS[(idx + 1) % SPEEDS.length]!;
    engineSetRate(next);
    try { (audioEl as unknown as { preservesPitch: boolean }).preservesPitch = true; } catch {}
    if (speedBtn) {
      speedBtn.textContent = `${next}x`;
      speedBtn.setAttribute("aria-label", `Playback speed ${next}x`);
      speedBtn.title = `Playback speed ${next}x`;
    }
    persistSpeed(next);
  });
}

let playFailCount = 0;
export function handlePlayRejection(_err: unknown): void {
  const title = player.current?.value.title ?? "song";
  showToast({ message: `Can't play ${title}` });
  if (playFailCount > 0) return;
  const list = player.getPlayingList() ?? getActiveList();
  const startSize = list.size;
  if (startSize <= 1) return;
  let attempts = 0;
  const tryNext = (): void => {
    if (attempts >= startSize) { playFailCount = 0; return; }
    attempts++;
    const nxt = player.next();
    if (!nxt) { playFailCount = 0; return; }
    if (!nxt.value.url && nxt.value.source !== "youtube") { tryNext(); return; }
    resetProgressOnSongChange();
    import("../../engines.js").then(m=> m.playSongNode(nxt).then(() => { playFailCount = 0; }).catch(() => {
      playFailCount++;
      if (playFailCount < startSize) tryNext();
      else playFailCount = 0;
    }));
  };
  tryNext();
}

export function handlePlayPause(renderAll: () => void, updatePlayerBar: () => void, updateMediaSession: () => void): void {
  if (isPreviewActive()) stopPreviewIfPlaying();
  if (player.current === null) {
    const head = getActiveList().head;
    if (head) { if (!head.value.url && head.value.source !== "youtube") { showToast({ message: "Re-link file first" }); return; } playNode(head); }
    return;
  }
  if (enginePaused() && player.repeat === "off" && engineCurrentTime() === 0) {
    const head = player.getPlayingList()?.head ?? getActiveList().head;
    if (head) { playNode(head, player.getPlayingList() ?? getActiveList()); return; }
  }
  if (enginePaused()) { resumeContext(); void enginePlay().catch(handlePlayRejection); }
  else enginePause();
  void renderAll; void updatePlayerBar; void updateMediaSession;
}
export function handlePrev(renderAll: () => void, updatePlayerBar: () => void, updateMediaSession: () => void): void {
  if (isPreviewActive()) stopPreviewIfPlaying();
  if (!player.current) return;
  if (prevAction(engineCurrentTime()) === "restart") { engineSeek(0); updateProgressFill(); void enginePlay().catch(handlePlayRejection); return; }
  const p = player.prev();
  if (p) {
    if (!p.value.url && p.value.source !== "youtube") { showToast({ message: "Re-link file" }); updatePlayerBar(); updateMediaSession(); return; }
    resetProgressOnSongChange(); import("../../engines.js").then(m=> m.playSongNode(p).catch(handlePlayRejection)).then(()=>{ renderAll(); updateMediaSession(); });
  }
}
export function handleNext(renderAll: () => void, updatePlayerBar: () => void, updateMediaSession: () => void): void {
  if (isPreviewActive()) stopPreviewIfPlaying();
  const nxt = player.next();
  if (nxt) {
    if (!nxt.value.url && nxt.value.source !== "youtube") { showToast({ message: "Re-link file" }); updatePlayerBar(); updateMediaSession(); return; }
    resetProgressOnSongChange(); import("../../engines.js").then(m=> m.playSongNode(nxt).catch(handlePlayRejection)).then(()=>{ renderAll(); updateMediaSession(); });
  } else if (player.repeat === "off") {
    enginePause(); engineSeek(0); updateProgressFill(); updatePlayerBar();
  }
}

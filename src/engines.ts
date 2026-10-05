import type { Song } from "./library.js";
import { audioEl } from "./ui/dom.js";
import { AudioEngine, YouTubeEngine, shouldSkipOnError } from "./engine.js";
import type { PlaybackEngine } from "./engine.js";
import { showToast } from "./ui/toast.js";
import { player, getActiveList } from "./state.js";
import { saveLibrary } from "./ui/persistence.js";

let audioEngine = new AudioEngine(audioEl);
let noCorsAudioEl: HTMLAudioElement | null = null;
let noCorsEngine: AudioEngine | null = null;
let ytEngine: YouTubeEngine | null = null;
let active: PlaybackEngine = audioEngine;
let skipOnceDone = false;

function getNoCorsEngine(): AudioEngine {
  if (!noCorsEngine) {
    const el = document.createElement("audio"); el.preload = "metadata"; el.style.display = "none"; document.body.appendChild(el);
    noCorsAudioEl = el; noCorsEngine = new AudioEngine(el, true);
  }
  return noCorsEngine!;
}

export function getActiveEngine(): PlaybackEngine { return active; }

export function engineForSong(song: Song): PlaybackEngine {
  if (song.source === "youtube" && song.videoId) {
    if (!ytEngine) ytEngine = new YouTubeEngine();
    return ytEngine;
  }
  if (song.noCors) return getNoCorsEngine();
  return audioEngine;
}

let ytWired = false;
function formatTimeLocal(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2,"0")}`;
}
function wireYoutubeOnce(): void {
  if (ytWired || !ytEngine) return;
  ytWired = true;
  ytEngine.on("error", (code) => {
    const c = typeof code === "number" ? code : 0;
    if (shouldSkipOnError(c)) {
      showToast({ message: "This video can't be played here" });
      if (!skipOnceDone) {
        skipOnceDone = true;
        const nxt = player.next();
        if (nxt) void playSongNode(nxt);
      } else skipOnceDone = false;
    }
  });
  ytEngine.on("ended", () => {
    if (player.repeat === "one" && player.current) { void ytEngine!.seek(0); void ytEngine!.play(); return; }
    const nxt = player.next();
    if (nxt) void playSongNode(nxt);
    else skipOnceDone = false;
  });
  // The UI listeners were registered on the audio engine at startup: forward the YouTube engine events to them.
  const fwd = (e: "time" | "ready" | "state") => ytEngine!.on(e, (d) => {
    try { (audioEngine as unknown as { emit: (ev: string, data?: unknown) => void }).emit(e, d); } catch {}
  });
  fwd("time"); fwd("ready"); fwd("state");
  void formatTimeLocal;
  ytEngine.on("state", (st) => {
    try {
      const btn = document.getElementById("playPauseBtn") as HTMLButtonElement | null;
      if (!btn) return;
      const isPlaying = st === "playing";
      if (isPlaying) btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
      else if (st === "paused") btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.14v14l11-7z"/></svg>`;
      if (isPlaying) btn.setAttribute("aria-label","Pause"); else if(st==="paused") btn.setAttribute("aria-label","Play");
    } catch {}
  });
}

export async function switchToSong(song: Song): Promise<void> {
  const next = engineForSong(song);
  if (next !== active) {
    try { active.pause(); } catch {}
    active = next;
    if (next.kind === "youtube") wireYoutubeOnce();
  }
  skipOnceDone = false;
  try {
    await next.load(song);
    await next.play();
  } catch (e) {
    if (!skipOnceDone) {
      skipOnceDone = true;
      const nxt = player.next();
      if (nxt) await playSongNode(nxt);
    }
    throw e;
  }
}

export async function playSongNode(node: import("./doublylinked.js").ListNode<Song>): Promise<void> {
  const list = getActiveList();
  const owner = list;
  player.play(node, owner);
  updateHeroForSource(node.value);
  await switchToSong(node.value);
  // dynamic import to avoid circular with render
  const { renderAll, updatePlayerBar } = await import("./ui/render.js");
  renderAll(); updatePlayerBar();
  saveLibrary(player as unknown as never);
}

function updateHeroForSource(song: Song): void {
  const cover = document.getElementById("coverArt");
  const visualLabel = document.getElementById("visualizerLabel");
  if (!cover) return;
  const isYt = song.source === "youtube";
  const isNoCors = !!song.noCors;
  if (isYt) {
    let host = document.getElementById("ytHost");
    if (!host) {
      host = document.createElement("div"); host.id = "ytHost";
      host.style.width = "220px"; host.style.height = "220px";
      host.style.minWidth = "200px"; host.style.minHeight = "200px";
      cover.innerHTML = ""; cover.appendChild(host);
      const inner = document.createElement("div"); inner.id = "ytPlayer"; inner.style.width = "100%"; inner.style.height = "100%"; host.appendChild(inner);
    } else if (host.parentElement !== cover) { cover.innerHTML = ""; cover.appendChild(host); }
    if (visualLabel) visualLabel.textContent = "VISUALIZER N/A FOR YOUTUBE";
  } else {
    const host = document.getElementById("ytHost");
    if (host) host.remove();
    if (visualLabel) visualLabel.textContent = isNoCors ? "VISUALIZER N/A FOR YOUTUBE" : "";
  }
}

export function stopYoutubeIfCurrent(song: Song | null): void {
  if (!song || song.source === "youtube") {
    try { ytEngine?.pause(); } catch {}
    // keep iframe but paused; visual handled by caller
  }
}
export function destroyYouTubeIfEmpty(): void {
  try {
    const list = getActiveList();
    if (list.size === 0 && ytEngine) { ytEngine.destroy(); ytEngine = null; active = audioEngine; ytWired = false; }
  } catch {}
  const host = document.getElementById("ytHost");
  if (host && getActiveList().size === 0) host.remove();
  const label = document.getElementById("visualizerLabel");
  if (label && getActiveList().size === 0) label.textContent = "";
}

// proxy controls for dock
export function engineSeek(s: number): void { active.seek(s); }
export function engineSetVolume(v: number): void { active.setVolume(v); try { audioEl.volume = v; } catch {} }
export function engineSetMuted(m: boolean): void { active.setMuted(m); try { audioEl.muted = m; } catch {} }
export function engineSetRate(r: number): void { active.setRate(r); try { audioEl.playbackRate = r; } catch {} }
export function enginePlay(): Promise<void> { return active.play(); }
export function enginePause(): void { active.pause(); }
export function engineCurrentTime(): number { return active.currentTime; }
export function engineDuration(): number { return active.duration; }
export function enginePaused(): boolean { return active.paused; }

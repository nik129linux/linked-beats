import { heroRingEl, heroRingProgressEl, heroRingKnobEl, heroRingTooltipEl, heroTimeEl, dockRingProgressEl, dockTimeEl, queuePanelWrapEl } from "../dom.js";
import { formatTime } from "../format.js";
import { saveLibrary } from "../persistence.js";
import { library, player } from "../../state.js";
import { isPreviewActive as isPreview } from "../searchPanel.js";
import { engineSeek, engineCurrentTime, engineDuration, enginePaused, getActiveEngine } from "../../engines.js";
import { audioEl } from "../dom.js";
import { ringGeometry, angleToProgress, clampSeek as ringClampSeek } from "../ring.js";

let seekHintTimer: number | undefined;
let prevProgress = 0;
let isBuffering = false;

function getRadii(): { heroR: number; dockR: number } {
  const heroR = 120;
  const dockR = 32;
  return { heroR, dockR };
}

export function updateProgressFill(): void {
  const dur = engineDuration() || audioEl.duration;
  const cur = engineCurrentTime();
  const hasDuration = Number.isFinite(dur) && dur > 0;
  const progress = hasDuration && Number.isFinite(cur) ? Math.max(0, Math.min(1, cur / dur)) : 0;
  if (hasDuration) prevProgress = progress;

  const { heroR, dockR } = getRadii();
  // hero ring
  if (heroRingProgressEl && heroRingKnobEl) {
    const geo = ringGeometry(progress, heroR, 4);
    heroRingProgressEl.style.strokeDasharray = String(geo.dasharray);
    heroRingProgressEl.style.strokeDashoffset = String(geo.dashoffset);
    const knobX = geo.knobX;
    const knobY = geo.knobY;
    heroRingKnobEl.setAttribute("cx", String(knobX));
    heroRingKnobEl.setAttribute("cy", String(knobY));
    const heroWrap = heroRingEl;
    if (heroWrap) {
      const empty = !player.current;
      heroWrap.classList.toggle("empty", empty);
      const indeterminate = (!hasDuration || isBuffering) && !!player.current;
      heroRingProgressEl.classList.toggle("indeterminate", indeterminate);
      if (indeterminate) heroWrap.classList.add("indeterminate");
      else heroWrap.classList.remove("indeterminate");
      heroRingKnobEl.style.opacity = empty || indeterminate ? "0" : "1";
    }
  }
  // dock ring
  if (dockRingProgressEl) {
    const geo2 = ringGeometry(progress, dockR, 4);
    dockRingProgressEl.style.strokeDasharray = String(geo2.dasharray);
    dockRingProgressEl.style.strokeDashoffset = String(geo2.dashoffset);
    const empty = !player.current;
    const indeterminate = (!hasDuration || isBuffering) && !!player.current;
    dockRingProgressEl.classList.toggle("indeterminate", indeterminate);
    if (dockRingProgressEl.parentElement) {
      (dockRingProgressEl.parentElement as HTMLElement).classList.toggle("empty", empty);
    }
  }
  // hero/dock time texts
  const curStr = formatTime(cur);
  const durStr = hasDuration ? formatTime(dur) : "0:00";
  if (heroTimeEl) heroTimeEl.textContent = `${curStr} / ${durStr}`;
  if (dockTimeEl) dockTimeEl.textContent = `${curStr} / ${durStr}`;
  // aria slider on heroRing
  if (heroRingEl) {
    heroRingEl.setAttribute("aria-valuemin", "0");
    heroRingEl.setAttribute("aria-valuemax", hasDuration ? String(Math.floor(dur)) : "100");
    heroRingEl.setAttribute("aria-valuenow", String(Math.floor(cur)));
    heroRingEl.setAttribute("aria-valuetext", `${curStr} of ${durStr}`);
  }
}

export function showSeekHint(text: string): void {
  const el = document.getElementById("seekHint") as HTMLElement | null;
  if (!el) return;
  el.textContent = text;
  el.style.opacity = "1";
  if (seekHintTimer !== undefined) window.clearTimeout(seekHintTimer);
  seekHintTimer = window.setTimeout(() => {
    if (el) el.style.opacity = "0";
  }, 600);
}

export function clampSeek(delta: number): void {
  const dur = engineDuration() || audioEl.duration;
  const cur = engineCurrentTime();
  let next: number;
  if (Number.isFinite(dur) && dur > 0) next = Math.max(0, Math.min(dur, cur + delta));
  else next = Math.max(0, cur + delta);
  engineSeek(next);
  try { audioEl.currentTime = next; } catch {}
  updateProgressFill();
  const sign = delta > 0 ? "+" : "";
  showSeekHint(`${sign}${delta}s`);
}

export function resetProgressOnSongChange(): void {
  prevProgress = 0;
  isBuffering = false;
  updateProgressFill();
}

function seekToProgress(p: number): void {
  const dur = engineDuration() || audioEl.duration;
  const t = ringClampSeek(p, Number.isFinite(dur) && dur > 0 ? dur : 0);
  engineSeek(t);
  try { audioEl.currentTime = t; } catch {}
  updateProgressFill();
}

export function initSeekControls(updateMediaPosition: () => void, updateMediaSession: () => void, _updatePlayerBar: () => void, _renderAll: () => void, _renderSongs: () => void, _handlePlayRejection: (e: unknown) => void): void {
  // Pointer interaction on hero ring
  let dragging = false;
  let activePrev = 0;
  const hero = heroRingEl;
  if (hero) {
    const getCenter = (): { cx: number; cy: number; rect: DOMRect } => {
      const rect = hero.getBoundingClientRect();
      return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, rect };
    };
    const onPointerMove = (e: PointerEvent): void => {
      const dur = engineDuration() || audioEl.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const { cx, cy } = getCenter();
      const prog = angleToProgress(e.clientX, e.clientY, cx, cy, activePrev);
      activePrev = prog;
      const t = prog * dur;
      // tooltip
      if (heroRingTooltipEl) {
        heroRingTooltipEl.textContent = formatTime(t);
        heroRingTooltipEl.style.left = "50%";
        heroRingTooltipEl.style.top = "56%";
        heroRingTooltipEl.classList.add("visible");
        heroRingTooltipEl.classList.remove("hidden");
      }
      if (dragging) {
        seekToProgress(prog);
        updateMediaPosition();
      }
    };
    const onPointerDown = (e: PointerEvent): void => {
      dragging = true;
      hero.classList.add("dragging");
      activePrev = prevProgress;
      try { (hero as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      const dur = engineDuration() || audioEl.duration;
      if (Number.isFinite(dur) && dur > 0) {
        const { cx, cy } = getCenter();
        const prog = angleToProgress(e.clientX, e.clientY, cx, cy, activePrev);
        activePrev = prog;
        seekToProgress(prog);
        updateMediaPosition();
      }
      e.preventDefault();
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      hero.classList.remove("dragging");
      try { (hero as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      if (heroRingTooltipEl) {
        heroRingTooltipEl.classList.remove("visible");
        heroRingTooltipEl.classList.add("hidden");
      }
    };
    hero.addEventListener("pointerdown", onPointerDown);
    hero.addEventListener("pointermove", (e) => {
      if (dragging) onPointerMove(e);
      else {
        // hover tooltip even without drag
        const dur = engineDuration() || audioEl.duration;
        if (!Number.isFinite(dur) || dur <= 0) return;
        const { cx, cy } = getCenter();
        const prog = angleToProgress(e.clientX, e.clientY, cx, cy, prevProgress);
        const t = prog * dur;
        if (heroRingTooltipEl) {
          heroRingTooltipEl.textContent = formatTime(t);
          heroRingTooltipEl.classList.add("visible");
          heroRingTooltipEl.classList.remove("hidden");
        }
      }
    });
    hero.addEventListener("pointerleave", () => {
      if (!dragging && heroRingTooltipEl) {
        heroRingTooltipEl.classList.remove("visible");
        heroRingTooltipEl.classList.add("hidden");
      }
    });
    hero.addEventListener("pointerup", onPointerUp);
    hero.addEventListener("pointercancel", onPointerUp);

    // keyboard
    hero.addEventListener("keydown", (e) => {
      const dur = engineDuration() || audioEl.duration;
      const cur = engineCurrentTime();
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowLeft" ? -5 : 5;
        const next = hasFiniteDur(dur) ? Math.max(0, Math.min(dur, cur + delta)) : cur + delta;
        engineSeek(next);
        updateProgressFill();
        updateMediaPosition();
      } else if (e.key === "Home") {
        e.preventDefault(); engineSeek(0); updateProgressFill(); updateMediaPosition();
      } else if (e.key === "End") {
        e.preventDefault(); if (hasFiniteDur(dur)) { engineSeek(dur); updateProgressFill(); updateMediaPosition(); }
      } else if (e.key === "PageUp") {
        e.preventDefault(); engineSeek(Math.max(0, cur - 30)); updateProgressFill(); updateMediaPosition();
      } else if (e.key === "PageDown") {
        e.preventDefault(); if (hasFiniteDur(dur)) engineSeek(Math.min(dur, cur + 30)); else engineSeek(cur + 30); updateProgressFill(); updateMediaPosition();
      } else if (e.key === " ") {
        e.preventDefault();
      }
    });
  }

  const handleTime = (t: number): void => {
    updateProgressFill();
    void t;
    updateMediaPosition();
  };
  audioEl.addEventListener("timeupdate", () => handleTime(audioEl.currentTime));
  try { getActiveEngine().on("time", (d) => handleTime(typeof d === "number" ? d : engineCurrentTime())); } catch {}
  audioEl.addEventListener("seeking", () => updateProgressFill());
  audioEl.addEventListener("seeked", () => updateProgressFill());
  audioEl.addEventListener("progress", () => updateProgressFill());
  audioEl.addEventListener("loadedmetadata", () => {
    const dur = engineDuration() || audioEl.duration;
    if (Number.isFinite(dur) && dur > 0) {
      if (player.current && player.current.value.duration !== dur) {
        player.current.value.duration = dur;
        saveLibrary(library);
      }
    }
    isBuffering = false;
    updateProgressFill();
    updateMediaPosition();
    updateMediaSession();
  });
  try { getActiveEngine().on("ready", () => { isBuffering = false; updateProgressFill(); updateMediaPosition(); updateMediaSession(); }); } catch {}
  try {
    getActiveEngine().on("state", (d) => {
      if (d === "buffering") isBuffering = true;
      else if (d === "playing" || d === "paused") isBuffering = false;
      updateProgressFill();
    });
  } catch {}
  void _updatePlayerBar; void _renderAll; void _renderSongs; void _handlePlayRejection; void enginePaused;
}

function hasFiniteDur(d: number): boolean { return Number.isFinite(d) && d > 0; }

export function initAudioEndHandlers(
  updatePlayerBar: () => void,
  renderAll: () => void,
  renderSongs: () => void,
  updateMediaSession: () => void,
  handlePlayRejection: (e: unknown) => void,
  updateDocumentTitle: (b: boolean) => void,
): void {
  const onPlay = (): void => { updatePlayerBar(); updateDocumentTitle(true); updateMediaSession(); };
  const onPause = (): void => { updatePlayerBar(); updateDocumentTitle(false); };
  audioEl.addEventListener("play", onPlay);
  audioEl.addEventListener("pause", onPause);
  try { getActiveEngine().on("state", (d) => { if (d === "playing") onPlay(); if (d === "paused") onPause(); }); } catch {}
  audioEl.addEventListener("ended", () => {
    if (isPreview()) return;
    if (player.repeat === "one" && player.current) { engineSeek(0); updateProgressFill(); getActiveEngine().play().catch(handlePlayRejection); return; }
    const nxt = player.next();
    if (nxt) {
      if (!nxt.value.url && nxt.value.source !== "youtube") { updatePlayerBar(); renderSongs(); updateMediaSession(); return; }
      resetProgressOnSongChange();
      import("../../engines.js").then(m => m.playSongNode(nxt).catch(handlePlayRejection)).then(()=>{ renderAll(); updateMediaSession(); });
    } else {
      try{ getActiveEngine().pause(); }catch{}
      engineSeek(0); updateProgressFill(); updatePlayerBar(); renderSongs(); updateDocumentTitle(false);
    }
  });
  try { getActiveEngine().on("ended", () => {
    if (isPreview()) return;
  }); } catch {}
  audioEl.addEventListener("error", () => {
    const list = player.getPlayingList();
    if (!list || list.size <= 1) return;
    const nxt = player.next();
    if (nxt && (nxt.value.url || nxt.value.source === "youtube")) {
      resetProgressOnSongChange(); renderAll(); updateMediaSession();
      import("../../engines.js").then(m => m.playSongNode(nxt).catch(handlePlayRejection));
    }
  });
  void queuePanelWrapEl;
}

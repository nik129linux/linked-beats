import { player } from "../../state.js";
import { engineSeek, engineCurrentTime, engineDuration, enginePaused, getActiveEngine } from "../../engines.js";
import { audioEl } from "../dom.js";

export function updateDocumentTitle(isPlaying: boolean): void {
  if (isPlaying && player.current) document.title = `▶ ${player.current.value.title} · Linked Beats`;
  else document.title = "Linked Beats";
}

export function initMediaSession(handlePlayPause: () => void, handlePrev: () => void, handleNext: () => void, clampSeek: (n: number) => void): void {
  const nav = navigator as unknown as { mediaSession?: unknown };
  if (!nav.mediaSession) return;
  const ms = nav.mediaSession as {
    setActionHandler: (a: string, h: ((d?: unknown) => void) | null) => void;
  };
  try {
    ms.setActionHandler("play", () => handlePlayPause());
    ms.setActionHandler("pause", () => { if (!enginePaused()) getActiveEngine().pause(); });
    ms.setActionHandler("previoustrack", () => handlePrev());
    ms.setActionHandler("nexttrack", () => handleNext());
    ms.setActionHandler("seekbackward", (d) => { const off = (d as { seekOffset?: number })?.seekOffset ?? 5; clampSeek(-off); });
    ms.setActionHandler("seekforward", (d) => { const off = (d as { seekOffset?: number })?.seekOffset ?? 5; clampSeek(off); });
    ms.setActionHandler("seekto", (d) => {
      const det = d as { seekTime?: number };
      if (typeof det.seekTime === "number" && Number.isFinite(det.seekTime)) {
        const dur = engineDuration(); engineSeek(Math.max(0, Math.min(dur || Infinity, det.seekTime)));
      }
    });
  } catch {}
}

export function updateMediaSession(): void {
  const nav = navigator as unknown as { mediaSession?: { metadata: unknown; playbackState?: string } };
  if (!nav.mediaSession) return;
  try {
    const cur = player.current?.value;
    if (!cur) return;
    const artwork = cur.artworkUrl ? [{ src: cur.artworkUrl, sizes: "300x300", type: "image/jpeg" }] : [];
    (nav.mediaSession as unknown as { metadata: unknown }).metadata = new (window as unknown as { MediaMetadata: new (o: unknown) => unknown }).MediaMetadata({
      title: cur.title, artist: cur.artist ?? "", album: "", artwork,
    });
    const isPlaying = !enginePaused();
    try { (nav.mediaSession as unknown as { playbackState: string }).playbackState = isPlaying ? "playing" : "paused"; } catch {}
  } catch {}
}

export function updateMediaPosition(): void {
  const nav = navigator as unknown as { mediaSession?: { setPositionState?: (s: { duration: number; playbackRate: number; position: number }) => void } };
  if (!nav.mediaSession?.setPositionState) return;
  try {
    const dur = engineDuration();
    if (Number.isFinite(dur) && dur > 0) nav.mediaSession.setPositionState({ duration: dur, playbackRate: getActiveEngine().paused ? 1 : 1, position: engineCurrentTime() });
  } catch {}
}

import { player, getActiveList, library } from "../../state.js";
import { currentTitleEl, currentMetaEl, queueIndicatorEl, playPauseBtn, coverEl, playingFromEl, statArtistEl, statTimeEl, statNextEl, dockTitleEl, dockArtistEl, dockCoverEl, heroEmptyCtaEl } from "../dom.js";
import { formatTime, formatFileSize, fileExtension } from "../format.js";
import { coverLetter } from "../cover.js";
import { syncRowPlayingState } from "../songRow.js";
import { songListEl } from "../dom.js";
import { doMaskedReveal, buildInitialTitle } from "../reveal.js";
import { engineDuration, enginePaused } from "../../engines.js";

let prevTitle = "";

function syncAllRows(): void {
  const currentId = player.current?.value.id ?? null; const audioPlaying = !enginePaused();
  for (const child of Array.from(songListEl.children)) {
    const el = child as HTMLElement; if (el.classList.contains("gap")) continue;
    const id = el.dataset["id"] ?? ""; syncRowPlayingState(el, id === currentId, audioPlaying);
  }
}

function ensureRecordMarkers(el: HTMLElement): void {
  if (!el.querySelector(".record-tick")) {
    const tick = document.createElement("span"); tick.className = "record-tick"; tick.setAttribute("aria-hidden","true"); el.appendChild(tick);
  }
  if (!el.querySelector(".record-dot")) {
    const dot = document.createElement("span"); dot.className = "record-dot"; dot.setAttribute("aria-hidden","true"); el.appendChild(dot);
  }
}

function setSpinningState(isPlaying: boolean): void {
  const cover = coverEl;
  const brand = document.querySelector(".brand") as HTMLElement | null;
  const orbit = document.querySelector(".logo-orbit") as HTMLElement | null;
  if (cover) {
    const hasSong = !!player.current && player.current.value.source !== "youtube";
    if (hasSong) {
      cover.classList.add("spinning");
      const cs = getComputedStyle(cover);
      void cs;
      // use animationPlayState for pause/resume without snap
      cover.style.animationPlayState = isPlaying ? "running" : "paused";
      if (!isPlaying) cover.classList.add("paused-spin");
      else cover.classList.remove("paused-spin");
      ensureRecordMarkers(cover);
      // ensure transform-origin center and no will-change
      cover.style.transformOrigin = "center";
      (cover.style as unknown as Record<string,string>).willChange = "auto";
    } else {
      cover.classList.remove("spinning", "paused-spin");
      cover.style.animationPlayState = "";
    }
  }
  if (brand) {
    brand.classList.toggle("playing", isPlaying && !!player.current);
  }
  if (orbit) {
    orbit.style.animationPlayState = isPlaying && !!player.current ? "running" : "paused";
  }
}

export function updatePlayerBar(): void {
  if (player.current) {
    const title = player.current.value.title; const song = player.current.value;
    if (title !== prevTitle) { if (prevTitle !== "") doMaskedReveal(title); else buildInitialTitle(title); }
    prevTitle = title;
    if (song.source === "remote" || song.source === "youtube") {
      const artist = song.artist ?? "Unknown artist";
      const full = song.trackTimeMillis ? formatTime(song.trackTimeMillis / 1000) : "";
      const parts: string[] = [artist, song.source === "youtube" ? "Full song" : "0:30"];
      if (full) parts.push(full); currentMetaEl.textContent = parts.join(" · ");
      if (song.trackTimeMillis) currentMetaEl.title = `Full track: ${full}`; else currentMetaEl.removeAttribute("title");
      if (statArtistEl) statArtistEl.textContent = artist;
      if (statTimeEl) statTimeEl.textContent = song.source === "youtube" ? (song.duration ? formatTime(song.duration) : "--:--") : "0:30";
      if (statNextEl) statNextEl.textContent = player.current.next?.value.title ?? "—";
      if (dockArtistEl) dockArtistEl.textContent = artist;
    } else {
      currentMetaEl.removeAttribute("title");
      const ext = song.fileName ? fileExtension(song.fileName) : "";
      const sizeStr = song.fileSize ? formatFileSize(song.fileSize) : "";
      const engDur = engineDuration(); const dur = song.duration !== undefined ? formatTime(song.duration) : (Number.isFinite(engDur) && engDur>0 ? formatTime(engDur) : "--:--");
      const parts = [dur]; if (ext) parts.push(ext); if (sizeStr) parts.push(sizeStr);
      currentMetaEl.textContent = parts.join(" · ");
      if (statArtistEl) statArtistEl.textContent = song.artist ?? "Local file";
      if (statTimeEl) statTimeEl.textContent = dur;
      if (statNextEl) statNextEl.textContent = player.current.next?.value.title ?? "—";
      if (dockArtistEl) dockArtistEl.textContent = song.artist ?? song.fileName ?? "Local";
    }
    const prevT = player.current.prev?.value.title ?? null; const nextT = player.current.next?.value.title ?? null;
    const segs: string[] = []; if (prevT) segs.push(`Previous: ${prevT}`); if (nextT) segs.push(`Up next: ${nextT}`);
    queueIndicatorEl.textContent = segs.join("  ·  "); queueIndicatorEl.style.display = segs.length ? "block" : "none";
    if (dockTitleEl) dockTitleEl.textContent = title;
    const existingHost = document.getElementById("ytHost");
    const isYtNow = song.source === "youtube" && existingHost !== null;
    if (coverEl && !isYtNow) {
      coverEl.innerHTML = "";
      if ((song.source === "remote" || song.source === "youtube") && song.artworkUrl) {
        const img = document.createElement("img"); img.src = song.artworkUrl; img.alt = ""; img.loading = "lazy"; (img as HTMLImageElement).decoding = "async"; img.className = "cover-art-img";
        img.style.width = "100%"; img.style.height = "100%"; img.style.objectFit = "cover"; img.style.borderRadius = "50%";
        img.addEventListener("error", () => { coverEl!.innerHTML = ""; const fb = document.createElement("span"); fb.className = "cover-art-fallback"; fb.textContent = coverLetter(title); coverEl!.appendChild(fb); ensureRecordMarkers(coverEl!); });
        const wrap = document.createElement("div"); wrap.className = "cover-art-inner"; wrap.appendChild(img); coverEl.appendChild(wrap);
        const fb = document.createElement("span"); fb.className = "cover-art-fallback"; fb.textContent = coverLetter(title); fb.style.display = "none"; coverEl.appendChild(fb);
        img.addEventListener("load", () => { fb.style.display = "none"; });
      } else {
        const fb = document.createElement("span"); fb.className = "cover-art-fallback"; fb.textContent = coverLetter(title); coverEl.appendChild(fb);
        // small static logo inside fallback when no artwork (20px ink on paper)
        const smallLogo = document.createElement("span"); smallLogo.className = "fallback-logo"; smallLogo.setAttribute("aria-hidden","true");
        smallLogo.innerHTML = `<svg width="20" height="20" viewBox="0 0 28 28" aria-hidden="true"><circle cx="10" cy="14" r="7" fill="none" stroke="var(--ink)" stroke-width="1.6"/><circle cx="18" cy="14" r="7" fill="none" stroke="var(--ink)" stroke-width="1.6"/><circle cx="16" cy="7" r="2" fill="var(--ink)"/></svg>`;
        smallLogo.style.position = "absolute"; smallLogo.style.bottom = "6px"; smallLogo.style.right = "6px"; smallLogo.style.width = "20px"; smallLogo.style.height = "20px"; smallLogo.style.background = "var(--paper)"; smallLogo.style.borderRadius = "50%"; smallLogo.style.display = "grid"; smallLogo.style.placeItems = "center";
        coverEl.appendChild(smallLogo);
      }
      ensureRecordMarkers(coverEl);
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!prefersReduced) setSpinningState(!enginePaused());
      else {
        coverEl.classList.remove("spinning");
        coverEl.style.animationPlayState = "";
      }
    } else if (coverEl && isYtNow) {
      coverEl.classList.remove("spinning", "paused-spin");
      coverEl.style.animationPlayState = "";
    }
    if (dockCoverEl) {
      dockCoverEl.textContent = coverLetter(title);
      if ((song.source === "remote" || song.source === "youtube") && song.artworkUrl) {
        dockCoverEl.innerHTML = ""; const img = document.createElement("img"); img.src = song.artworkUrl; img.alt = ""; img.loading = "lazy"; (img as HTMLImageElement).decoding = "async"; img.style.width = "100%"; img.style.height = "100%"; img.style.objectFit = "cover";
        img.addEventListener("error", () => { dockCoverEl!.textContent = coverLetter(title); }); dockCoverEl.appendChild(img);
      }
    }
    if (playingFromEl) {
      const viewed = getActiveList(); const playingList = player.getPlayingList();
      if (playingList && viewed !== playingList) { const name = library.getNames().find((n) => library.getPlaylist(n) === playingList) ?? "playlist"; playingFromEl.textContent = `Playing from ${name}`; playingFromEl.classList.remove("hidden"); }
      else playingFromEl.classList.add("hidden");
    }
    if (heroEmptyCtaEl) heroEmptyCtaEl.classList.add("hidden");
  } else {
    if (prevTitle !== "Nothing playing") doMaskedReveal("Nothing playing");
    prevTitle = "Nothing playing"; currentMetaEl.textContent = "—"; queueIndicatorEl.textContent = ""; queueIndicatorEl.style.display = "none";
    if (statArtistEl) statArtistEl.textContent = "—"; if (statTimeEl) statTimeEl.textContent = "—"; if (statNextEl) statNextEl.textContent = "—";
    if (dockTitleEl) dockTitleEl.textContent = "Nothing playing"; if (dockArtistEl) dockArtistEl.textContent = "—";
    if (coverEl) { coverEl.innerHTML = ""; const fb = document.createElement("span"); fb.className = "cover-art-fallback"; fb.textContent = "♪"; coverEl.appendChild(fb); coverEl.classList.remove("spinning", "paused-spin"); coverEl.style.animationPlayState = ""; }
    if (dockCoverEl) dockCoverEl.textContent = "♪"; prevTitle = "Nothing playing";
    if (playingFromEl) playingFromEl.classList.add("hidden");
    if (heroEmptyCtaEl) heroEmptyCtaEl.classList.remove("hidden");
    setSpinningState(false);
  }
  const isPlaying = !enginePaused();
  if (isPlaying) playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  else playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.14v14l11-7z"/></svg>`;
  playPauseBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  // time texts handled by seek ring updates, but also update stat if needed
  const dur = engineDuration();
  if (statTimeEl && player.current && player.current.value.source === "local") {
    if (Number.isFinite(dur) && dur > 0) statTimeEl.textContent = formatTime(dur);
  }
  setSpinningState(isPlaying);
  syncAllRows();
}

export function updateShuffleRepeatUI(): void {
  const shuffleBtn = document.getElementById("shuffleBtn") as HTMLButtonElement | null;
  const repeatBtn = document.getElementById("repeatBtn") as HTMLButtonElement | null;
  if (!shuffleBtn || !repeatBtn) return;
  const shuffleOn = player.shuffle; shuffleBtn.textContent = "Shuffle"; shuffleBtn.setAttribute("aria-pressed", String(shuffleOn)); shuffleBtn.setAttribute("aria-label", `Shuffle: ${shuffleOn ? "on" : "off"}`); shuffleBtn.title = `Shuffle: ${shuffleOn ? "on" : "off"}`; shuffleBtn.classList.toggle("active", shuffleOn);
  const mode = player.repeat; const label = mode === "off" ? "Off" : mode === "all" ? "All" : "One";
  repeatBtn.textContent = `Repeat: ${label}`; repeatBtn.setAttribute("aria-pressed", String(mode !== "off")); repeatBtn.setAttribute("aria-label", `Repeat: ${label}`); repeatBtn.title = `Repeat: ${label}`; repeatBtn.classList.toggle("active", mode !== "off");
}

import { Song } from "../library.js";
import { library, player, getActiveList } from "../state.js";
import {
  playlistListEl,
  playlistCount,
  songListEl,
  emptyStateEl,
  dropZoneTop,
  audioEl,
  currentTitleEl,
  currentMetaEl,
  queueIndicatorEl,
  currentTimeEl,
  totalTimeEl,
  playPauseBtn,
  shuffleBtn,
  repeatBtn,
  countLabel,
  linkedViewEl,
  linkedCaptionEl,
  coverEl,
  playingFromEl,
  statArtistEl,
  statTimeEl,
  statNextEl,
  dockTitleEl,
  dockArtistEl,
  dockCoverEl,
  heroEmptyCtaEl,
} from "./dom.js";
import { formatTime, formatFileSize, fileExtension } from "./format.js";
import { buildRow, syncRowPlayingState } from "./songRow.js";
import { setRenderCallbacks } from "./actions.js";
import { renderLinkedView } from "./linkedview.js";
import { coverLetter } from "./cover.js";
import { saveLibrary } from "./persistence.js";
import { ensureGapPool, reorderGapsAndRows } from "./gaps.js";
import { doMaskedReveal, buildInitialTitle } from "./reveal.js";

let prevTitle = "";

export function renderPlaylists(): void {
  const names = library.getNames();
  const active = library.getActiveName();
  playlistListEl.innerHTML = "";
  for (const name of names) {
    const li = document.createElement("li");
    li.className = "playlist-pill";
    if (name === active) li.classList.add("active");
    const label = document.createElement("span");
    label.className = "pill-label";
    label.textContent = name;
    const badge = document.createElement("span");
    badge.className = "pill-count";
    badge.textContent = String(library.getPlaylist(name)?.size ?? 0);
    li.append(label, badge);
    li.addEventListener("click", () => {
      const wasPlaying = player.current !== null;
      const prevList = player.getPlayingList();
      library.switchTo(name);
      if (!wasPlaying) player.setPlayingList(library.getActiveList());
      else player.setPlayingList(prevList);
      (document.getElementById("searchInput") as HTMLInputElement).value = "";
      renderAll();
      saveLibrary(library);
    });
    playlistListEl.appendChild(li);
  }
  playlistCount.textContent = `${names.length} playlist${names.length !== 1 ? "s" : ""}`;
}

function recordPositions(): Map<string, DOMRect> {
  const m = new Map<string, DOMRect>();
  for (const el of Array.from(songListEl.children)) {
    const id = (el as HTMLElement).dataset["id"];
    if (id) m.set(id, el.getBoundingClientRect());
  }
  return m;
}

function animateFlip(first: Map<string, DOMRect>): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const el of Array.from(songListEl.children)) {
    const h = el as HTMLElement;
    const id = h.dataset["id"];
    if (!id || !first.has(id)) {
      h.animate(
        [
          { opacity: 0, transform: "scale(0.96)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 320, easing: "cubic-bezier(0.19,1,0.22,1)" },
      );
      continue;
    }
    const f = first.get(id)!;
    const last = h.getBoundingClientRect();
    const dx = f.left - last.left;
    const dy = f.top - last.top;
    if (dx === 0 && dy === 0) continue;
    h.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0,0)" }],
      { duration: 320, easing: "cubic-bezier(0.19,1,0.22,1)" },
    );
  }
}

function syncAllRows(): void {
  const currentId = player.current?.value.id ?? null;
  const audioPlaying = !audioEl.paused && !audioEl.ended;
  for (const child of Array.from(songListEl.children)) {
    const el = child as HTMLElement;
    if (el.classList.contains("gap")) continue;
    const id = el.dataset["id"] ?? "";
    syncRowPlayingState(el, id === currentId, audioPlaying);
  }
}

export function renderSongs(): void {
  const list = getActiveList();
  const query = (document.getElementById("searchInput") as HTMLInputElement).value.trim().toLowerCase();
  const isFiltered = query.length > 0;
  const allEntries: Array<{ song: Song; index: number; node: import("../doublylinked.js").ListNode<Song> }> = [];
  let idx = 0;
  let cur = list.head;
  while (cur !== null) {
    allEntries.push({ song: cur.value, index: idx, node: cur });
    cur = cur.next;
    idx++;
  }
  const visible = isFiltered ? allEntries.filter((e) => e.song.title.toLowerCase().includes(query)) : allEntries;
  countLabel.textContent = isFiltered ? `${visible.length} / ${list.size} songs` : `${list.size} song${list.size !== 1 ? "s" : ""}`;
  emptyStateEl.style.display = visible.length === 0 ? "block" : "none";
  const titleEl = emptyStateEl.querySelector(".empty-title") as HTMLElement;
  if (visible.length === 0) {
    if (list.size === 0) titleEl.textContent = "No songs yet";
    else if (isFiltered) titleEl.textContent = "No matches";
  }
  dropZoneTop.classList.toggle("hidden", isFiltered);
  dropZoneTop.dataset["index"] = "0";
  if (isFiltered) dropZoneTop.setAttribute("aria-hidden", "true");
  const first = recordPositions();
  const existingIds = new Set<string>();
  for (const e of visible) existingIds.add(e.song.id);
  for (const child of Array.from(songListEl.children)) {
    const id = (child as HTMLElement).dataset["id"];
    const isGap = child.classList.contains("gap");
    if (isGap) continue;
    if (id && !existingIds.has(id)) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) child.remove();
      else {
        const el = child as HTMLElement;
        const anim = el.animate(
          [
            { opacity: 1, transform: "scaleY(1)" },
            { opacity: 0, transform: "scaleY(0.8)" },
          ],
          { duration: 320, easing: "cubic-bezier(0.19,1,0.22,1)" },
        );
        anim.onfinish = () => el.remove();
      }
    }
  }
  const audioPlaying = !audioEl.paused && !audioEl.ended;
  const currentId = player.current?.value.id ?? null;
  const rows: HTMLElement[] = [];
  for (const entry of visible) {
    let row = songListEl.querySelector(`[data-id="${entry.song.id}"]`) as HTMLElement | null;
    if (!row || row.parentElement !== songListEl) {
      row = buildRow(entry);
    } else {
      const ct = row.querySelector(".song-title")?.textContent ?? "";
      if (!ct.includes(entry.song.title)) {
        const fresh = buildRow(entry);
        row.replaceWith(fresh);
        row = fresh;
      } else {
        const sub = row.querySelector(".song-artist") as HTMLElement | null;
        if (sub) {
          if (entry.song.source === "remote") {
            const artist = entry.song.artist ?? "Unknown artist";
            sub.textContent = `${artist} · 0:30 · #${entry.index + 1}`;
            if (entry.song.trackTimeMillis) sub.title = `Full track: ${formatTime(entry.song.trackTimeMillis / 1000)}`;
            else sub.removeAttribute("title");
          } else {
            sub.removeAttribute("title");
            const relink = entry.song.url === "" ? "re-link" : "";
            const dur = relink ? "re-link" : entry.song.duration !== undefined ? formatTime(entry.song.duration) : "--:--";
            sub.textContent = relink ? `${relink} · #${entry.index + 1}` : `${dur} · #${entry.index + 1}`;
          }
          const coverElRow = row.querySelector(".row-cover") as HTMLElement | null;
          if (coverElRow) {
            const hasRemoteArt = entry.song.source === "remote" && !!entry.song.artworkUrl;
            const hasImg = !!coverElRow.querySelector("img");
            if (hasRemoteArt && !hasImg) {
              const fresh = buildRow(entry);
              row.replaceWith(fresh);
              row = fresh;
            } else if (!hasRemoteArt && hasImg) {
              const fresh = buildRow(entry);
              row.replaceWith(fresh);
              row = fresh;
            }
          }
        }
        row.dataset["index"] = String(entry.index);
        (row as unknown as { _node?: import("../doublylinked.js").ListNode<Song> })._node = entry.node;
        (row as HTMLElement).draggable = !isFiltered;
        syncRowPlayingState(row, entry.song.id === currentId, audioPlaying);
      }
    }
    rows.push(row);
  }
  if (isFiltered) {
    for (const c of Array.from(songListEl.querySelectorAll(".gap"))) c.remove();
    for (const r of rows) songListEl.appendChild(r);
  } else {
    const gaps = ensureGapPool(songListEl, visible.length, false);
    reorderGapsAndRows(songListEl, gaps, rows);
  }
  syncAllRows();
  animateFlip(first);
  if (linkedViewEl && linkedCaptionEl) renderLinkedView();
}

export function updatePlayerBar(): void {
  if (player.current) {
    const title = player.current.value.title;
    const song = player.current.value;
    if (title !== prevTitle) {
      if (prevTitle !== "") doMaskedReveal(title);
      else buildInitialTitle(title);
    }
    prevTitle = title;

    // Stat row and legacy meta
    if (song.source === "remote") {
      const artist = song.artist ?? "Unknown artist";
      const full = song.trackTimeMillis ? formatTime(song.trackTimeMillis / 1000) : "";
      const parts: string[] = [artist, "0:30"];
      if (full) parts.push(full);
      currentMetaEl.textContent = parts.join(" · ");
      if (song.trackTimeMillis) currentMetaEl.title = `Full track: ${full}`;
      else currentMetaEl.removeAttribute("title");
      if (statArtistEl) statArtistEl.textContent = artist;
      if (statTimeEl) statTimeEl.textContent = "0:30";
      if (statNextEl) {
        const nextT = player.current.next?.value.title ?? "—";
        statNextEl.textContent = nextT;
      }
      if (dockArtistEl) dockArtistEl.textContent = artist;
    } else {
      currentMetaEl.removeAttribute("title");
      const ext = song.fileName ? fileExtension(song.fileName) : "";
      const sizeStr = song.fileSize ? formatFileSize(song.fileSize) : "";
      const dur = song.duration !== undefined ? formatTime(song.duration) : formatTime(audioEl.duration);
      const parts = [dur];
      if (ext) parts.push(ext);
      if (sizeStr) parts.push(sizeStr);
      currentMetaEl.textContent = parts.join(" · ");
      if (statArtistEl) statArtistEl.textContent = song.artist ?? "Local file";
      if (statTimeEl) statTimeEl.textContent = dur;
      if (statNextEl) {
        const nextT = player.current.next?.value.title ?? "—";
        statNextEl.textContent = nextT;
      }
      if (dockArtistEl) dockArtistEl.textContent = song.artist ?? song.fileName ?? "Local";
    }
    const prevT = player.current.prev?.value.title ?? null;
    const nextT = player.current.next?.value.title ?? null;
    const segs: string[] = [];
    if (prevT) segs.push(`Previous: ${prevT}`);
    if (nextT) segs.push(`Up next: ${nextT}`);
    queueIndicatorEl.textContent = segs.join("  ·  ");
    queueIndicatorEl.style.display = segs.length ? "block" : "none";
    if (dockTitleEl) dockTitleEl.textContent = title;

    // Cover — ink-on-ink disc with artwork or initial
    if (coverEl) {
      coverEl.innerHTML = "";
      if (song.source === "remote" && song.artworkUrl) {
        const img = document.createElement("img");
        img.src = song.artworkUrl;
        img.alt = "";
        img.loading = "lazy";
        (img as HTMLImageElement).decoding = "async";
        img.className = "cover-art-img";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.style.borderRadius = "50%";
        img.addEventListener("error", () => {
          coverEl!.innerHTML = "";
          const fb = document.createElement("span");
          fb.className = "cover-art-fallback";
          fb.textContent = coverLetter(title);
          coverEl!.appendChild(fb);
        });
        const wrap = document.createElement("div");
        wrap.className = "cover-art-inner";
        wrap.appendChild(img);
        coverEl.appendChild(wrap);
        const fb = document.createElement("span");
        fb.className = "cover-art-fallback";
        fb.textContent = coverLetter(title);
        fb.style.display = "none";
        coverEl.appendChild(fb);
        img.addEventListener("load", () => {
          fb.style.display = "none";
        });
      } else {
        const fb = document.createElement("span");
        fb.className = "cover-art-fallback";
        fb.textContent = coverLetter(title);
        coverEl.appendChild(fb);
      }
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      coverEl.classList.toggle("spinning", !audioEl.paused && !prefersReduced);
    }
    if (dockCoverEl) {
      dockCoverEl.textContent = coverLetter(title);
      if (song.source === "remote" && song.artworkUrl) {
        dockCoverEl.innerHTML = "";
        const img = document.createElement("img");
        img.src = song.artworkUrl;
        img.alt = "";
        img.loading = "lazy";
        (img as HTMLImageElement).decoding = "async";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.addEventListener("error", () => {
          dockCoverEl!.textContent = coverLetter(title);
        });
        dockCoverEl.appendChild(img);
      }
    }

    if (playingFromEl) {
      const viewed = getActiveList();
      const playingList = player.getPlayingList();
      if (playingList && viewed !== playingList) {
        const name = library.getNames().find((n) => library.getPlaylist(n) === playingList) ?? "playlist";
        playingFromEl.textContent = `Playing from ${name}`;
        playingFromEl.classList.remove("hidden");
      } else playingFromEl.classList.add("hidden");
    }
    if (heroEmptyCtaEl) heroEmptyCtaEl.classList.add("hidden");
  } else {
    if (prevTitle !== "Nothing playing") doMaskedReveal("Nothing playing");
    prevTitle = "Nothing playing";
    currentMetaEl.textContent = "—";
    queueIndicatorEl.textContent = "";
    queueIndicatorEl.style.display = "none";
    if (statArtistEl) statArtistEl.textContent = "—";
    if (statTimeEl) statTimeEl.textContent = "—";
    if (statNextEl) statNextEl.textContent = "—";
    if (dockTitleEl) dockTitleEl.textContent = "Nothing playing";
    if (dockArtistEl) dockArtistEl.textContent = "—";
    if (coverEl) {
      coverEl.innerHTML = "";
      const fb = document.createElement("span");
      fb.className = "cover-art-fallback";
      fb.textContent = "♪";
      coverEl.appendChild(fb);
      coverEl.classList.remove("spinning");
    }
    if (dockCoverEl) dockCoverEl.textContent = "♪";
    prevTitle = "Nothing playing";
    if (playingFromEl) playingFromEl.classList.add("hidden");
    if (heroEmptyCtaEl) heroEmptyCtaEl.classList.remove("hidden");
  }
  const isPlaying = !audioEl.paused && !audioEl.ended;
  if (isPlaying) playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  else playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.14v14l11-7z"/></svg>`;
  playPauseBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  currentTimeEl.textContent = formatTime(audioEl.currentTime);
  if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) totalTimeEl.textContent = formatTime(audioEl.duration);
  else totalTimeEl.textContent = "0:00";
  if (statTimeEl && player.current && player.current.value.source !== "remote") {
    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) statTimeEl.textContent = formatTime(audioEl.duration);
  }
  syncAllRows();
}

export function updateShuffleRepeatUI(): void {
  const shuffleOn = player.shuffle;
  shuffleBtn.textContent = "Shuffle";
  shuffleBtn.setAttribute("aria-pressed", String(shuffleOn));
  shuffleBtn.setAttribute("aria-label", `Shuffle: ${shuffleOn ? "on" : "off"}`);
  shuffleBtn.title = `Shuffle: ${shuffleOn ? "on" : "off"}`;
  shuffleBtn.classList.toggle("active", shuffleOn);
  const mode = player.repeat;
  const label = mode === "off" ? "Off" : mode === "all" ? "All" : "One";
  repeatBtn.textContent = `Repeat: ${label}`;
  repeatBtn.setAttribute("aria-pressed", String(mode !== "off"));
  repeatBtn.setAttribute("aria-label", `Repeat: ${label}`);
  repeatBtn.title = `Repeat: ${label}`;
  repeatBtn.classList.toggle("active", mode !== "off");
}

export function renderAll(): void {
  renderPlaylists();
  renderSongs();
  updatePlayerBar();
  updateShuffleRepeatUI();
}
setRenderCallbacks(renderAll, renderSongs, updatePlayerBar);
export { syncAllRows };

import { Song } from "../../library.js";
import { library, player, getActiveList } from "../../state.js";
import { playlistListEl, playlistCount, songListEl, emptyStateEl, dropZoneTop, countLabel, linkedViewEl, linkedCaptionEl } from "../dom.js";
import { formatTime } from "../format.js";
import { buildRow, syncRowPlayingState } from "../songRow.js";
import { saveLibrary } from "../persistence.js";
import { enginePaused } from "../../engines.js";
import { ensureGapPool, reorderGapsAndRows } from "../gaps.js";
import { renderLinkedView } from "../linkedview.js";

export function renderPlaylists(): void {
  const names = library.getNames();
  const active = library.getActiveName();
  playlistListEl.innerHTML = "";
  for (const name of names) {
    const li = document.createElement("li"); li.className = "playlist-pill"; if (name === active) li.classList.add("active");
    const label = document.createElement("span"); label.className = "pill-label"; label.textContent = name;
    const badge = document.createElement("span"); badge.className = "pill-count"; badge.textContent = String(library.getPlaylist(name)?.size ?? 0);
    li.append(label, badge);
    li.addEventListener("click", () => {
      const wasPlaying = player.current !== null; const prevList = player.getPlayingList();
      library.switchTo(name);
      if (!wasPlaying) player.setPlayingList(library.getActiveList());
      else player.setPlayingList(prevList);
      (document.getElementById("searchInput") as HTMLInputElement).value = "";
      // renderAll via callback to avoid cycle; direct call here
      // will be wired by facade
      const fn = (window as unknown as { __renderAll?: () => void }).__renderAll;
      if (fn) fn(); else { saveLibrary(library); }
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
    const h = el as HTMLElement; const id = h.dataset["id"];
    if (!id || !first.has(id)) {
      h.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(0.19,1,0.22,1)" });
      continue;
    }
    const f = first.get(id)!; const last = h.getBoundingClientRect(); const dx = f.left - last.left; const dy = f.top - last.top;
    if (dx === 0 && dy === 0) continue;
    h.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0,0)" }], { duration: 320, easing: "cubic-bezier(0.19,1,0.22,1)" });
  }
}
function syncAllRows(): void {
  const currentId = player.current?.value.id ?? null; const audioPlaying = !enginePaused();
  for (const child of Array.from(songListEl.children)) {
    const el = child as HTMLElement; if (el.classList.contains("gap")) continue;
    const id = el.dataset["id"] ?? ""; syncRowPlayingState(el, id === currentId, audioPlaying);
  }
}

export function renderSongs(): void {
  const list = getActiveList();
  const query = (document.getElementById("searchInput") as HTMLInputElement).value.trim().toLowerCase();
  const isFiltered = query.length > 0;
  const allEntries: Array<{ song: Song; index: number; node: import("../../doublylinked.js").ListNode<Song> }> = [];
  let idx = 0; let cur = list.head;
  while (cur !== null) { allEntries.push({ song: cur.value, index: idx, node: cur }); cur = cur.next; idx++; }
  const visible = isFiltered ? allEntries.filter((e) => e.song.title.toLowerCase().includes(query)) : allEntries;
  countLabel.textContent = isFiltered ? `${visible.length} / ${list.size} songs` : `${list.size} song${list.size !== 1 ? "s" : ""}`;
  emptyStateEl.style.display = visible.length === 0 ? "block" : "none";
  const titleEl = emptyStateEl.querySelector(".empty-title") as HTMLElement;
  const stepsEl = document.getElementById("emptySteps") as HTMLElement | null;
  const noResEl = document.getElementById("noSearchResults") as HTMLElement | null;
  if (visible.length === 0) {
    if (list.size === 0) { titleEl.textContent = "No songs yet"; if (stepsEl) stepsEl.style.display = "flex"; if (noResEl) noResEl.classList.add("hidden"); }
    else if (isFiltered) { titleEl.textContent = "No matches"; if (stepsEl) stepsEl.style.display = "none"; if (noResEl) noResEl.classList.remove("hidden"); }
    else { titleEl.textContent = "No songs yet"; if (stepsEl) stepsEl.style.display = "flex"; if (noResEl) noResEl.classList.add("hidden"); }
  } else { if (stepsEl) stepsEl.style.display = "none"; if (noResEl) noResEl.classList.add("hidden"); }
  dropZoneTop.classList.toggle("hidden", isFiltered); dropZoneTop.dataset["index"] = "0"; if (isFiltered) dropZoneTop.setAttribute("aria-hidden", "true");
  const first = recordPositions();
  const existingIds = new Set<string>(); for (const e of visible) existingIds.add(e.song.id);
  for (const child of Array.from(songListEl.children)) {
    const id = (child as HTMLElement).dataset["id"]; const isGap = child.classList.contains("gap");
    if (isGap) continue;
    if (id && !existingIds.has(id)) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) child.remove();
      else {
        const el = child as HTMLElement;
        const anim = el.animate([{ opacity: 1, transform: "scaleY(1)" }, { opacity: 0, transform: "scaleY(0.8)" }], { duration: 320, easing: "cubic-bezier(0.19,1,0.22,1)" });
        anim.onfinish = () => el.remove();
      }
    }
  }
  const audioPlaying = !enginePaused(); const currentId = player.current?.value.id ?? null;
  const rows: HTMLElement[] = [];
  for (const entry of visible) {
    let row = songListEl.querySelector(`[data-id="${entry.song.id}"]`) as HTMLElement | null;
    if (!row || row.parentElement !== songListEl) row = buildRow(entry);
    else {
      const ct = row.querySelector(".song-title")?.textContent ?? "";
      if (!ct.includes(entry.song.title)) { const fresh = buildRow(entry); row.replaceWith(fresh); row = fresh; }
      else {
        const sub = row.querySelector(".song-artist") as HTMLElement | null;
        if (sub) {
          if (entry.song.source === "remote" || entry.song.source === "youtube") {
            const artist = entry.song.artist ?? "Unknown artist";
            sub.textContent = `${artist} · 0:30 · #${entry.index + 1}`;
            if (entry.song.trackTimeMillis) sub.title = `Full track: ${formatTime(entry.song.trackTimeMillis / 1000)}`;
            else sub.removeAttribute("title");
          } else {
            sub.removeAttribute("title"); const relink = entry.song.url === "" ? "re-link" : "";
            const dur = relink ? "re-link" : entry.song.duration !== undefined ? formatTime(entry.song.duration) : "--:--";
            sub.textContent = relink ? `${relink} · #${entry.index + 1}` : `${dur} · #${entry.index + 1}`;
          }
          const coverElRow = row.querySelector(".row-cover") as HTMLElement | null;
          if (coverElRow) {
            const hasRemoteArt = (entry.song.source === "remote" || entry.song.source === "youtube") && !!entry.song.artworkUrl;
            const hasImg = !!coverElRow.querySelector("img");
            if (hasRemoteArt && !hasImg) { const fresh = buildRow(entry); row.replaceWith(fresh); row = fresh; }
            else if (!hasRemoteArt && hasImg) { const fresh = buildRow(entry); row.replaceWith(fresh); row = fresh; }
          }
        }
        row.dataset["index"] = String(entry.index);
        (row as unknown as { _node?: import("../../doublylinked.js").ListNode<Song> })._node = entry.node;
        (row as HTMLElement).draggable = !isFiltered;
        syncRowPlayingState(row, entry.song.id === currentId, audioPlaying);
      }
    }
    rows.push(row);
  }
  if (isFiltered) { for (const c of Array.from(songListEl.querySelectorAll(".gap"))) c.remove(); for (const r of rows) songListEl.appendChild(r); }
  else { const gaps = ensureGapPool(songListEl, visible.length, false); reorderGapsAndRows(songListEl, gaps, rows); }
  syncAllRows(); animateFlip(first);
  if (linkedViewEl && linkedCaptionEl) renderLinkedView();
}

export { syncAllRows };

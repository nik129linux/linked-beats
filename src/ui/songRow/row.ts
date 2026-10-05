import { ListNode } from "../../doublylinked.js";
import { Song } from "../../library.js";
import { player, setDragFromNode, setDragFromIndex, getActiveList } from "../../state.js";
import { formatTime } from "../format.js";
import { enginePaused } from "../../engines.js";
import { coverLetter } from "../cover.js";
import { handleDelete, playNode } from "../actions.js";
import { openRowMenu } from "./menu.js";

type RowElement = HTMLLIElement & { _node?: ListNode<Song> };
export function getRowNode(row: HTMLElement): ListNode<Song> | null { return (row as RowElement)._node ?? null; }
export function resolveLiveIndex(row: HTMLElement, node: ListNode<Song> | null): number {
  if (node) { const idx = getActiveList().indexOf(node); if (idx !== -1) return idx; }
  const v = row.dataset["index"]; if (v !== undefined) { const n = Number(v); if (Number.isFinite(n)) return n; } return -1;
}
export function getLiveNode(row: HTMLElement): ListNode<Song> | null {
  const n = getRowNode(row); if (n && getActiveList().indexOf(n) !== -1) return n;
  const id = row.dataset["id"];
  if (id) { let cur = getActiveList().head; while (cur) { if (cur.value.id === id) return cur; cur = cur.next; } }
  return n;
}
function icon(name: string): string {
  const m: Record<string, string> = {
    play: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5.14v14l11-7z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
    dots: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>`,
    grip: `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>`,
  };
  return m[name] ?? "";
}
export function buildRow(entry: { song: Song; index: number; node: ListNode<Song> }): HTMLLIElement {
  const isFiltered = (document.getElementById("searchInput") as HTMLInputElement).value.trim().length > 0;
  const isCurrent = player.current === entry.node; const audioPlaying = !enginePaused();
  const li = document.createElement("li") as RowElement;
  li.className = "song-row"; if (isCurrent) li.classList.add("playing"); li.draggable = !isFiltered;
  li.dataset["index"] = String(entry.index); li.dataset["id"] = entry.song.id; li.tabIndex = 0; li.setAttribute("role", "listitem");
  li.setAttribute("aria-label", `${entry.song.title}, position ${entry.index + 1}`); li._node = entry.node;
  const cover = document.createElement("div"); cover.className = "row-cover"; cover.setAttribute("aria-hidden", "true");
  if ((entry.song.source === "remote" || entry.song.source === "youtube") && entry.song.artworkUrl) {
    const img = document.createElement("img"); img.src = entry.song.artworkUrl; img.alt = ""; img.loading = "lazy"; (img as HTMLImageElement).decoding = "async"; img.className = "row-cover-img";
    img.addEventListener("error", () => { img.style.display = "none"; }); cover.appendChild(img);
    const fallback = document.createElement("span"); fallback.className = "row-cover-fallback"; fallback.textContent = coverLetter(entry.song.title); cover.appendChild(fallback);
    img.addEventListener("load", () => { fallback.style.display = "none"; });
  } else cover.textContent = coverLetter(entry.song.title);
  const info = document.createElement("div"); info.className = "song-info";
  const titleEl = document.createElement("div"); titleEl.className = "song-title";
  if (isCurrent) {
    const eq = document.createElement("span"); eq.className = "equalizer"; eq.setAttribute("aria-hidden", "true"); eq.innerHTML = `<span></span><span></span><span></span><span></span>`; eq.style.display = audioPlaying ? "" : "none"; titleEl.appendChild(eq);
    const txt = document.createElement("span"); txt.className = "title-text"; txt.textContent = entry.song.title; titleEl.appendChild(txt);
  } else titleEl.textContent = entry.song.title;
  const sub = document.createElement("div"); sub.className = "song-artist";
  let subText: string; let tooltip = "";
  if (entry.song.source === "remote" || entry.song.source === "youtube") { const artist = entry.song.artist ?? "Unknown artist"; subText = `${artist} · ${entry.song.source === "youtube" ? "Full song" : "0:30"} · #${entry.index + 1}`; if (entry.song.trackTimeMillis) tooltip = `Full track: ${formatTime(entry.song.trackTimeMillis / 1000)}`; }
  else { const relink = entry.song.url === "" ? "re-link" : ""; const dur = relink ? "re-link" : entry.song.duration !== undefined ? formatTime(entry.song.duration) : "--:--"; subText = relink ? `${relink} · #${entry.index + 1}` : `${dur} · #${entry.index + 1}`; }
  sub.textContent = subText; if (tooltip) sub.title = tooltip; info.append(titleEl, sub);
  const actions = document.createElement("div"); actions.className = "song-actions";
  const playBtn = document.createElement("button"); playBtn.className = "row-play-btn"; const isPause = isCurrent && audioPlaying; playBtn.innerHTML = isPause ? icon("pause") : icon("play"); playBtn.setAttribute("aria-label", isPause ? "Pause" : "Play"); playBtn.title = isPause ? "Pause" : "Play";
  playBtn.addEventListener("click", () => { const n = getLiveNode(li) ?? entry.node; playNode(n); }); actions.appendChild(playBtn);
  const menuBtn = document.createElement("button"); menuBtn.className = "btn pill small ghost row-menu-btn"; menuBtn.innerHTML = icon("dots"); menuBtn.setAttribute("aria-label", "More actions"); menuBtn.title = "More actions"; menuBtn.setAttribute("aria-haspopup", "menu"); menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.addEventListener("click", (e) => { e.stopPropagation(); openRowMenu(e, li); }); actions.appendChild(menuBtn);
  const deleteBtn = document.createElement("button"); deleteBtn.className = "btn-remove"; deleteBtn.textContent = "Remove"; deleteBtn.setAttribute("aria-label", "Remove"); deleteBtn.title = "Remove";
  deleteBtn.addEventListener("click", () => { const n = getLiveNode(li); if (n) handleDelete(n); else { const idx = resolveLiveIndex(li, null); if (idx !== -1) handleDelete(idx); } }); actions.appendChild(deleteBtn);
  const gripEl = document.createElement("span"); gripEl.className = "grip"; gripEl.innerHTML = icon("grip"); gripEl.setAttribute("aria-hidden", "true"); li.append(gripEl, cover, info, actions);
  li.addEventListener("dragstart", (e) => {
    const n = getLiveNode(li) ?? entry.node; setDragFromNode(n); li.classList.add("dragging");
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; const liveIdx = n ? getActiveList().indexOf(n) : -1; e.dataTransfer.setData("text/plain", String(liveIdx !== -1 ? liveIdx : 0)); }
  });
  li.addEventListener("dragend", () => { li.classList.remove("dragging"); setDragFromNode(null); setDragFromIndex(null); });
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const n = getLiveNode(li) ?? entry.node; playNode(n); }
    if (e.key === "Delete") { e.preventDefault(); const n = getLiveNode(li); if (n) handleDelete(n); else { const idx = resolveLiveIndex(li, null); if (idx !== -1) handleDelete(idx); } }
  });
  return li;
}
export function syncRowPlayingState(row: HTMLElement, isCurrent: boolean, audioPlaying: boolean): void {
  row.classList.toggle("playing", isCurrent);
  const titleEl = row.querySelector(".song-title") as HTMLElement | null; const playBtn = row.querySelector(".row-play-btn") as HTMLButtonElement | null;
  if (titleEl) {
    let eq = titleEl.querySelector(".equalizer") as HTMLElement | null;
    if (isCurrent) {
      if (!eq) { eq = document.createElement("span"); eq.className = "equalizer"; eq.setAttribute("aria-hidden", "true"); eq.innerHTML = `<span></span><span></span><span></span><span></span>`; const txt = titleEl.querySelector(".title-text") as HTMLElement | null; if (txt) titleEl.insertBefore(eq, txt); else { const text = titleEl.textContent ?? ""; titleEl.textContent = ""; titleEl.appendChild(eq); const span = document.createElement("span"); span.className = "title-text"; span.textContent = text; titleEl.appendChild(span); } }
      eq.style.display = audioPlaying ? "" : "none";
    } else if (eq) { const txtEl = titleEl.querySelector(".title-text") as HTMLElement | null; const text = txtEl?.textContent ?? titleEl.textContent ?? ""; eq.remove(); titleEl.textContent = text.trim(); }
  }
  if (playBtn) {
    const showPause = isCurrent && audioPlaying;
    playBtn.innerHTML = showPause ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>` : `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5.14v14l11-7z"/></svg>`;
    playBtn.setAttribute("aria-label", showPause ? "Pause" : "Play");
  }
  const idx = row.dataset["index"] ?? "0"; const title = row.querySelector(".title-text")?.textContent ?? row.querySelector(".song-title")?.textContent ?? ""; row.setAttribute("aria-label", `${title.trim()}, position ${Number(idx) + 1}`);
}

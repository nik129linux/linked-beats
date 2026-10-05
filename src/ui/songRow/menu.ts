import { ListNode } from "../../doublylinked.js";
import { Song } from "../../library.js";
import { library, getActiveList, setPendingInsertIndex } from "../../state.js";
import { fileInput } from "../dom.js";
import { moveToBottom, moveToTop, playNext, handleAddToPlaylist } from "../actions.js";
import { showToast } from "../toast.js";
import { getLiveNode, resolveLiveIndex } from "./row.js";
import { saveLibrary } from "../persistence.js";

function closeRowMenu(): void {
  document.getElementById("rowMenuPopover")?.remove();
  document.querySelectorAll(".row-menu-btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
}

export function openRowMenu(e: MouseEvent, row: HTMLElement): void {
  closeRowMenu(); document.getElementById("addToPopover")?.remove();
  const node = getLiveNode(row);
  const song = node?.value ?? (() => {
    const id = row.dataset["id"];
    if (id) { let cur = getActiveList().head; while (cur) { if (cur.value.id === id) return cur.value; cur = cur.next; } }
    return null;
  })();
  if (!song) return;
  const pop = document.createElement("div"); pop.id = "rowMenuPopover"; pop.className = "popover row-popover"; pop.setAttribute("role", "menu");
  const resolve = (): { idx: number; n: ListNode<Song> | null } => { const n = getLiveNode(row); const idx = n ? getActiveList().indexOf(n) : resolveLiveIndex(row, n); return { idx, n }; };
  const items: Array<{ label: string; action: () => void; disabled?: boolean; title?: string }> = [
    { label: "Insert after", action: () => { const { idx } = resolve(); const live = idx !== -1 ? idx : Number(row.dataset["index"] ?? "0"); setPendingInsertIndex(live + 1); fileInput.click(); } },
    { label: "Play next", action: () => { const { n, idx } = resolve(); if (n) playNext(n); else if (idx !== -1) playNext(idx); } },
    { label: "Move up", action: () => { const { n, idx } = resolve(); if (n) moveBy(n, -1); else if (idx !== -1) moveBy(idx, -1); } },
    { label: "Move down", action: () => { const { n, idx } = resolve(); if (n) moveBy(n, 1); else if (idx !== -1) moveBy(idx, 1); } },
    { label: "Move to start", action: () => { const { n, idx } = resolve(); if (n) moveToTop(n); else if (idx !== -1) moveToTop(idx); } },
    { label: "Move to end", action: () => { const { n, idx } = resolve(); if (n) moveToBottom(n); else if (idx !== -1) moveToBottom(idx); } },
    { label: "Split here", action: () => { const { idx } = resolve(); const splitIdx = idx !== -1 ? idx + 1 : Number(row.dataset["index"] ?? "0") + 1; import("../listActions.js").then((m) => { closeRowMenu(); void m.doSplitAt(splitIdx); }); } },
    { label: "Add to playlist…", action: () => openAddToFromMenu(song, pop, row) },
    { label: "Download", action: () => handleDownload(song), disabled: !isDownloadAllowed(song), title: !isDownloadAllowed(song) ? "Downloads aren't offered for YouTube or iTunes content (copyright and terms of service)" : undefined },
  ];
  for (const it of items) {
    const btn = document.createElement("button"); btn.className = "popover-item"; btn.textContent = it.label; btn.setAttribute("role", "menuitem");
    if (it.disabled) { btn.disabled = true; btn.title = it.title ?? ""; btn.style.opacity = "0.4"; }
    btn.addEventListener("click", () => { if (it.disabled) return; closeRowMenu(); it.action(); }); pop.appendChild(btn);
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); document.body.appendChild(pop);
  const pr = pop.getBoundingClientRect(); let left = rect.left - pr.width + rect.width; if (left < 8) left = 8; if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
  let top = rect.bottom + 6; if (top + pr.height > window.innerHeight - 8) top = rect.top - pr.height - 6;
  pop.style.left = `${left}px`; pop.style.top = `${top}px`; (e.currentTarget as HTMLElement).setAttribute("aria-expanded", "true");
  const first = pop.querySelector("button:not([disabled])") as HTMLElement | null; first?.focus({ preventScroll: true } as FocusOptions);
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") { closeRowMenu(); document.removeEventListener("keydown", onKey); }
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault(); const btns = Array.from(pop.querySelectorAll("button:not([disabled])")) as HTMLElement[]; const idx = btns.indexOf(document.activeElement as HTMLElement); const nxt = ev.key === "ArrowDown" ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length; btns[nxt]?.focus({ preventScroll: true } as FocusOptions);
    }
  };
  document.addEventListener("keydown", onKey);
  const closeOutside = (ev: MouseEvent): void => { if (!pop.contains(ev.target as Node) && !(e.currentTarget as HTMLElement).contains(ev.target as Node)) { closeRowMenu(); document.removeEventListener("click", closeOutside); document.removeEventListener("keydown", onKey); } };
  setTimeout(() => document.addEventListener("click", closeOutside), 10);
}

function moveBy(indexOrNode: number | ListNode<Song>, delta: number): void {
  const list = getActiveList(); let index: number;
  if (typeof indexOrNode === "number") index = indexOrNode; else { index = list.indexOf(indexOrNode); if (index === -1) return; }
  const to = delta === -1 ? index - 1 : index + 1; if (to < 0 || to > list.size) return; if (delta === -1 && index === 0) return; if (delta === 1 && index === list.size - 1) return;
  try { list.move(index, to); saveLibrary(library); document.dispatchEvent(new CustomEvent("row-move")); const r = (window as unknown as { __renderAll?: () => void }).__renderAll; if (r) r(); } catch (err) { console.error(err); }
}

function openAddToFromMenu(song: Song, anchorPop: HTMLElement, row: HTMLElement | null): void {
  const names = library.getNames().filter((n) => n !== library.getActiveName());
  if (names.length === 0) { showToast({ message: "Create another playlist first" }); return; }
  anchorPop.innerHTML = "";
  for (const n of names) {
    const btn = document.createElement("button"); btn.className = "popover-item"; btn.textContent = n; btn.setAttribute("role", "menuitem");
    btn.addEventListener("click", () => { handleAddToPlaylist(song, n); closeRowMenu(); }); anchorPop.appendChild(btn);
  }
  const back = document.createElement("button"); back.className = "popover-item mono small"; back.textContent = "← Back";
  back.addEventListener("click", (ev) => { anchorPop.remove(); if (row) openRowMenu(ev as unknown as MouseEvent, row); }); anchorPop.prepend(back);
}

function isDownloadAllowed(song: Song): boolean {
  if (song.source === "youtube") return false;
  if (song.source === "remote" && song.remoteId && !song.license) return false;
  return true;
}
function handleDownload(song: Song): void {
  // delegated to download helper dynamically
  import("../../download.js").then((m) => m.downloadSong(song)).catch(() => showToast({ message: "Download failed" }));
}

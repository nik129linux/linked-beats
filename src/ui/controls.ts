import { library, player } from "../state.js";
import {
  fileInput, folderInput, addFilesBtn, addFolderBtn, addFirstBtn, addLastBtn,
  createPlaylistBtn, newPlaylistNameEl, renamePlaylistBtn, deletePlaylistBtn,
  searchInput, shuffleBtn, repeatBtn, playPauseBtn, prevBtn, nextBtn,
  audioEl, volumeBar,
  clearLibraryBtn, visualizerEl, seekBackBtn, seekForwardBtn, clearSearchBtn, searchResultLiveEl, dragHintEl,
} from "./dom.js";
import { handleFiles } from "./actions.js";
import { getActiveList, setPendingInsertIndex } from "../state.js";
import { renderAll, renderSongs, updatePlayerBar, updateShuffleRepeatUI } from "./render.js";
import { promptDialog, confirmDialog } from "./dialog.js";
import { showToast } from "./toast.js";
import { clearLibraryStorage, saveLibrary } from "./persistence.js";
import { attachVisualizer, setVisualizerPlaying } from "./visualizer.js";
import { initDrawerToggle, initMenuSheet } from "./drawer.js";
import { getListActionItems } from "./listActions.js";
import { loadPersistedVolume, updateVolumeFill, initVolumeControls } from "./controls/volume.js";
import { updateProgressFill, clampSeek, initSeekControls, initAudioEndHandlers } from "./controls/seek.js";
import { initSpeedControl, handlePlayPause as tpPlayPause, handlePrev as tpPrev, handleNext as tpNext, handlePlayRejection } from "./controls/transport.js";
import { initKeyboardShortcuts } from "./controls/keyboard.js";
import { initMediaSession, updateMediaSession, updateMediaPosition, updateDocumentTitle } from "./controls/mediaSession.js";
import { undoManager } from "../state.js";

export function initControls(): void {
  const initVol = loadPersistedVolume();
  audioEl.volume = initVol; volumeBar.value = String(initVol);
  initSpeedControl(); updateVolumeFill(); updateProgressFill();

  addFilesBtn.addEventListener("click", () => fileInput.click());
  addFolderBtn.addEventListener("click", () => folderInput.click());
  addFirstBtn.addEventListener("click", () => { setPendingInsertIndex(0); fileInput.click(); });
  addLastBtn.addEventListener("click", () => { setPendingInsertIndex(getActiveList().size); fileInput.click(); });
  fileInput.addEventListener("change", () => { if (fileInput.files) handleFiles(fileInput.files, null); });
  folderInput.addEventListener("change", () => { if (folderInput.files) handleFiles(folderInput.files, null); });
  createPlaylistBtn.addEventListener("click", async () => {
    const name = newPlaylistNameEl.value.trim();
    if (!name) { showToast({ message: "Enter a playlist name" }); return; }
    try {
      const { makePlaylistCreateCommand } = await import("../undo.js");
      undoManager.execute(makePlaylistCreateCommand(library, name));
      player.setPlayingList(library.getActiveList()); newPlaylistNameEl.value = ""; renderAll(); saveLibrary(library); showToast({ message: `Created "${name}"` });
    }
    catch (e) { showToast({ message: (e as Error).message }); }
  });
  newPlaylistNameEl.addEventListener("keydown", (e) => { if (e.key === "Enter") createPlaylistBtn.click(); });
  renamePlaylistBtn.addEventListener("click", async () => {
    const active = library.getActiveName(); if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const nextName = await promptDialog(`Rename "${active}"`, active, "New name");
    if (opener) opener.focus({ preventScroll: true } as FocusOptions);
    if (!nextName || nextName.trim() === active) return;
    try {
      const { makePlaylistRenameCommand } = await import("../undo.js");
      undoManager.execute(makePlaylistRenameCommand(library, active, nextName.trim()));
      renderAll(); saveLibrary(library); showToast({ message: "Renamed" });
    }
    catch (e) { showToast({ message: (e as Error).message }); }
  });
  deletePlaylistBtn.addEventListener("click", async () => {
    const active = library.getActiveName(); if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const ok = await confirmDialog(`Delete "${active}"?`, "This can be undone.");
    if (opener) opener.focus({ preventScroll: true } as FocusOptions);
    if (!ok) return;
    try {
      const wasPlayingList = player.getPlayingList() === library.getActiveList();
      const { makePlaylistDeleteCommand } = await import("../undo.js");
      undoManager.execute(makePlaylistDeleteCommand(library, active));
      if (wasPlayingList) player.setPlayingList(library.getActiveList());
      renderAll(); saveLibrary(library); showToast({ message: "Deleted playlist" });
    }
    catch (e) { showToast({ message: (e as Error).message }); }
  });
  clearLibraryBtn?.addEventListener("click", async () => {
    const opener = document.activeElement as HTMLElement | null;
    const ok = await confirmDialog("Clear library?", "Removes all playlists and songs.");
    if (opener) opener.focus({ preventScroll: true } as FocusOptions);
    if (!ok) return; clearLibraryStorage(); location.reload();
  });
  const listActionsBtn = document.getElementById("listActionsBtn") as HTMLButtonElement | null;
  if (listActionsBtn) {
    listActionsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = document.getElementById("listActionsPopover");
      if (existing) { existing.remove(); listActionsBtn.setAttribute("aria-expanded", "false"); return; }
      document.getElementById("mergePopover")?.remove();
      const pop = document.createElement("div"); pop.id = "listActionsPopover"; pop.className = "popover"; pop.setAttribute("role", "menu");
      const items = getListActionItems();
      for (const it of items) {
        const b = document.createElement("button"); b.className = "popover-item"; b.textContent = it.label; b.setAttribute("role", "menuitem");
        b.addEventListener("click", () => { pop.remove(); listActionsBtn.setAttribute("aria-expanded", "false"); const r = it.action(); if (r instanceof Promise) void r; });
        pop.appendChild(b);
      }
      const rect = listActionsBtn.getBoundingClientRect(); document.body.appendChild(pop);
      const pr = pop.getBoundingClientRect(); let left = rect.left; if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
      let top = rect.bottom + 6; if (top + pr.height > window.innerHeight - 8) top = rect.top - pr.height - 6;
      pop.style.left = `${left}px`; pop.style.top = `${top}px`; listActionsBtn.setAttribute("aria-expanded", "true");
      const first = pop.querySelector("button") as HTMLElement | null; first?.focus({ preventScroll: true } as FocusOptions);
      const onKey = (ev: KeyboardEvent): void => {
        if (ev.key === "Escape") { pop.remove(); listActionsBtn.setAttribute("aria-expanded", "false"); document.removeEventListener("keydown", onKey); listActionsBtn.focus({ preventScroll: true } as FocusOptions); }
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault(); const btns = Array.from(pop.querySelectorAll("button")) as HTMLElement[]; const idx = btns.indexOf(document.activeElement as HTMLElement);
          const nxt = ev.key === "ArrowDown" ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length; btns[nxt]?.focus({ preventScroll: true } as FocusOptions);
        }
      };
      document.addEventListener("keydown", onKey);
      const outside = (ev: MouseEvent): void => { if (!pop.contains(ev.target as Node) && ev.target !== listActionsBtn) { pop.remove(); listActionsBtn.setAttribute("aria-expanded", "false"); document.removeEventListener("click", outside); document.removeEventListener("keydown", onKey); } };
      setTimeout(() => document.addEventListener("click", outside), 10);
    });
  }
  const syncSearchUI = (): void => {
    const val = searchInput.value;
    if (clearSearchBtn) clearSearchBtn.classList.toggle("hidden", val.length === 0);
    const list = getActiveList(); const q = val.trim().toLowerCase();
    const visibleCount = q.length === 0 ? list.size : (() => { let c = 0; let cur = list.head; while (cur) { if (cur.value.title.toLowerCase().includes(q)) c++; cur = cur.next; } return c; })();
    if (searchResultLiveEl) searchResultLiveEl.textContent = q.length > 0 ? `${visibleCount} result${visibleCount !== 1 ? "s" : ""}` : "";
    if (dragHintEl) dragHintEl.classList.toggle("hidden", q.length === 0);
    renderSongs();
  };
  searchInput.addEventListener("input", syncSearchUI);
  clearSearchBtn?.addEventListener("click", () => { searchInput.value = ""; searchInput.focus({ preventScroll: true } as FocusOptions); syncSearchUI(); });
  searchInput.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); searchInput.value = ""; searchInput.blur(); syncSearchUI(); } });
  syncSearchUI();

  shuffleBtn.addEventListener("click", () => { player.toggleShuffle(); updateShuffleRepeatUI(); showToast({ message: `Shuffle ${player.shuffle ? "on" : "off"}` }); });
  repeatBtn.addEventListener("click", () => { const m = player.cycleRepeat(); updateShuffleRepeatUI(); showToast({ message: `Repeat ${m}` }); });
  const doPlayPause = (): void => tpPlayPause(renderAll, updatePlayerBar, updateMediaSession);
  const doPrev = (): void => tpPrev(renderAll, updatePlayerBar, updateMediaSession);
  const doNext = (): void => tpNext(renderAll, updatePlayerBar, updateMediaSession);
  playPauseBtn.addEventListener("click", doPlayPause);
  prevBtn.addEventListener("click", doPrev);
  nextBtn.addEventListener("click", doNext);
  seekBackBtn?.addEventListener("click", () => clampSeek(-10));
  seekForwardBtn?.addEventListener("click", () => clampSeek(10));
  initVolumeControls();
  initSeekControls(updateMediaPosition, updateMediaSession, updatePlayerBar, renderAll, renderSongs, handlePlayRejection);
  initAudioEndHandlers(updatePlayerBar, renderAll, renderSongs, updateMediaSession, handlePlayRejection, updateDocumentTitle);
  audioEl.addEventListener("play", () => { setVisualizerPlaying(true); });
  audioEl.addEventListener("pause", () => { setVisualizerPlaying(false); });
  initKeyboardShortcuts(doPlayPause, doPrev, doNext);
  initUndoToolbar();
  initDrawerToggle(); initMenuSheet();
  if (visualizerEl) attachVisualizer(audioEl, visualizerEl);
  const heroAdd = document.getElementById("heroAddSongsBtn") as HTMLButtonElement | null;
  if (heroAdd) heroAdd.addEventListener("click", () => fileInput.click());
  initMediaSession(doPlayPause, doPrev, doNext, clampSeek);
  updateDocumentTitle(false);
}

function initUndoToolbar(): void {
  const undoBtn = document.getElementById("undoBtn") as HTMLButtonElement | null;
  const redoBtn = document.getElementById("redoBtn") as HTMLButtonElement | null;
  const refresh = (): void => {
    if(undoBtn){ const can=undoManager.canUndo(); undoBtn.setAttribute("aria-disabled", String(!can)); undoBtn.disabled = !can; }
    if(redoBtn){ const can=undoManager.canRedo(); redoBtn.setAttribute("aria-disabled", String(!can)); redoBtn.disabled = !can; }
  };
  undoBtn?.addEventListener("click", ()=>{
    const t = undoManager.undo();
    if(t) showToast({message:`Undone: ${t}`});
    else showToast({message:"Nothing to undo"});
    saveLibrary(library); renderAll(); document.dispatchEvent(new CustomEvent("queue-update")); refresh();
  });
  redoBtn?.addEventListener("click", ()=>{
    const t = undoManager.redo();
    if(t) showToast({message:`Redone: ${t}`});
    else showToast({message:"Nothing to redo"});
    saveLibrary(library); renderAll(); document.dispatchEvent(new CustomEvent("queue-update")); refresh();
  });
  // listen to stack changes via mutation observer stub: poll refresh on any undo/redo via manager's updateButtons will handle aria, but also refresh here
  document.addEventListener("row-move", refresh);
  refresh();
}

export { updateProgressFill, updateVolumeFill, updateDocumentTitle, updateMediaSession };

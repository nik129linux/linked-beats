import { library, player } from "../state.js";
import {
  fileInput, folderInput, addFilesBtn, addFolderBtn, addFirstBtn, addLastBtn,
  createPlaylistBtn, newPlaylistNameEl, renamePlaylistBtn, deletePlaylistBtn,
  searchInput, shuffleBtn, repeatBtn, playPauseBtn, prevBtn, nextBtn,
  audioEl, progressBar, progressTooltip, volumeBar, currentTimeEl, totalTimeEl,
  clearLibraryBtn, visualizerEl, shortcutsDialogEl,
} from "./dom.js";
import { formatTime } from "./format.js";
import { handleFiles } from "./actions.js";
import { playNode } from "./actions.js";
import { getActiveList, setPendingInsertIndex } from "../state.js";
import { renderAll, renderSongs, updatePlayerBar, updateShuffleRepeatUI } from "./render.js";
import { prevAction } from "../player.js";
import { promptDialog, confirmDialog } from "./dialog.js";
import { showToast } from "./toast.js";
import { clearLibraryStorage, saveLibrary } from "./persistence.js";
import { attachVisualizer, setVisualizerPlaying, resumeContext } from "./visualizer.js";
import { isPreviewActive, stopPreviewIfPlaying } from "./searchPanel.js";
import { initDrawerToggle, initMenuSheet, toggleShortcuts } from "./drawer.js";

export function initControls(): void {
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
      library.createPlaylist(name);
      player.setPlayingList(library.getActiveList());
      newPlaylistNameEl.value = "";
      renderAll();
      saveLibrary(library);
      showToast({ message: `Created "${name}"` });
    } catch (e) { showToast({ message: (e as Error).message }); }
  });
  newPlaylistNameEl.addEventListener("keydown", (e) => { if (e.key === "Enter") createPlaylistBtn.click(); });

  renamePlaylistBtn.addEventListener("click", async () => {
    const active = library.getActiveName();
    if (!active) return;
    const nextName = await promptDialog(`Rename "${active}"`, active, "New name");
    if (!nextName || nextName.trim() === active) return;
    try { library.renamePlaylist(active, nextName.trim()); renderAll(); saveLibrary(library); showToast({ message: "Renamed" }); }
    catch (e) { showToast({ message: (e as Error).message }); }
  });

  deletePlaylistBtn.addEventListener("click", async () => {
    const active = library.getActiveName();
    if (!active) return;
    const ok = await confirmDialog(`Delete "${active}"?`, "This cannot be undone.");
    if (!ok) return;
    try {
      const wasPlayingList = player.getPlayingList() === library.getActiveList();
      library.deletePlaylist(active);
      if (wasPlayingList) player.setPlayingList(library.getActiveList());
      renderAll(); saveLibrary(library); showToast({ message: "Deleted playlist" });
    } catch (e) { showToast({ message: (e as Error).message }); }
  });

  clearLibraryBtn?.addEventListener("click", async () => {
    const ok = await confirmDialog("Clear library?", "Removes all playlists and songs.");
    if (!ok) return;
    clearLibraryStorage();
    location.reload();
  });

  searchInput.addEventListener("input", () => renderSongs());
  shuffleBtn.addEventListener("click", () => { player.toggleShuffle(); updateShuffleRepeatUI(); showToast({ message: `Shuffle ${player.shuffle ? "on" : "off"}` }); });
  repeatBtn.addEventListener("click", () => { const m = player.cycleRepeat(); updateShuffleRepeatUI(); showToast({ message: `Repeat ${m}` }); });

  playPauseBtn.addEventListener("click", () => handlePlayPause());
  prevBtn.addEventListener("click", () => handlePrev());
  nextBtn.addEventListener("click", () => handleNext());

  initAudioHandlers();
  initKeyboardShortcuts();
  initDrawerToggle();
  initMenuSheet();
  initSeekTooltip();
  if (visualizerEl) attachVisualizer(audioEl, visualizerEl);
  // hero empty CTA
  const heroAdd = document.getElementById("heroAddSongsBtn") as HTMLButtonElement | null;
  if (heroAdd) heroAdd.addEventListener("click", () => fileInput.click());
}

function handlePlayPause(): void {
  if (isPreviewActive()) { stopPreviewIfPlaying(); }
  if (player.current === null) {
    const head = getActiveList().head;
    if (head) { if (!head.value.url) { showToast({ message: "Re-link file first" }); return; } playNode(head); }
    return;
  }
  if (audioEl.ended && player.repeat === "off") {
    const head = player.getPlayingList()?.head ?? getActiveList().head;
    if (head) { playNode(head, player.getPlayingList() ?? getActiveList()); return; }
  }
  if (!audioEl.src && player.current) {
    if (!player.current.value.url) { showToast({ message: "Re-link file" }); return; }
    audioEl.crossOrigin = "anonymous";
    audioEl.src = player.current.value.url;
  }
  resumeContext();
  if (audioEl.paused) audioEl.play().catch(()=>{});
  else audioEl.pause();
}

function handlePrev(): void {
  if (isPreviewActive()) stopPreviewIfPlaying();
  if (!player.current) return;
  if (prevAction(audioEl.currentTime) === "restart") { audioEl.currentTime = 0; audioEl.play().catch(()=>{}); return; }
  const p = player.prev();
  if (p) {
    if (!p.value.url) { showToast({ message: "Re-link file" }); updatePlayerBar(); return; }
    audioEl.crossOrigin = "anonymous";
    audioEl.src = p.value.url;
    audioEl.play().catch(()=>{});
    renderAll();
  }
}

function handleNext(): void {
  if (isPreviewActive()) stopPreviewIfPlaying();
  const nxt = player.next();
  if (nxt) {
    if (!nxt.value.url) { showToast({ message: "Re-link file" }); updatePlayerBar(); return; }
    audioEl.crossOrigin = "anonymous";
    audioEl.src = nxt.value.url;
    audioEl.play().catch(()=>{});
    renderAll();
  } else if (player.repeat === "off") {
    audioEl.pause();
    audioEl.currentTime = 0;
    progressBar.value = "0";
    updatePlayerBar();
  }
}

function initAudioHandlers(): void {
  progressBar.addEventListener("input", () => {
    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
      const v = Number(progressBar.value);
      if (Number.isFinite(v)) audioEl.currentTime = v;
    }
  });
  progressBar.addEventListener("pointermove", (e) => {
    if (!progressTooltip || !Number.isFinite(audioEl.duration) || audioEl.duration === 0) return;
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const t = pct * audioEl.duration;
    progressTooltip.textContent = formatTime(t);
    progressTooltip.style.left = `${e.clientX - rect.left}px`;
    progressTooltip.classList.remove("hidden");
  });
  progressBar.addEventListener("pointerleave", () => progressTooltip?.classList.add("hidden"));

  volumeBar.addEventListener("input", () => { audioEl.volume = Number(volumeBar.value); audioEl.muted = false; });
  audioEl.addEventListener("timeupdate", () => {
    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) progressBar.value = String(audioEl.currentTime);
    currentTimeEl.textContent = formatTime(audioEl.currentTime);
    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) totalTimeEl.textContent = formatTime(audioEl.duration);
  });
  audioEl.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
      progressBar.max = String(audioEl.duration);
      progressBar.value = String(audioEl.currentTime);
      totalTimeEl.textContent = formatTime(audioEl.duration);
      if (player.current && player.current.value.duration !== audioEl.duration) {
        player.current.value.duration = audioEl.duration;
        saveLibrary(library);
      }
    } else progressBar.max = "100";
  });
  audioEl.addEventListener("play", () => { updatePlayerBar(); setVisualizerPlaying(true); });
  audioEl.addEventListener("pause", () => { updatePlayerBar(); setVisualizerPlaying(false); });
  audioEl.addEventListener("ended", () => {
    if (isPreviewActive()) return;
    if (player.repeat === "one" && player.current) { audioEl.currentTime = 0; audioEl.play().catch(()=>{}); return; }
    const nxt = player.next();
    if (nxt) {
      if (!nxt.value.url) { updatePlayerBar(); renderSongs(); return; }
      audioEl.crossOrigin = "anonymous";
      audioEl.src = nxt.value.url;
      audioEl.play().catch(()=>{});
      renderAll();
    } else {
      audioEl.pause();
      audioEl.currentTime = 0;
      progressBar.value = "0";
      updatePlayerBar();
      renderSongs();
    }
  });
}

function initKeyboardShortcuts(): void {
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
      if (e.key === "Escape" && t === searchInput) { (t as HTMLInputElement).blur(); }
      return;
    }
    if (e.key === "?" ) { e.preventDefault(); toggleShortcuts(); return; }
    if (e.key === "/" ) { e.preventDefault(); searchInput.focus({ preventScroll: true } as FocusOptions); return; }
    if (e.key === "Delete") {
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.classList.contains("song-row")) {
        e.preventDefault();
        const node = (focused as unknown as { _node?: import("../doublylinked.js").ListNode<import("../library.js").Song> })._node ?? null;
        if (node) {
          const list = getActiveList();
          const idx = list.indexOf(node);
          if (idx !== -1) import("./actions.js").then(m=>m.handleDelete(node));
          else {
            const idx2 = focused.dataset["index"];
            if (idx2 !== undefined) import("./actions.js").then(m=>m.handleDelete(Number(idx2)));
          }
        } else {
          const idx = focused?.dataset["index"];
          if (idx !== undefined) import("./actions.js").then(m=>m.handleDelete(Number(idx)));
        }
      }
      return;
    }
    if (e.code === "Space") { e.preventDefault(); handlePlayPause(); return; }
    if (e.code === "ArrowRight") {
      if (e.shiftKey) { e.preventDefault(); handleNext(); }
      else { e.preventDefault(); audioEl.currentTime = Math.min(audioEl.duration || Infinity, audioEl.currentTime + 5); }
      return;
    }
    if (e.code === "ArrowLeft") {
      if (e.shiftKey) { e.preventDefault(); handlePrev(); }
      else { e.preventDefault(); audioEl.currentTime = Math.max(0, audioEl.currentTime - 5); }
      return;
    }
    if (e.code === "ArrowUp") { e.preventDefault(); audioEl.volume = Math.min(1, audioEl.volume + 0.05); volumeBar.value = String(audioEl.volume); return; }
    if (e.code === "ArrowDown") { e.preventDefault(); audioEl.volume = Math.max(0, audioEl.volume - 0.05); volumeBar.value = String(audioEl.volume); return; }
    if (e.key.toLowerCase() === "m") { e.preventDefault(); audioEl.muted = !audioEl.muted; showToast({ message: audioEl.muted ? "Muted" : "Unmuted" }); return; }
    if (e.key.toLowerCase() === "s") { e.preventDefault(); player.toggleShuffle(); updateShuffleRepeatUI(); return; }
    if (e.key.toLowerCase() === "r") { e.preventDefault(); player.cycleRepeat(); updateShuffleRepeatUI(); return; }
  });
}



function initSeekTooltip(): void {
  // handled in initAudioHandlers
}

import { player, getActiveList } from "../../state.js";
import { searchInput, volumeBar } from "../dom.js";
import { clampVolume, persistVolume, updateVolumeFill, updateVolumeReadoutVisibility } from "./volume.js";
import { clampSeek } from "./seek.js";
import { showToast } from "../toast.js";
import { updateShuffleRepeatUI } from "../render.js";
import { toggleShortcuts } from "../drawer.js";
import { engineSetVolume, engineSetMuted } from "../../engines.js";

function isTypingTarget(t: HTMLElement | null): boolean {
  if (!t) return false;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
  if (t.isContentEditable) return true;
  const dialogOpen = document.querySelector(".dialog-overlay:not(.hidden)");
  if (dialogOpen && dialogOpen.contains(t)) return true;
  const anyDialog = document.querySelector(".dialog-overlay:not(.hidden), .search-overlay:not(.hidden)");
  if (anyDialog) return true;
  return false;
}

export function initKeyboardShortcuts(
  handlePlayPause: () => void,
  handlePrev: () => void,
  handleNext: () => void,
): void {
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (e.key === "Escape" && t === searchInput) { (t as HTMLInputElement).blur(); return; }
    if (isTypingTarget(t)) {
      if (e.key === "Escape" && t === searchInput) (t as HTMLInputElement).blur();
      return;
    }
    if (e.key === "?") { e.preventDefault(); toggleShortcuts(); return; }
    if (e.key === "/") { e.preventDefault(); searchInput.focus({ preventScroll: true } as FocusOptions); return; }
    if (e.key === "Delete") {
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.classList.contains("song-row")) {
        e.preventDefault();
        const node = (focused as unknown as { _node?: import("../../doublylinked.js").ListNode<import("../../library.js").Song> })._node ?? null;
        if (node) {
          const list = getActiveList(); const idx = list.indexOf(node);
          if (idx !== -1) import("../actions.js").then((m) => m.handleDelete(node));
          else { const idx2 = focused.dataset["index"]; if (idx2 !== undefined) import("../actions.js").then((m) => m.handleDelete(Number(idx2))); }
        } else {
          const idx = focused?.dataset["index"]; if (idx !== undefined) import("../actions.js").then((m) => m.handleDelete(Number(idx)));
        }
      }
      return;
    }
    const keyLower = e.key.toLowerCase();
    if (e.code === "Space" || e.key === " ") { e.preventDefault(); handlePlayPause(); return; }
    if (keyLower === "j") { e.preventDefault(); clampSeek(-10); return; }
    if (keyLower === "l") { e.preventDefault(); clampSeek(10); return; }
    if (e.code === "ArrowRight" || e.key === "ArrowRight") {
      if (e.shiftKey) { e.preventDefault(); handleNext(); } else { e.preventDefault(); clampSeek(5); }
      return;
    }
    if (e.code === "ArrowLeft" || e.key === "ArrowLeft") {
      if (e.shiftKey) { e.preventDefault(); handlePrev(); } else { e.preventDefault(); clampSeek(-5); }
      return;
    }
    if (e.code === "ArrowUp" || e.key === "ArrowUp") {
      e.preventDefault(); const cur = clampVolume(Number(volumeBar.value) + 0.05); volumeBar.value = String(cur); engineSetVolume(cur); engineSetMuted(false); persistVolume(cur); updateVolumeFill(); updateVolumeReadoutVisibility(true); window.setTimeout(() => updateVolumeReadoutVisibility(false), 1200); return;
    }
    if (e.code === "ArrowDown" || e.key === "ArrowDown") {
      e.preventDefault(); const cur2 = clampVolume(Number(volumeBar.value) - 0.05); volumeBar.value = String(cur2); engineSetVolume(cur2); engineSetMuted(false); persistVolume(cur2); updateVolumeFill(); updateVolumeReadoutVisibility(true); window.setTimeout(() => updateVolumeReadoutVisibility(false), 1200); return;
    }
    if (keyLower === "m") { e.preventDefault(); const isMuted = volumeBar.value === "0"; if (isMuted) { volumeBar.value = "0.5"; engineSetMuted(false); engineSetVolume(0.5); persistVolume(0.5); showToast({ message: "Unmuted" }); } else { engineSetMuted(true); volumeBar.value = "0"; persistVolume(0); showToast({ message: "Muted" }); } updateVolumeFill(); return; }
    if (keyLower === "s") { e.preventDefault(); player.toggleShuffle(); updateShuffleRepeatUI(); return; }
    if (keyLower === "r") { e.preventDefault(); player.cycleRepeat(); updateShuffleRepeatUI(); return; }
    if ((e.ctrlKey || e.metaKey) && keyLower === "y") {
      // Ctrl+Y redo (also Ctrl+Shift+Z)
      if (isTypingTarget(t)) return;
      e.preventDefault();
      import("../../state.js").then(m=> {
        const txt = m.undoManager.redo();
        if(txt) import("../toast.js").then(to=> to.showToast({ message: `Redone: ${txt}` }));
        else import("../toast.js").then(to=> to.showToast({ message: "Nothing to redo" }));
        import("../persistence.js").then(p=> { try{ const lib=(m as unknown as { library: import("../../library.js").Library }).library; if(lib) p.saveLibrary(lib);}catch{} });
        import("../render.js").then(r=> { try{ r.renderAll(); }catch{} });
        document.dispatchEvent(new CustomEvent("queue-update"));
      });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && keyLower === "z") {
      if (isTypingTarget(t)) return;
      e.preventDefault();
      if (e.shiftKey) {
        import("../../state.js").then(m=> {
          const txt = m.undoManager.redo();
          if(txt) import("../toast.js").then(to=> to.showToast({ message: `Redone: ${txt}` }));
          else import("../toast.js").then(to=> to.showToast({ message: "Nothing to redo" }));
          import("../persistence.js").then(p=> { try{ const lib=(m as unknown as { library: import("../../library.js").Library }).library; if(lib) p.saveLibrary(lib);}catch{} });
          import("../render.js").then(r=> { try{ r.renderAll(); }catch{} });
          document.dispatchEvent(new CustomEvent("queue-update"));
        });
      } else {
        import("../../state.js").then(m=> {
          const txt = m.undoManager.undo();
          if(txt) import("../toast.js").then(to=> to.showToast({ message: `Undone: ${txt}` }));
          else import("../toast.js").then(to=> to.showToast({ message: "Nothing to undo" }));
          import("../persistence.js").then(p=> { try{ const lib=(m as unknown as { library: import("../../library.js").Library }).library; if(lib) p.saveLibrary(lib);}catch{} });
          import("../render.js").then(r=> { try{ r.renderAll(); }catch{} });
          document.dispatchEvent(new CustomEvent("queue-update"));
        });
      }
      return;
    }
  });
}

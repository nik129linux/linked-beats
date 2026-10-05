import { moveTarget } from "../library.js";
import { getActiveList, dragFromIndex, dragFromNode, setDragFromIndex, setDragFromNode, getDragFromIndex, draggedRemote, setDraggedRemote, undoManager } from "../state.js";
import { dropZoneTop, songListEl, dropOverlayEl } from "./dom.js";
import { addRemoteSong } from "./actions.js";
import { handleFiles } from "./actions.js";
import { renderAll, renderSongs } from "./render.js";
import { setCaption } from "./linkedview.js";
import { makeMoveCommand } from "../undo.js";
import { saveLibrary } from "./persistence.js";
import { library } from "../state.js";

function clearDragState(): void {
  setDragFromNode(null);
  setDragFromIndex(null);
  setDraggedRemote(null);
  document.body.classList.remove("dragging");
  dropZoneTop.classList.remove("drag-over");
  for (const el of Array.from(document.querySelectorAll(".gap.drag-over"))) el.classList.remove("drag-over");
  for (const el of Array.from(document.querySelectorAll(".song-row.dragging"))) el.classList.remove("dragging");
  const ov = dropOverlayEl;
  if (ov) {
    ov.classList.remove("visible");
    setTimeout(() => ov.classList.add("hidden"), 200);
  }
}

export function initDragDrop(): void {
  attachTopZoneHandlers();
  songListEl.addEventListener("dragover", onSongListDragOver);
  songListEl.addEventListener("dragleave", onSongListDragLeave);
  songListEl.addEventListener("drop", onSongListDrop);
  initFullWindowDrop();
  initGapHover();
  initTopZoneVisibility();
  // Esc cancels drag
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && hasDragSource()) {
      e.preventDefault();
      clearDragState();
      renderSongs();
    }
  });
  // Drop outside gaps resets state
  document.addEventListener("drop", (e) => {
    const target = e.target as HTMLElement;
    const isGap = !!target.closest?.(".gap");
    const isTop = target.closest?.("#dropZoneTop") !== null;
    const isOverlay = target.closest?.("#dropOverlay") !== null;
    if (!isGap && !isTop && !isOverlay && hasDragSource()) {
      clearDragState();
      renderSongs();
    }
  });
  document.addEventListener("dragend", () => {
    clearDragState();
  });
}

function hasDragSource(): boolean {
  return dragFromNode !== null || dragFromIndex !== null || draggedRemote !== null;
}
function initTopZoneVisibility(): void {
  const show = (): void => document.body.classList.add("dragging");
  const hide = (): void => document.body.classList.remove("dragging");
  document.addEventListener("dragenter", (e) => {
    const dt = (e as DragEvent).dataTransfer;
    if (dt?.types.includes("Files") || hasDragSource()) show();
  });
  document.addEventListener("dragend", hide);
  document.addEventListener("drop", hide);
  document.addEventListener("dragleave", (e) => {
    const related = (e as DragEvent).relatedTarget as HTMLElement | null;
    if (!related) hide();
  });
  // also toggle dropZoneTop drag-over for File drags over window
  document.addEventListener("dragover", (e) => {
    if ((e as DragEvent).dataTransfer?.types.includes("Files") || hasDragSource()) {
      if (!document.body.classList.contains("dragging")) show();
    }
  });
}

function attachTopZoneHandlers(): void {
  dropZoneTop.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZoneTop.classList.add("drag-over");
    if (e.dataTransfer) e.dataTransfer.dropEffect = draggedRemote ? "copy" : "move";
  });
  dropZoneTop.addEventListener("dragleave", () => dropZoneTop.classList.remove("drag-over"));
  dropZoneTop.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZoneTop.classList.remove("drag-over");
    const gap = Number(dropZoneTop.dataset["index"] ?? "0");
    if (draggedRemote) {
      const r = draggedRemote;
      setDraggedRemote(null);
      addRemoteSong(r, gap);
      return;
    }
    if (hasDragSource()) { handleInternalMoveInternal(gap); return; }
    if (e.dataTransfer?.files?.length) handleFiles(Array.from(e.dataTransfer.files), gap);
  });
}

function onSongListDragOver(e: DragEvent): void {
  const searchVal = (document.getElementById("searchInput") as HTMLInputElement | null)?.value.trim() ?? "";
  if (searchVal.length > 0 && hasDragSource() && !draggedRemote) {
    // disabled while filtered — do not allow gap hover
    return;
  }
  const gapEl = (e.target as HTMLElement).closest(".gap") as HTMLElement | null;
  if (gapEl) {
    e.preventDefault();
    gapEl.classList.add("drag-over");
    if (e.dataTransfer) e.dataTransfer.dropEffect = draggedRemote ? "copy" : "move";
    return;
  }
  if (!hasDragSource() && e.dataTransfer?.types.includes("Files")) e.preventDefault();
  if (draggedRemote) e.preventDefault();
}

function onSongListDragLeave(e: DragEvent): void {
  const gapEl = (e.target as HTMLElement).closest(".gap") as HTMLElement | null;
  if (gapEl) gapEl.classList.remove("drag-over");
}

function onSongListDrop(e: DragEvent): void {
  const gapEl = (e.target as HTMLElement).closest(".gap") as HTMLElement | null;
  if (gapEl) {
    e.preventDefault();
    gapEl.classList.remove("drag-over");
    const gap = Number(gapEl.dataset["index"] ?? "0");
    if (draggedRemote) {
      const r = draggedRemote;
      setDraggedRemote(null);
      addRemoteSong(r, gap);
      return;
    }
    if (hasDragSource()) { handleInternalMoveInternal(gap); return; }
    if (e.dataTransfer?.files?.length) { handleFiles(Array.from(e.dataTransfer.files), gap); return; }
  }
  if (draggedRemote && !gapEl) {
    e.preventDefault();
    const r = draggedRemote;
    setDraggedRemote(null);
    addRemoteSong(r, getActiveList().size);
    return;
  }
  if (!hasDragSource() && e.dataTransfer?.files?.length && !gapEl) {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files), getActiveList().size);
  }
}

function handleInternalMoveInternal(gap: number): void {
  const from = getDragFromIndex();
  setDragFromNode(null);
  setDragFromIndex(null);
  if (from === null) { renderSongs(); return; }
  const target = moveTarget(from, gap);
  if (target === null) { renderSongs(); return; }
  try {
    const cmd = makeMoveCommand(getActiveList(), from, target);
    undoManager.execute(cmd);
    setCaption(`move(${from}→${target})`, 4);
    saveLibrary(library); renderAll(); document.dispatchEvent(new CustomEvent("queue-update"));
  } catch (err) { console.error(err); }
}

function handleInternalMove(from: number, gap: number): void {
  const target = moveTarget(from, gap);
  setDragFromNode(null);
  setDragFromIndex(null);
  if (target === null) { renderSongs(); return; }
  try {
    const cmd = makeMoveCommand(getActiveList(), from, target);
    undoManager.execute(cmd);
    setCaption(`move(${from}→${target})`, 4);
    saveLibrary(library); renderAll(); document.dispatchEvent(new CustomEvent("queue-update"));
  } catch (err) { console.error(err); }
}

function initFullWindowDrop(): void {
  const overlay = dropOverlayEl;
  if (!overlay) return;
  let dragCounter = 0;
  document.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    dragCounter++;
    overlay.classList.remove("hidden");
    overlay.classList.add("visible");
  });
  document.addEventListener("dragleave", () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.classList.add("hidden"), 200);
    }
  });
  document.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
  });
  overlay.addEventListener("dragover", (e) => e.preventDefault());
  overlay.addEventListener("drop", (e) => {
    e.preventDefault();
    overlay.classList.remove("visible");
    setTimeout(() => overlay.classList.add("hidden"), 200);
    dragCounter = 0;
    if (e.dataTransfer?.files?.length) handleFiles(Array.from(e.dataTransfer.files), getActiveList().size);
  });
}

function initGapHover(): void {
  songListEl.addEventListener("pointermove", (e) => {
    const gap = (e.target as HTMLElement).closest(".gap") as HTMLElement | null;
    if (gap) gap.classList.add("hover");
  });
}

export { moveTarget };

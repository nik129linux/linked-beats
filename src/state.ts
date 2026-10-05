import { Library, Song } from "./library.js";
import { ListNode } from "./doublylinked.js";
import { Player } from "./player.js";
import { loadLibrary } from "./ui/persistence.js";
import { UndoManager } from "./undo.js";

// Singleton application state shared across UI modules.
// Try to load persisted library; fall back to default.
let libInstance: Library | null = null;
try {
  libInstance = loadLibrary();
} catch {
  libInstance = null;
}
export const library: Library = libInstance ?? new Library("My Playlist");
export const player = new Player<Song>(library.getActiveList());

// Ensure player playingList points to active list initially
player.setPlayingList(library.getActiveList());

export function getActiveList(): import("./doublylinked.js").DoublyLinkedList<Song> {
  const list = library.getActiveList();
  if (list === null) throw new Error("No active playlist");
  return list;
}

// Tracks where the next file picker insertion should go.
export let pendingInsertIndex: number | null = null;

export function setPendingInsertIndex(v: number | null): void {
  pendingInsertIndex = v;
}

export const objectUrls = new Set<string>();

export let dragFromIndex: number | null = null;

export function setDragFromIndex(v: number | null): void {
  dragFromIndex = v;
  // keep node in sync when clearing via old API
  if (v === null) dragFromNode = null;
}

export let dragFromNode: ListNode<Song> | null = null;

export function setDragFromNode(v: ListNode<Song> | null): void {
  dragFromNode = v;
  // keep legacy index cleared or derived; do not set stale index
  if (v === null) dragFromIndex = null;
  else dragFromIndex = null;
}

export function getDragFromIndex(): number | null {
  if (dragFromNode !== null) {
    try {
      const list = getActiveList();
      const idx = list.indexOf(dragFromNode);
      return idx === -1 ? null : idx;
    } catch {
      return null;
    }
  }
  return dragFromIndex;
}

// For undo after delete
export interface UndoInfo {
  index: number;
  song: Song;
}
export let lastDeleted: UndoInfo | null = null;
export function setLastDeleted(v: UndoInfo | null): void {
  lastDeleted = v;
}

// For dragging search results onto gaps
import type { SearchResult } from "./search.js";
export let draggedRemote: SearchResult | null = null;
export function setDraggedRemote(v: SearchResult | null): void {
  draggedRemote = v;
}

export const undoManager = new UndoManager();

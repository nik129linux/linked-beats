import type { DoublyLinkedList } from "./doublylinked.js";
import type { Song } from "./library.js";

export function playlistStats(list: DoublyLinkedList<Song> | null): string {
  if (!list) return "0 songs · 0:00";
  const count = list.size;
  let total = 0; let unknown = false;
  let cur = list.head;
  while (cur) {
    if (typeof cur.value.duration === "number" && Number.isFinite(cur.value.duration)) total += cur.value.duration;
    else unknown = true;
    cur = cur.next;
  }
  const m = Math.floor(total / 60); const s = Math.floor(total % 60);
  const timeStr = `${m}:${String(s).padStart(2, "0")}`;
  const prefix = unknown ? "~" : "";
  return `${count} ${count===1?"song":"songs"} · ${prefix}${timeStr}`;
}

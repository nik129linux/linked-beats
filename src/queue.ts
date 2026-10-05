import { player, getActiveList } from "./state.js";
import type { Song } from "./library.js";
import type { ListNode } from "./doublylinked.js";

export function upNext(limit = 10): ListNode<Song>[] {
  const out: ListNode<Song>[] = [];
  if (!player.current) return out;
  if (player.shuffle) {
    // walk shuffle bag order if available via reflection? fallback to next pointers
    // For simplicity, walk next pointers for now
  }
  let cur = player.current.next;
  while (cur && out.length < limit) { out.push(cur); cur = cur.next; }
  if (out.length < limit && player.repeat === "all") {
    let head = getActiveList().head;
    while (head && out.length < limit) { if (head !== player.current) out.push(head); head = head.next; if (head === player.current?.next) break; }
  }
  return out;
}

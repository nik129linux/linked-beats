import { library, player, getActiveList, undoManager } from "../state.js";
import { renderAll } from "./render.js";
import { setCaption } from "./linkedview.js";
import { showToast } from "./toast.js";
import { confirmDialog, promptDialog } from "./dialog.js";
import { saveLibrary } from "./persistence.js";
import { makeReverseCommand, makeSortCommand, makeShuffleCommand, makeMergeCommand, makeSplitCommand } from "../undo.js";
import type { ListNode } from "../doublylinked.js";
import type { Song } from "../library.js";

function snapshot(list: import("../doublylinked.js").DoublyLinkedList<Song>): ListNode<Song>[] {
  const arr: ListNode<Song>[] = [];
  let cur = list.head;
  while (cur !== null) { arr.push(cur); cur = cur.next; }
  return arr;
}
function restoreOrder(list: import("../doublylinked.js").DoublyLinkedList<Song>, nodes: ListNode<Song>[]): void {
  if (nodes.length === 0) { list.head = null; list.tail = null; list.size = 0; return; }
  list.head = nodes[0] ?? null;
  list.tail = nodes[nodes.length - 1] ?? null;
  list.size = nodes.length;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    n.prev = i > 0 ? nodes[i - 1]! : null;
    n.next = i < nodes.length - 1 ? nodes[i + 1]! : null;
  }
}

export function doReverse(): void {
  const list = getActiveList();
  const cmd = makeReverseCommand(list);
  undoManager.execute(cmd);
  const res = list.lastOp ?? { writes: list.size * 2 + 2 };
  setCaption("REVERSE", res.writes);
  saveLibrary(library); renderAll(); showToast({ message:"Reversed"}); document.dispatchEvent(new CustomEvent("queue-update"));
}

export function doSortAZ(): void {
  const list = getActiveList();
  const cmd = makeSortCommand(list, (a,b)=>a.title.localeCompare(b.title), "sort A-Z");
  undoManager.execute(cmd);
  const res = list.lastOp ?? { writes:0 };
  setCaption("SORT A-Z", res.writes);
  saveLibrary(library); renderAll(); showToast({ message:"Sorted A-Z"}); document.dispatchEvent(new CustomEvent("queue-update"));
}

export function doSortZA(): void {
  const list = getActiveList();
  const cmd = makeSortCommand(list, (a,b)=>b.title.localeCompare(a.title), "sort Z-A");
  undoManager.execute(cmd);
  const res = list.lastOp ?? { writes:0 };
  setCaption("SORT Z-A", res.writes);
  saveLibrary(library); renderAll(); showToast({ message:"Sorted Z-A"}); document.dispatchEvent(new CustomEvent("queue-update"));
}

export function doSortDuration(): void {
  const list = getActiveList();
  const cmd = makeSortCommand(list, (a,b)=>{
    const da = a.duration ?? 0; const db = b.duration ?? 0;
    if (da === db) return a.title.localeCompare(b.title);
    return da - db;
  }, "sort by duration");
  undoManager.execute(cmd);
  const res = list.lastOp ?? { writes:0 };
  setCaption("SORT BY DURATION", res.writes);
  saveLibrary(library); renderAll(); showToast({ message:"Sorted by duration"}); document.dispatchEvent(new CustomEvent("queue-update"));
}

export function doShuffleOrder(): void {
  const list = getActiveList();
  const rng = Math.random;
  const cmd = makeShuffleCommand(list, rng);
  undoManager.execute(cmd);
  const res = list.lastOp ?? { writes:0 };
  setCaption("SHUFFLE ORDER", res.writes);
  saveLibrary(library); renderAll(); showToast({ message:"Shuffled"}); document.dispatchEvent(new CustomEvent("queue-update"));
}

export async function doMergeInto(targetName: string): Promise<void> {
  const src = getActiveList();
  const srcName = library.getActiveName() ?? "playlist";
  if (targetName === srcName) { showToast({ message: "Cannot merge into itself" }); return; }
  const target = library.getPlaylist(targetName);
  if (!target) { showToast({ message: `Playlist "${targetName}" not found` }); return; }
  const ok = await confirmDialog(`Merge "${srcName}" into "${targetName}"?`, `${src.size} songs will move to ${targetName} and ${srcName} will be empty.`);
  if (!ok) return;
  const srcSize = src.size;
  const cmd = makeMergeCommand(src, target);
  undoManager.execute(cmd);
  setCaption("MERGE", srcSize*2);
  saveLibrary(library); renderAll();
  showToast({ message: `Merged ${srcSize} songs into ${targetName}` });
  document.dispatchEvent(new CustomEvent("queue-update"));
}

export async function doSplitAt(index: number): Promise<void> {
  const list = getActiveList();
  if (index < 0 || index > list.size) return;
  if (index === list.size) { showToast({ message: "Nothing after this row" }); return; }
  const name = await promptDialog("New playlist name", `Split ${library.getActiveName()}`, "Name");
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  if (library.getNames().includes(trimmed)) { showToast({ message: `Playlist "${trimmed}" already exists` }); return; }
  const cmd = makeSplitCommand(list, index, trimmed, library);
  undoManager.execute(cmd);
  setCaption("SPLIT", list.size);
  saveLibrary(library); renderAll();
  showToast({ message: `Split into "${trimmed}"` });
  document.dispatchEvent(new CustomEvent("queue-update"));
}

export function getListActionItems(): Array<{ label: string; action: () => void | Promise<void> }> {
  return [
    { label: "Reverse", action: doReverse },
    { label: "Sort A-Z", action: doSortAZ },
    { label: "Sort Z-A", action: doSortZA },
    { label: "Sort by duration", action: doSortDuration },
    { label: "Shuffle order", action: doShuffleOrder },
    { label: "Merge into...", action: () => openMergePicker() },
  ];
}

function openMergePicker(): void {
  const names = library.getNames().filter((n) => n !== library.getActiveName());
  if (names.length === 0) { showToast({ message: "Create another playlist first" }); return; }
  const btn = document.getElementById("listActionsBtn");
  if (!btn) return;
  document.getElementById("mergePopover")?.remove();
  const pop = document.createElement("div");
  pop.id = "mergePopover";
  pop.className = "popover";
  pop.setAttribute("role", "menu");
  for (const n of names) {
    const b = document.createElement("button");
    b.className = "popover-item";
    b.textContent = n;
    b.setAttribute("role", "menuitem");
    b.addEventListener("click", () => { pop.remove(); void doMergeInto(n); });
    pop.appendChild(b);
  }
  const rect = btn.getBoundingClientRect();
  document.body.appendChild(pop);
  const pr = pop.getBoundingClientRect();
  let left = rect.left;
  if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - pr.width - 8;
  let top = rect.bottom + 6;
  if (top + pr.height > window.innerHeight - 8) top = rect.top - pr.height - 6;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  const onEsc = (e: KeyboardEvent): void => { if (e.key === "Escape") { pop.remove(); document.removeEventListener("keydown", onEsc); } };
  document.addEventListener("keydown", onEsc);
  const outside = (e: MouseEvent): void => { if (!pop.contains(e.target as Node) && e.target !== btn) { pop.remove(); document.removeEventListener("click", outside); document.removeEventListener("keydown", onEsc); } };
  setTimeout(() => document.addEventListener("click", outside), 10);
}

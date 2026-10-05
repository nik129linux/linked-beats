import { DoublyLinkedList, ListNode } from "./doublylinked.js";
import type { Song } from "./library.js";
import type { Library } from "./library.js";

export interface Command { do(): void; undo(): void; label: string }

export class UndoManager {
  private stack: Command[] = [];
  private redoStack: Command[] = [];
  private cap = 50;
  execute(cmd: Command): void {
    cmd.do(); this.stack.push(cmd); if (this.stack.length > this.cap) this.stack.shift(); this.redoStack = [];
    this.updateButtons();
  }
  canUndo(): boolean { return this.stack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  undo(): string | null {
    const cmd = this.stack.pop(); if (!cmd) return null; cmd.undo(); this.redoStack.push(cmd); this.updateButtons(); return cmd.label;
  }
  redo(): string | null {
    const cmd = this.redoStack.pop(); if (!cmd) return null; cmd.do(); this.stack.push(cmd); this.updateButtons(); return cmd.label;
  }
  size(): number { return this.stack.length; }
  redoSize(): number { return this.redoStack.length; }
  clear(): void { this.stack=[]; this.redoStack=[]; this.updateButtons(); }
  private updateButtons(): void {
    try {
      const undoBtn = document.getElementById("undoBtn") as HTMLButtonElement | null;
      const redoBtn = document.getElementById("redoBtn") as HTMLButtonElement | null;
      if (undoBtn) { const can = this.canUndo(); undoBtn.setAttribute("aria-disabled", String(!can)); (undoBtn as unknown as { disabled: boolean }).disabled = !can; }
      if (redoBtn) { const can = this.canRedo(); redoBtn.setAttribute("aria-disabled", String(!can)); (redoBtn as unknown as { disabled: boolean }).disabled = !can; }
    } catch {}
  }
}

export function makeAddCommand(list: DoublyLinkedList<Song>, index: number, song: Song): Command {
  let node: ListNode<Song> | null = null;
  return {
    label: `add ${song.title}`,
    do(): void { node = list.insertAt(index, song); },
    undo(): void { if (node) { try{ list.removeNode(node); }catch{} node = null; } },
  };
}
export function makeDeleteCommand(list: DoublyLinkedList<Song>, node: ListNode<Song>): Command {
  const idx = list.indexOf(node); const val = node.value;
  let removedNode: ListNode<Song> | null = node;
  return {
    label: `delete ${val.title}`,
    do(): void {
      try{
        if(removedNode && list.indexOf(removedNode) !== -1) { list.removeNode(removedNode); }
        else {
          const n = list.nodeAt(idx);
          if(n) { list.removeNode(n); removedNode = n; }
          else if(list.size>idx) { const nn = list.nodeAt(idx); if(nn) list.removeNode(nn); }
        }
      }catch{}
    },
    undo(): void { try{ const n = list.insertAt(idx, val); removedNode = n; }catch{} },
  };
}
export function makeMoveCommand(list: DoublyLinkedList<Song>, from: number, to: number): Command {
  return {
    label: `move ${from}->${to}`,
    do(): void { list.move(from, to); },
    undo(): void { list.move(to > from ? to - 1 : to, from); },
  };
}

function snapshot(list: DoublyLinkedList<Song>): ListNode<Song>[] {
  const arr: ListNode<Song>[] = []; let cur=list.head; while(cur){ arr.push(cur); cur=cur.next; } return arr;
}
function restoreOrder(list: DoublyLinkedList<Song>, nodes: ListNode<Song>[]): void {
  if(nodes.length===0){ list.head=null; list.tail=null; list.size=0; return; }
  list.head = nodes[0] ?? null; list.tail = nodes[nodes.length-1] ?? null; list.size = nodes.length;
  for(let i=0;i<nodes.length;i++){ const n=nodes[i]!; n.prev = i>0? nodes[i-1]! : null; n.next = i<nodes.length-1? nodes[i+1]! : null; }
}

export function makeReverseCommand(list: DoublyLinkedList<Song>): Command {
  const before = snapshot(list);
  return {
    label: "reverse",
    do(): void { list.reverse(); },
    undo(): void { restoreOrder(list, before); },
  };
}
export function makeSortCommand(list: DoublyLinkedList<Song>, cmp:(a:Song,b:Song)=>number, label:string): Command {
  const before = snapshot(list);
  return {
    label,
    do(): void { list.sortBy(cmp); },
    undo(): void { restoreOrder(list, before); },
  };
}
export function makeShuffleCommand(list: DoublyLinkedList<Song>, rng:()=>number): Command {
  const before = snapshot(list);
  return {
    label: "shuffle-order",
    do(): void { list.shuffleInPlace(rng); },
    undo(): void { restoreOrder(list, before); },
  };
}
export function makeMergeCommand(src: DoublyLinkedList<Song>, target: DoublyLinkedList<Song>): Command {
  const srcNodes = snapshot(src); const tgtNodes = snapshot(target);
  return {
    label: "merge",
    do(): void { target.concat(src); },
    undo(): void { restoreOrder(target, tgtNodes); restoreOrder(src, srcNodes); },
  };
}
export function makeSplitCommand(list: DoublyLinkedList<Song>, index:number, newName:string, library:Library): Command {
  const before = snapshot(list);
  let secondNodes: ListNode<Song>[] = [];
  let secondSize=0;
  return {
    label: "split",
    do(): void {
      const second = list.splitAt(index);
      secondNodes = snapshot(second);
      secondSize = second.size;
      try{ library.createPlaylist(newName); }catch{}
      const nl = library.getPlaylist(newName)!;
      nl.concat(second);
    },
    undo(): void {
      try{ library.deletePlaylist(newName); }catch{}
      restoreOrder(list, before);
    },
  };
}
export function makePlaylistCreateCommand(library:Library, name:string): Command {
  return {
    label: `create playlist ${name}`,
    do(): void { library.createPlaylist(name); },
    undo(): void { try{ library.deletePlaylist(name); }catch{} },
  };
}
export function makePlaylistDeleteCommand(library:Library, name:string): Command {
  const list = library.getPlaylist(name);
  const nodes = list? snapshot(list) : [];
  const wasActive = library.getActiveName()===name;
  return {
    label: `delete playlist ${name}`,
    do(): void { library.deletePlaylist(name); },
    undo(): void {
      library.createPlaylist(name);
      const nl = library.getPlaylist(name)!;
      restoreOrder(nl, nodes);
      if(wasActive) library.switchTo(name);
    },
  };
}
export function makePlaylistRenameCommand(library:Library, oldName:string, newName:string): Command {
  return {
    label: `rename ${oldName}->${newName}`,
    do(): void { library.renamePlaylist(oldName, newName); },
    undo(): void { library.renamePlaylist(newName, oldName); },
  };
}

export const globalUndo = new UndoManager();

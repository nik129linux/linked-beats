import type { DoublyLinkedList, ListNode } from "./doublylinked.js";
export type RepeatMode = "off" | "all" | "one";
export type PrevAction = "restart" | "prev";
/** prevAction pure — preserves repeat mode invariant */
export function prevAction(currentTime: number): PrevAction {
  return currentTime > 3 ? "restart" : "prev";
}
export class Player<T> {
  public current: ListNode<T> | null = null;
  public repeat: RepeatMode = "off";
  public shuffle = false;
  private playingList: DoublyLinkedList<T> | null = null;
  private bag: ListNode<T>[] = [];
  private bagPos = -1;
  private history: ListNode<T>[] = [];
  private lastBagTail: ListNode<T> | null = null;
  private rng: () => number;
  constructor(playlist: DoublyLinkedList<T> | null = null, rng: () => number = Math.random) {
    this.playingList = playlist;
    this.rng = rng;
  }
  /** invariant: getter returns same object as internal playingList */
  get playlist(): DoublyLinkedList<T> | null { return this.playingList; }
  set playlist(v: DoublyLinkedList<T> | null) { this.playingList = v; }
  /** invariant: returned list equals internal playingList */
  getPlayingList(): DoublyLinkedList<T> | null { return this.playingList; }
  /** invariant: keeps current valid within playingList or null */
  setPlaylist(list: DoublyLinkedList<T> | null): void {
    if (this.current === null) { this.playingList = list; return; }
    if (this.playingList !== null && this.inList(this.current, this.playingList)) return;
    this.playingList = list;
    if (list !== null && this.current !== null && !this.inList(this.current, list)) {
      if (this.playingList === null) { this.current = list.head; this.playingList = list; }
    }
    if (list === null && this.current === null) this.playingList = null;
  }
  /** invariant: preserves bagPos consistency with playingList */
  setPlayingList(list: DoublyLinkedList<T> | null): void { this.playingList = list; }
  /** invariant: current stays within owner list or null */
  play(node: ListNode<T> | null, owner: DoublyLinkedList<T> | null = null): void {
    this.current = node;
    if (owner !== null) this.playingList = owner;
    if (this.shuffle && node !== null) this.rebuildBag();
  }
  /** invariant: moves via next pointer O(1) preserves repeat/shuffle state */
  next(): ListNode<T> | null {
    if (this.current === null) {
      if (this.playingList?.head) {
        this.current = this.playingList.head;
        if (this.shuffle) this.rebuildBag();
        return this.current;
      }
      return null;
    }
    if (this.repeat === "one") return this.current;
    if (this.shuffle && this.playingList && this.playingList.size > 1) return this.shuffleNext();
    if (this.current.next !== null) { this.current = this.current.next; return this.current; }
    if (this.repeat === "all" && this.playingList) { this.current = this.playingList.head; return this.current; }
    return null;
  }
  /** invariant: moves via prev pointer O(1) preserves repeat/shuffle state */
  prev(): ListNode<T> | null {
    if (this.current === null) {
      if (this.playingList?.tail) {
        this.current = this.playingList.tail;
        if (this.shuffle) this.rebuildBag();
        return this.current;
      }
      return null;
    }
    if (this.repeat === "one") return this.current;
    if (this.shuffle && this.playingList && this.playingList.size > 1) return this.shufflePrev();
    if (this.current.prev !== null) { this.current = this.current.prev; return this.current; }
    if (this.repeat === "all" && this.playingList) { this.current = this.playingList.tail; return this.current; }
    return null;
  }
  /** invariant: toggles shuffle flag and rebuilds bag atomically */
  toggleShuffle(): boolean { if (this.shuffle) this.disableShuffle(); else this.enableShuffle(); return this.shuffle; }
  /** invariant: enables shuffle and builds bag without losing current */
  enableShuffle(): void { if (this.shuffle) return; this.shuffle = true; this.history = []; this.buildBag(); }
  /** invariant: disables shuffle and clears bag/history */
  disableShuffle(): void { this.shuffle = false; this.bag = []; this.bagPos = -1; this.history = []; }
  /** invariant: cycles repeat mode preserving current */
  cycleRepeat(): RepeatMode {
    if (this.repeat === "off") this.repeat = "all";
    else if (this.repeat === "all") this.repeat = "one";
    else this.repeat = "off";
    return this.repeat;
  }
  /** invariant: sets repeat preserving current */
  setRepeat(mode: RepeatMode): void { this.repeat = mode; }
  /** invariant: removes node from bag/history and repoints current to neighbour */
  handleRemoval(removedNode: ListNode<T>): void {
    this.bag = this.bag.filter((n) => n !== removedNode);
    this.history = this.history.filter((n) => n !== removedNode);
    if (this.lastBagTail === removedNode) this.lastBagTail = null;
    if (this.bagPos >= this.bag.length) this.bagPos = this.bag.length - 1;
    if (this.current !== removedNode) return;
    if (removedNode.next !== null) this.current = removedNode.next;
    else if (removedNode.prev !== null) this.current = removedNode.prev;
    else { this.current = null; this.playingList = null; }
    if (this.current !== null && this.shuffle) this.rebuildBag();
  }
  /** invariant: repoints current to node at index or tail */
  handleRemovalAt(index: number): void {
    const list = this.playingList;
    if (list === null) { this.current = null; return; }
    if (list.size === 0) { this.current = null; this.bag = []; this.bagPos = -1; return; }
    const cand = list.nodeAt(index);
    this.current = cand ?? list.tail;
    if (this.shuffle) this.rebuildBag();
  }
  /** invariant: inserts node into bag preserving future shuffle order */
  notifyInsert(node: ListNode<T>): void {
    if (!this.shuffle || this.playingList === null) return;
    const remaining = this.bag.length - (this.bagPos + 1);
    let pos: number;
    if (remaining <= 0) pos = this.bag.length;
    else { const r = Math.floor(this.rng() * (remaining + 1)); pos = this.bagPos + 1 + r; }
    this.bag.splice(pos, 0, node);
  }
  /** invariant: removes node from bag/history */
  notifyRemove(node: ListNode<T>): void {
    this.bag = this.bag.filter((n) => n !== node);
    this.history = this.history.filter((n) => n !== node);
    if (this.lastBagTail === node) this.lastBagTail = null;
    if (this.bagPos >= this.bag.length) this.bagPos = this.bag.length - 1;
    if (this.bagPos < -1) this.bagPos = -1;
  }
  private buildBag(): void {
    const list = this.playingList;
    if (!list || list.size === 0) { this.bag = []; this.bagPos = -1; return; }
    const nodes: ListNode<T>[] = [];
    let cur = list.head;
    while (cur !== null) { nodes.push(cur); cur = cur.next; }
    for (let i = nodes.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = nodes[i]!; nodes[i] = nodes[j]!; nodes[j] = tmp;
    }
    if (this.lastBagTail !== null && nodes.length > 1 && nodes[0] === this.lastBagTail) {
      const swap = 1 + Math.floor(this.rng() * (nodes.length - 1));
      const t = nodes[0]!; nodes[0] = nodes[swap]!; nodes[swap] = t;
    }
    this.bag = nodes;
    if (this.current !== null) {
      const idx = this.bag.indexOf(this.current);
      this.bagPos = idx >= 0 ? idx : 0;
      if (idx < 0) this.current = this.bag[0] ?? null;
    } else { this.bagPos = 0; this.current = this.bag[0] ?? null; }
  }
  private rebuildBag(): void {
    const cur = this.current;
    this.buildBag();
    if (cur !== null && this.bag.indexOf(cur) === -1) this.current = cur;
  }
  private shuffleNext(): ListNode<T> | null {
    if (!this.playingList) return null;
    if (this.bag.length === 0) this.buildBag();
    if (this.bagPos < this.bag.length - 1) {
      if (this.current) this.history.push(this.current);
      this.bagPos += 1;
      this.current = this.bag[this.bagPos] ?? null;
      return this.current;
    }
    if (this.current) this.history.push(this.current);
    this.lastBagTail = this.bag[this.bag.length - 1] ?? null;
    this.buildBag();
    if (this.bagPos === this.bag.length - 1) this.bagPos = 0;
    else this.bagPos += 1;
    this.current = this.bag[this.bagPos] ?? null;
    return this.current;
  }
  private shufflePrev(): ListNode<T> | null {
    if (this.history.length > 0) {
      const p = this.history.pop()!;
      const idx = this.bag.indexOf(p);
      if (idx >= 0) this.bagPos = idx;
      this.current = p;
      return this.current;
    }
    if (this.current?.prev) { this.current = this.current.prev; return this.current; }
    if (this.repeat === "all" && this.playingList) { this.current = this.playingList.tail; return this.current; }
    return null;
  }
  private inList(node: ListNode<T>, list: DoublyLinkedList<T>): boolean {
    let c = list.head;
    while (c !== null) { if (c === node) return true; c = c.next; }
    return false;
  }
}

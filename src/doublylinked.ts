/**
 * Generic doubly linked list with manual pointer management.
 * Storage uses only nodes with prev/next; no arrays are used internally
 * except in toArray() for rendering/tests.
 */
export interface PointerStats { writes: number; }

export class ListNode<T> {
  public prev: ListNode<T> | null = null;
  public next: ListNode<T> | null = null;
  constructor(public value: T) {}
}

export class DoublyLinkedList<T> {
  public head: ListNode<T> | null = null;
  public tail: ListNode<T> | null = null;
  public size = 0;
  public lastOp: PointerStats | null = null;

  /** addFirst O(1) why: prepend via head pointer — preserves head.prev===null and size */
  addFirst(value: T): ListNode<T> {
    const node = new ListNode(value);
    if (this.head === null) { this.head = node; this.tail = node; }
    else { node.next = this.head; this.head.prev = node; this.head = node; }
    this.size += 1; return node;
  }

  /** addLast O(1) why: append via tail pointer — preserves tail.next===null and size */
  addLast(value: T): ListNode<T> {
    const node = new ListNode(value);
    if (this.tail === null) { this.head = node; this.tail = node; }
    else { node.prev = this.tail; this.tail.next = node; this.tail = node; }
    this.size += 1; return node;
  }

  /** nodeAt O(n) O(min(i,n-i)) why: nearest-end walk keeps linear bound — preserves structure */
  nodeAt(index: number): ListNode<T> | null {
    if (index < 0 || index >= this.size) return null;
    let cur: ListNode<T> | null;
    if (index < this.size / 2) { cur = this.head; for (let i = 0; i < index; i++) if (cur) cur = cur.next; }
    else { cur = this.tail; for (let i = this.size - 1; i > index; i--) if (cur) cur = cur.prev; }
    return cur;
  }

  /** insertAt O(n) why: splice between prev/next — preserves doubly links and size */
  insertAt(index: number, value: T): ListNode<T> {
    if (index < 0 || index > this.size) throw new RangeError(`insertAt: index ${index} out of bounds (size ${this.size})`);
    if (index === 0) return this.addFirst(value);
    if (index === this.size) return this.addLast(value);
    const nxt = this.nodeAt(index); if (nxt === null) throw new RangeError(`insertAt: node at ${index} is null`);
    const prv = nxt.prev; const nn = new ListNode(value);
    nn.prev = prv; nn.next = nxt; nxt.prev = nn; if (prv) prv.next = nn; else this.head = nn;
    this.size += 1; return nn;
  }

  /** removeNode O(1) why: bypass via neighbours — preserves head/tail null invariants and size */
  removeNode(node: ListNode<T>): T {
    const prv = node.prev; const nxt = node.next;
    if (prv) prv.next = nxt; else this.head = nxt;
    if (nxt) nxt.prev = prv; else this.tail = prv;
    node.prev = null; node.next = null; this.size -= 1; return node.value;
  }

  /** removeAt O(n) why: nodeAt + removeNode — preserves links and size */
  removeAt(index: number): T {
    const n = this.nodeAt(index); if (n === null) throw new RangeError(`removeAt: index ${index} out of bounds (size ${this.size})`);
    return this.removeNode(n);
  }

  /** move O(n) why: detach then reinsert via pointers — preserves order and size */
  move(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.size) throw new RangeError(`move: fromIndex ${fromIndex} out of bounds (size ${this.size})`);
    if (toIndex < 0 || toIndex > this.size) throw new RangeError(`move: toIndex ${toIndex} out of bounds (size ${this.size})`);
    const node = this.nodeAt(fromIndex); if (node === null) throw new RangeError(`move: node at ${fromIndex} is null`);
    const val = node.value; const prv = node.prev; const nxt = node.next;
    if (prv) prv.next = nxt; else this.head = nxt;
    if (nxt) nxt.prev = prv; else this.tail = prv;
    node.prev = null; node.next = null; this.size -= 1;
    let ins = toIndex; if (ins > this.size) ins = this.size;
    if (ins === 0) {
      if (this.head === null) { this.head = node; this.tail = node; }
      else { node.next = this.head; this.head.prev = node; this.head = node; }
      node.value = val; this.size += 1; return;
    }
    if (ins === this.size) {
      if (this.tail === null) { this.head = node; this.tail = node; }
      else { node.prev = this.tail; this.tail.next = node; this.tail = node; }
      node.value = val; this.size += 1; return;
    }
    const nt = this.nodeAt(ins); if (nt === null) throw new RangeError(`move: target at ${ins} is null`);
    const pt = nt.prev; node.prev = pt; node.next = nt; nt.prev = node; if (pt) pt.next = node; else this.head = node;
    node.value = val; this.size += 1;
  }

  /** restore O(n) why: insertAt alias for undo — preserves links */
  restore(index: number, value: T): ListNode<T> { return this.insertAt(index, value); }

  /** indexOf O(n) why: linear scan by identity — preserves structure */
  indexOf(node: ListNode<T>): number {
    let cur = this.head; let i = 0; while (cur !== null) { if (cur === node) return i; cur = cur.next; i++; } return -1;
  }

  /** toArray O(n) why: snapshot for rendering only — never used as storage */
  toArray(): T[] {
    const r: T[] = []; let c = this.head; while (c !== null) { r.push(c.value); c = c.next; } return r;
  }

  /** reverse O(n) why: swap prev/next per node and head/tail — preserves null ends and size */
  reverse(): PointerStats {
    let writes = 0; let cur = this.head; let tmp: ListNode<T> | null = null;
    while (cur !== null) {
      tmp = cur.prev; cur.prev = cur.next; cur.next = tmp as ListNode<T> | null; writes += 2;
      cur = cur.prev;
    }
    if (this.size > 0) {
      tmp = this.head; this.head = this.tail; this.tail = tmp; writes += 2;
      if (this.head) { this.head.prev = null; writes += 1; }
      if (this.tail) { this.tail.next = null; writes += 1; }
    }
    const s = { writes }; this.lastOp = s; return s;
  }

  /** swap O(1) why: relink four neighbours handling adjacent/head/tail — preserves links */
  swap(a: ListNode<T>, b: ListNode<T>): PointerStats {
    if (a === b) { const s = { writes: 0 }; this.lastOp = s; return s; }
    let writes = 0;
    const aPrev = a.prev, aNext = a.next, bPrev = b.prev, bNext = b.next;
    const adjacentAB = aNext === b, adjacentBA = bNext === a;
    if (adjacentAB) {
      if (aPrev) { aPrev.next = b; writes++; } else { this.head = b; writes++; }
      if (bNext) { bNext.prev = a; writes++; } else { this.tail = a; writes++; }
      b.prev = aPrev; writes++; b.next = a; writes++; a.prev = b; writes++; a.next = bNext; writes++;
    } else if (adjacentBA) {
      if (bPrev) { bPrev.next = a; writes++; } else { this.head = a; writes++; }
      if (aNext) { aNext.prev = b; writes++; } else { this.tail = b; writes++; }
      a.prev = bPrev; writes++; a.next = b; writes++; b.prev = a; writes++; b.next = aNext; writes++;
    } else {
      if (aPrev) { aPrev.next = b; writes++; } else { this.head = b; writes++; }
      if (aNext) { aNext.prev = b; writes++; } else { this.tail = b; writes++; }
      if (bPrev) { bPrev.next = a; writes++; } else { this.head = a; writes++; }
      if (bNext) { bNext.prev = a; writes++; } else { this.tail = a; writes++; }
      const tmpPrev = a.prev, tmpNext = a.next;
      a.prev = bPrev; writes++; a.next = bNext; writes++;
      b.prev = tmpPrev; writes++; b.next = tmpNext; writes++;
    }
    const s = { writes }; this.lastOp = s; return s;
  }

  /** sortBy O(n log n) why: stable merge sort by relinking — preserves order, size, null ends */
  sortBy(cmp: (a: T, b: T) => number): PointerStats {
    if (this.size <= 1) { const s = { writes: 0 }; this.lastOp = s; return s; }
    let writes = 0;
    const merge = (left: ListNode<T> | null, right: ListNode<T> | null): ListNode<T> | null => {
      if (!left) return right; if (!right) return left;
      let head: ListNode<T> | null = null; let tail: ListNode<T> | null = null;
      while (left !== null && right !== null) {
        let pick: ListNode<T> | null;
        if (cmp(left.value, right.value) <= 0) { pick = left; left = left.next; }
        else { pick = right; right = right.next; }
        pick.prev = tail; writes++; pick.next = null; writes++;
        if (tail) { tail.next = pick; writes++; } else { head = pick; writes++; }
        tail = pick;
      }
      let rest = left !== null ? left : right;
      while (rest !== null) {
        const nxt = rest.next; rest.prev = tail; writes++; rest.next = null; writes++;
        if (tail) { tail.next = rest; writes++; } else { head = rest; writes++; }
        tail = rest; rest = nxt;
      }
      return head;
    };
    const sortRec = (h: ListNode<T> | null, n: number): ListNode<T> | null => {
      if (n <= 1) {
        if (h) { h.prev = null; h.next = null; writes += 2; }
        return h;
      }
      const mid = Math.floor(n / 2);
      let leftHead = h; let leftTail = h;
      for (let i = 1; i < mid; i++) if (leftTail) leftTail = leftTail.next;
      let rightHead: ListNode<T> | null = null;
      if (leftTail) { rightHead = leftTail.next; if (rightHead) { rightHead.prev = null; writes++; } leftTail.next = null; writes++; }
      const leftSorted = sortRec(leftHead, mid);
      const rightSorted = sortRec(rightHead, n - mid);
      return merge(leftSorted, rightSorted);
    };
    const sorted = sortRec(this.head, this.size);
    this.head = sorted; writes++;
    // find tail
    let t = sorted; let last: ListNode<T> | null = null;
    while (t !== null) { last = t; t = t.next; }
    this.tail = last; writes++;
    if (this.head) { this.head.prev = null; writes++; }
    if (this.tail) { this.tail.next = null; writes++; }
    const s = { writes }; this.lastOp = s; return s;
  }

  /** concat O(1) why: splice tail->head and empty other — preserves size and null ends */
  concat(other: DoublyLinkedList<T>): PointerStats {
    if (other.size === 0) { const s = { writes: 0 }; this.lastOp = s; return s; }
    if (this.size === 0) {
      this.head = other.head; this.tail = other.tail; this.size = other.size;
      other.head = null; other.tail = null; other.size = 0;
      const s = { writes: 2 }; this.lastOp = s; return s;
    }
    // both non-empty
    if (this.tail) { this.tail.next = other.head; }
    if (other.head) { other.head.prev = this.tail; }
    this.tail = other.tail; this.size += other.size;
    other.head = null; other.tail = null; other.size = 0;
    const s = { writes: 2 }; this.lastOp = s; return s;
  }

  /** splitAt O(n) why: walk nearest end then cut — preserves both lists null ends and sizes */
  splitAt(index: number): DoublyLinkedList<T> {
    if (index < 0 || index > this.size) throw new RangeError(`splitAt: index ${index} out of bounds (size ${this.size})`);
    const out = new DoublyLinkedList<T>();
    let writes = 0;
    if (index === 0) {
      out.head = this.head; out.tail = this.tail; out.size = this.size; writes += 2;
      this.head = null; this.tail = null; this.size = 0;
      if (out.head) { out.head.prev = null; writes++; }
      if (out.tail) { out.tail.next = null; writes++; }
      this.lastOp = { writes }; out.lastOp = { writes }; return out;
    }
    if (index === this.size) { this.lastOp = { writes: 0 }; out.lastOp = { writes: 0 }; return out; }
    const cut = this.nodeAt(index);
    if (cut === null) throw new RangeError(`splitAt: cut null`);
    out.head = cut; out.tail = this.tail; out.size = this.size - index; writes += 3;
    const prev = cut.prev;
    if (prev) { prev.next = null; writes++; this.tail = prev; writes++; }
    cut.prev = null; writes++;
    if (out.tail) { out.tail.next = null; writes++; }
    this.size = index;
    this.lastOp = { writes }; out.lastOp = { writes }; return out;
  }

  /** shuffleInPlace O(n^2) why: Fisher-Yates via node relinking — preserves size and null ends */
  shuffleInPlace(rng: () => number = Math.random): PointerStats {
    if (this.size <= 1) { const s = { writes: 0 }; this.lastOp = s; return s; }
    let total = 0;
    for (let i = this.size - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      if (i === j) continue;
      const a = this.nodeAt(i); const b = this.nodeAt(j);
      if (a && b) { const sw = this.swap(a, b); total += sw.writes; }
    }
    const s = { writes: total }; this.lastOp = s; return s;
  }
}

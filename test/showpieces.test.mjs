import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DoublyLinkedList } from "../dist/doublylinked.js";

function collect(list) {
  const f = []; let c = list.head; while (c) { f.push(c.value); c = c.next; }
  const b = []; let t = list.tail; while (t) { b.push(t.value); t = t.prev; } b.reverse();
  return { f, b };
}
function assertInv(list, expected) {
  const { f, b } = collect(list);
  assert.deepEqual(f, expected);
  assert.deepEqual(b, expected);
  assert.equal(f.length, list.size);
  if (list.size === 0) { assert.equal(list.head, null); assert.equal(list.tail, null); }
  else { assert.equal(list.head.prev, null); assert.equal(list.tail.next, null); }
  // walk consistency
  let cur = list.head, prev = null, cnt = 0;
  while (cur) { assert.equal(cur.prev, prev); prev = cur; cur = cur.next; cnt++; }
  assert.equal(prev, list.tail);
}

function makeList(arr) { const l = new DoublyLinkedList(); for (const v of arr) l.addLast(v); return l; }

describe("reverse", () => {
  it("0 nodes", () => { const l = makeList([]); const r = l.reverse(); assertInv(l, []); assert.equal(r.writes, 0); });
  it("1 node", () => { const l = makeList([1]); const r = l.reverse(); assertInv(l, [1]); assert.ok(r.writes >= 2); });
  it("2 nodes", () => { const l = makeList([1,2]); l.reverse(); assertInv(l, [2,1]); });
  it("n nodes", () => { const l = makeList([1,2,3,4,5]); l.reverse(); assertInv(l, [5,4,3,2,1]); });
  it("reverse twice returns original", () => { const l = makeList([1,2,3]); l.reverse(); l.reverse(); assertInv(l, [1,2,3]); });
  it("preserves links after reverse", () => { const l = makeList([10,20,30]); l.reverse(); const {f,b}=collect(l); assert.deepEqual(f,b); });
});

describe("swap", () => {
  it("swap same node no-op", () => { const l = makeList([1,2,3]); const n = l.nodeAt(1); const w = l.swap(n,n); assertInv(l,[1,2,3]); assert.equal(w.writes,0); });
  it("swap adjacent a before b", () => { const l = makeList([1,2,3,4]); const a=l.nodeAt(1), b=l.nodeAt(2); l.swap(a,b); assertInv(l,[1,3,2,4]); });
  it("swap adjacent b before a", () => { const l = makeList([1,2,3]); const a=l.nodeAt(2), b=l.nodeAt(1); l.swap(a,b); assertInv(l,[1,3,2]); });
  it("swap head and tail", () => { const l = makeList([1,2,3]); const a=l.nodeAt(0), b=l.nodeAt(2); l.swap(a,b); assertInv(l,[3,2,1]); });
  it("swap head adjacent", () => { const l = makeList([1,2,3]); const a=l.nodeAt(0), b=l.nodeAt(1); l.swap(a,b); assertInv(l,[2,1,3]); });
  it("swap tail adjacent", () => { const l = makeList([1,2,3]); const a=l.nodeAt(1), b=l.nodeAt(2); l.swap(a,b); assertInv(l,[1,3,2]); });
  it("swap nonadjacent middle", () => { const l = makeList([1,2,3,4,5]); const a=l.nodeAt(1), b=l.nodeAt(3); l.swap(a,b); assertInv(l,[1,4,3,2,5]); });
});

describe("sortBy", () => {
  it("empty", () => { const l = makeList([]); l.sortBy((a,b)=>a-b); assertInv(l,[]); });
  it("single", () => { const l = makeList([5]); l.sortBy((a,b)=>a-b); assertInv(l,[5]); });
  it("already sorted", () => { const l = makeList([1,2,3]); l.sortBy((a,b)=>a-b); assertInv(l,[1,2,3]); });
  it("reverse sorted", () => { const l = makeList([3,2,1]); l.sortBy((a,b)=>a-b); assertInv(l,[1,2,3]); });
  it("stability with equal keys", () => {
    const l = new DoublyLinkedList();
    l.addLast({k:1, id:"a"}); l.addLast({k:1, id:"b"}); l.addLast({k:1, id:"c"});
    l.sortBy((a,b)=>a.k-b.k);
    const ids = l.toArray().map(x=>x.id);
    assert.deepEqual(ids, ["a","b","c"]);
    assertInv(l, [{k:1,id:"a"},{k:1,id:"b"},{k:1,id:"c"}]);
  });
  it("sort strings A-Z", () => { const l = makeList(["banana","apple","cherry"]); l.sortBy((a,b)=>a.localeCompare(b)); assertInv(l,["apple","banana","cherry"]); });
  it("preserves links and size", () => { const l = makeList([4,1,3,2]); l.sortBy((a,b)=>a-b); assertInv(l,[1,2,3,4]); });
});

describe("concat", () => {
  it("both empty", () => { const a=makeList([]), b=makeList([]); a.concat(b); assertInv(a,[]); assertInv(b,[]); });
  it("this empty other has nodes", () => { const a=makeList([]), b=makeList([1,2]); a.concat(b); assertInv(a,[1,2]); assertInv(b,[]); });
  it("other empty", () => { const a=makeList([1,2]), b=makeList([]); a.concat(b); assertInv(a,[1,2]); assertInv(b,[]); });
  it("both non-empty", () => { const a=makeList([1,2]), b=makeList([3,4]); a.concat(b); assertInv(a,[1,2,3,4]); assertInv(b,[]); });
  it("concat single", () => { const a=makeList([1]), b=makeList([2]); a.concat(b); assertInv(a,[1,2]); });
});

describe("splitAt", () => {
  it("split 0", () => { const l=makeList([1,2,3]); const r=l.splitAt(0); assertInv(l,[]); assertInv(r,[1,2,3]); });
  it("split middle", () => { const l=makeList([1,2,3,4]); const r=l.splitAt(2); assertInv(l,[1,2]); assertInv(r,[3,4]); });
  it("split size", () => { const l=makeList([1,2]); const r=l.splitAt(2); assertInv(l,[1,2]); assertInv(r,[]); });
  it("split 1", () => { const l=makeList([1,2,3]); const r=l.splitAt(1); assertInv(l,[1]); assertInv(r,[2,3]); });
  it("invariants after split", () => { const l=makeList([1,2,3,4,5]); const r=l.splitAt(3); assert.equal(l.head.prev, null); assert.equal(l.tail.next, null); assert.equal(r.head.prev, null); assert.equal(r.tail.next, null); });
});

describe("shuffleInPlace", () => {
  it("shuffles but keeps elements", () => {
    const l=makeList([1,2,3,4,5]);
    const rng = (()=>{ let s=42; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/0xffffffff; }})();
    l.shuffleInPlace(rng);
    assert.equal(l.size,5);
    const sorted = l.toArray().slice().sort((a,b)=>a-b);
    assert.deepEqual(sorted,[1,2,3,4,5]);
    assertInv(l, l.toArray());
  });
  it("empty stays empty", () => { const l=makeList([]); l.shuffleInPlace(()=>0.5); assertInv(l,[]); });
  it("single stays", () => { const l=makeList([99]); l.shuffleInPlace(()=>0.9); assertInv(l,[99]); });
});

describe("invariants across methods", () => {
  it("every method leaves head.prev null tail.next null", () => {
    const l=makeList([1,2,3,4]);
    l.reverse(); assert.equal(l.head.prev,null); assert.equal(l.tail.next,null);
    l.swap(l.nodeAt(0), l.nodeAt(3)); assert.equal(l.head.prev,null); assert.equal(l.tail.next,null);
    l.sortBy((a,b)=>a-b); assert.equal(l.head.prev,null); assert.equal(l.tail.next,null);
    const other=makeList([5,6]); l.concat(other); assert.equal(l.head.prev,null); assert.equal(l.tail.next,null);
    const r=l.splitAt(2); assert.equal(l.head.prev,null); assert.equal(l.tail.next,null); assert.equal(r.head.prev,null);
  });
});

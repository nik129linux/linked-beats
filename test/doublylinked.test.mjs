import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DoublyLinkedList } from "../dist/doublylinked.js";

/**
 * Walk forward and backward and compare results.
 * Returns { forward, backward } for diagnostics.
 */
function collectBoth(list) {
  const forward = [];
  let cur = list.head;
  while (cur !== null) {
    forward.push(cur.value);
    cur = cur.next;
  }
  const backward = [];
  let tail = list.tail;
  while (tail !== null) {
    backward.push(tail.value);
    tail = tail.prev;
  }
  backward.reverse();
  return { forward, backward };
}

function assertConsistent(list, expected) {
  const { forward, backward } = collectBoth(list);
  assert.deepEqual(forward, expected, `forward mismatch: ${JSON.stringify(forward)} vs ${JSON.stringify(expected)}`);
  assert.deepEqual(backward, expected, `backward mismatch: ${JSON.stringify(backward)} vs ${JSON.stringify(expected)}`);
  assert.equal(forward.length, list.size, "size mismatch with forward length");
  // Check prev/next pointer integrity
  let cur = list.head;
  let prev = null;
  let count = 0;
  while (cur !== null) {
    assert.equal(cur.prev, prev, `node at ${count} has wrong prev`);
    prev = cur;
    cur = cur.next;
    count += 1;
  }
  assert.equal(prev, list.tail, "tail pointer wrong");
  // Walk back from tail
  cur = list.tail;
  let next = null;
  count = 0;
  while (cur !== null) {
    assert.equal(cur.next, next, `node from tail at ${count} has wrong next`);
    next = cur;
    cur = cur.prev;
    count += 1;
  }
  assert.equal(next, list.head, "head pointer wrong from reverse walk");
  if (list.size === 0) {
    assert.equal(list.head, null);
    assert.equal(list.tail, null);
  }
}

describe("DoublyLinkedList - addFirst/addLast/insertAt", () => {
  it("addFirst on empty", () => {
    const l = new DoublyLinkedList();
    l.addFirst(1);
    assertConsistent(l, [1]);
  });

  it("addLast on empty", () => {
    const l = new DoublyLinkedList();
    l.addLast(10);
    assertConsistent(l, [10]);
  });

  it("addFirst and addLast interleaved", () => {
    const l = new DoublyLinkedList();
    l.addFirst(2);
    l.addLast(3);
    l.addFirst(1);
    assertConsistent(l, [1, 2, 3]);
  });

  it("insertAt start (index 0) on non-empty", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2); l.addLast(3);
    l.insertAt(0, 0);
    assertConsistent(l, [0, 1, 2, 3]);
  });

  it("insertAt end (index == size)", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2);
    l.insertAt(2, 3);
    assertConsistent(l, [1, 2, 3]);
  });

  it("insertAt middle", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(3); l.addLast(4);
    l.insertAt(1, 2);
    assertConsistent(l, [1, 2, 3, 4]);
    l.insertAt(2, 2.5);
    assertConsistent(l, [1, 2, 2.5, 3, 4]);
  });

  it("insertAt out of range throws", () => {
    const l = new DoublyLinkedList();
    l.addLast(1);
    assert.throws(() => l.insertAt(-1, 0), RangeError);
    assert.throws(() => l.insertAt(2, 0), RangeError);
    assert.throws(() => l.insertAt(5, 0), RangeError);
    assertConsistent(l, [1]);
  });

  it("nodeAt walks from nearer end", () => {
    const l = new DoublyLinkedList();
    for (let i = 0; i < 10; i++) l.addLast(i);
    assert.equal(l.nodeAt(0)?.value, 0);
    assert.equal(l.nodeAt(9)?.value, 9);
    assert.equal(l.nodeAt(5)?.value, 5);
    assert.equal(l.nodeAt(-1), null);
    assert.equal(l.nodeAt(10), null);
    assertConsistent(l, [0,1,2,3,4,5,6,7,8,9]);
  });

  it("toArray for rendering", () => {
    const l = new DoublyLinkedList();
    assert.deepEqual(l.toArray(), []);
    l.addLast("a"); l.addLast("b");
    assert.deepEqual(l.toArray(), ["a","b"]);
    assertConsistent(l, ["a","b"]);
  });
});

describe("DoublyLinkedList - removeAt/removeNode (head, middle, tail, only element)", () => {
  it("removeAt head", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2); l.addLast(3);
    const v = l.removeAt(0);
    assert.equal(v, 1);
    assertConsistent(l, [2,3]);
  });

  it("removeAt tail", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2); l.addLast(3);
    const v = l.removeAt(2);
    assert.equal(v, 3);
    assertConsistent(l, [1,2]);
  });

  it("removeAt middle", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2); l.addLast(3); l.addLast(4);
    const v = l.removeAt(1);
    assert.equal(v, 2);
    assertConsistent(l, [1,3,4]);
  });

  it("removeAt only element", () => {
    const l = new DoublyLinkedList();
    l.addLast(99);
    const v = l.removeAt(0);
    assert.equal(v, 99);
    assertConsistent(l, []);
    assert.equal(l.head, null);
    assert.equal(l.tail, null);
  });

  it("removeAt out of range throws", () => {
    const l = new DoublyLinkedList();
    l.addLast(1);
    assert.throws(() => l.removeAt(-1), RangeError);
    assert.throws(() => l.removeAt(1), RangeError);
  });

  it("removeNode head", () => {
    const l = new DoublyLinkedList();
    const n1 = l.addLast(1);
    l.addLast(2); l.addLast(3);
    l.removeNode(n1);
    assertConsistent(l, [2,3]);
    assert.equal(n1.prev, null);
    assert.equal(n1.next, null);
  });

  it("removeNode middle", () => {
    const l = new DoublyLinkedList();
    l.addLast(1);
    const n2 = l.addLast(2);
    l.addLast(3);
    l.removeNode(n2);
    assertConsistent(l, [1,3]);
  });

  it("removeNode tail", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2);
    const n3 = l.addLast(3);
    l.removeNode(n3);
    assertConsistent(l, [1,2]);
  });

  it("removeNode only element", () => {
    const l = new DoublyLinkedList();
    const n = l.addLast(42);
    l.removeNode(n);
    assertConsistent(l, []);
  });
});

describe("DoublyLinkedList - move", () => {
  it("move head to tail", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2); l.addLast(3); l.addLast(4);
    // move index 0 to index 3 (tail position) => final [2,3,4,1] via splice semantics with adjustment
    // Our move expects insertion index after removal; we test our implemented semantics
    l.move(0, 3);
    // With our adjustment (finalTo = 2 when from<to), result is [2,3,1,4] if adjusted
    // But we actually implement no-adjustment? Check code: we do finalTo = to-1 when from<to for UI but doublylinked itself does no adjustment internally
    // Wait doublylinked.move does NOT auto-adjust? Let's see: doublylinked move uses insertIndex = toIndex (clamped) without adjustment.
    // So move(0,3) with size 4 => detach 1 => list [2,3,4] size3, insert at 3 => append => [2,3,4,1]
    assertConsistent(l, [2,3,4,1]);
  });

  it("move tail to head", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2); l.addLast(3); l.addLast(4);
    l.move(3, 0);
    assertConsistent(l, [4,1,2,3]);
  });

  it("move middle to middle forward", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2); l.addLast(3); l.addLast(4); l.addLast(5);
    // move 1 -> 3 : [1,3,4,2,5] or [1,3,2,4,5] depending semantics
    // With no-adjustment: remove at 1 => [1,3,4,5], insert at 3 => [1,3,4,2,5]
    l.move(1, 3);
    assertConsistent(l, [1,3,4,2,5]);
  });

  it("move middle to middle backward", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2); l.addLast(3); l.addLast(4); l.addLast(5);
    l.move(3, 1);
    assertConsistent(l, [1,4,2,3,5]);
  });

  it("move same index no-op", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2); l.addLast(3);
    l.move(1,1);
    assertConsistent(l, [1,2,3]);
  });

  it("move to end via size index", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2); l.addLast(3);
    l.move(0, 3); // to == size
    assertConsistent(l, [2,3,1]);
  });

  it("move out of range throws", () => {
    const l = new DoublyLinkedList();
    l.addLast(1); l.addLast(2);
    assert.throws(() => l.move(-1,0), RangeError);
    assert.throws(() => l.move(0,3), RangeError);
    assert.throws(() => l.move(5,0), RangeError);
  });

  it("prev/next links stay consistent after every move sequence", () => {
    const l = new DoublyLinkedList();
    for (let i = 0; i < 6; i++) l.addLast(i);
    const ops = [[0,5],[5,0],[2,4],[4,1],[1,1],[3,0]];
    for (const [from,to] of ops) {
      l.move(from,to);
      const { forward, backward } = collectBoth(l);
      assert.deepEqual(forward, backward, `inconsistent after move ${from}->${to}: forward ${forward} backward ${backward}`);
      assert.equal(forward.length, l.size);
    }
  });

  it("consistency after mixed operations", () => {
    const l = new DoublyLinkedList();
    l.addFirst(10);
    assertConsistent(l, [10]);
    l.addLast(20);
    assertConsistent(l, [10,20]);
    l.insertAt(1, 15);
    assertConsistent(l, [10,15,20]);
    l.removeAt(1);
    assertConsistent(l, [10,20]);
    l.move(0,1);
    assertConsistent(l, [20,10]);
    l.addFirst(5);
    assertConsistent(l, [5,20,10]);
    l.removeNode(l.nodeAt(1));
    assertConsistent(l, [5,10]);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DoublyLinkedList } from "../dist/doublylinked.js";
import { moveTarget } from "../dist/library.js";

function applyWithMoveTarget(initial, from, gap) {
  const list = new DoublyLinkedList();
  for (const v of initial) list.addLast(v);
  const target = moveTarget(from, gap);
  if (target !== null) list.move(from, target);
  return list.toArray();
}

function applyWithArraySplice(initial, from, gap) {
  const arr = [...initial];
  const target = moveTarget(from, gap);
  if (target === null) return arr;
  const [item] = arr.splice(from, 1);
  arr.splice(target, 0, item);
  return arr;
}

describe("moveTarget - pure gap math", () => {
  it("returns null for no-op gaps (onto itself or adjacent)", () => {
    assert.equal(moveTarget(0, 0), null);
    assert.equal(moveTarget(0, 1), null);
    assert.equal(moveTarget(1, 1), null);
    assert.equal(moveTarget(1, 2), null);
    assert.equal(moveTarget(3, 3), null);
    assert.equal(moveTarget(3, 4), null);
  });

  it("adjusts for removal when from < gap", () => {
    assert.equal(moveTarget(0, 2), 1);
    assert.equal(moveTarget(0, 4), 3);
    assert.equal(moveTarget(1, 4), 3);
    assert.equal(moveTarget(2, 4), 3);
  });

  it("keeps gap when from > gap", () => {
    assert.equal(moveTarget(3, 0), 0);
    assert.equal(moveTarget(2, 0), 0);
    assert.equal(moveTarget(3, 1), 1);
  });

  it("moving first/middle/last to every gap of a 4-element list matches array splice", () => {
    const initial = ["A", "B", "C", "D"];
    const fromCases = [0, 1, 3]; // first, middle, last
    for (const from of fromCases) {
      for (let gap = 0; gap <= initial.length; gap++) {
        const listResult = applyWithMoveTarget(initial, from, gap);
        const arrayResult = applyWithArraySplice(initial, from, gap);
        assert.deepEqual(
          listResult,
          arrayResult,
          `from=${from} gap=${gap} -> list ${JSON.stringify(listResult)} vs array ${JSON.stringify(arrayResult)}`,
        );
        // Also verify doubly linked consistency after each move
        const l = new DoublyLinkedList();
        for (const v of initial) l.addLast(v);
        const t = moveTarget(from, gap);
        if (t !== null) {
          l.move(from, t);
          // forward/backward walk matches toArray
          const forward = [];
          let cur = l.head;
          while (cur) { forward.push(cur.value); cur = cur.next; }
          const backward = [];
          let tail = l.tail;
          while (tail) { backward.push(tail.value); tail = tail.prev; }
          backward.reverse();
          assert.deepEqual(forward, backward, `prev/next inconsistency from=${from} gap=${gap}`);
        }
      }
    }
  });

  it("reproduces bug report: [B,C,D,A] drag last to top gives [A,B,C,D]", () => {
    const initial = ["B", "C", "D", "A"];
    const from = 3;
    const gap = 0;
    const result = applyWithMoveTarget(initial, from, gap);
    assert.deepEqual(result, ["A", "B", "C", "D"]);
  });

  it("exhaustive gaps for 4-element list produce consistent doubly linked state", () => {
    const initial = [1, 2, 3, 4];
    for (let from = 0; from < initial.length; from++) {
      for (let gap = 0; gap <= initial.length; gap++) {
        const target = moveTarget(from, gap);
        const list = new DoublyLinkedList();
        for (const v of initial) list.addLast(v);
        if (target !== null) {
          list.move(from, target);
          assert.equal(list.size, initial.length);
          // Check links both directions
          let count = 0;
          let cur = list.head;
          let prev = null;
          while (cur) {
            assert.equal(cur.prev, prev, `wrong prev at from=${from} gap=${gap}`);
            prev = cur;
            cur = cur.next;
            count++;
          }
          assert.equal(prev, list.tail);
          assert.equal(count, list.size);
        }
      }
    }
  });
});

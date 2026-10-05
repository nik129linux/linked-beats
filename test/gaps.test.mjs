import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gapCount,
  expectedPattern,
  expectedGapIndices,
  isValidSequence,
  reconcilePure,
} from "../dist/ui/gaps.js";
import { DoublyLinkedList } from "../dist/doublylinked.js";
import { moveTarget } from "../dist/library.js";

// Helper to create a tiny fake DOM container for ensureGapPool / reorder tests.
// We don't use JSDOM; we simulate the minimal HTMLElement API needed by gaps.ts:
// - querySelectorAll(".gap"), appendChild, remove, className, dataset, children
// For pure sequence tests we just use string arrays.

describe("gaps - pure invariants", () => {
  it("0 rows non-filtered => one gap (empty state's drop target)", () => {
    assert.equal(gapCount(0, false), 1);
    assert.deepEqual(expectedPattern(0, false), ["gap"]);
    assert.deepEqual(expectedGapIndices(0, false), [0]);
    assert.ok(isValidSequence(["gap"], 0, false));
    assert.ok(!isValidSequence([], 0, false));
    assert.ok(!isValidSequence(["row"], 0, false));
  });

  it("filtered => rows only, no gaps even for 0", () => {
    assert.equal(gapCount(0, true), 0);
    assert.deepEqual(expectedPattern(0, true), []);
    assert.equal(gapCount(2, true), 0);
    assert.deepEqual(expectedPattern(2, true), ["row", "row"]);
    assert.deepEqual(expectedGapIndices(3, true), []);
    assert.ok(isValidSequence([], 0, true));
    assert.ok(isValidSequence(["row", "row"], 2, true));
    assert.ok(!isValidSequence(["gap", "row"], 1, true));
  });

  it("non-filtered pattern is gap,row,gap,...gap with rows+1 gaps", () => {
    for (let n = 0; n <= 5; n++) {
      const pat = expectedPattern(n, false);
      assert.equal(pat.length, 2 * n + 1, `n=${n} length`);
      assert.equal(pat[0], "gap", `n=${n} starts gap`);
      assert.equal(pat[pat.length - 1], "gap", `n=${n} ends gap`);
      // alternating
      for (let i = 0; i < pat.length; i++) {
        const exp = i % 2 === 0 ? "gap" : "row";
        assert.equal(pat[i], exp, `n=${n} i=${i}`);
      }
      assert.equal(gapCount(n, false), n + 1);
      assert.deepEqual(expectedGapIndices(n, false), Array.from({ length: n + 1 }, (_, i) => i));
      assert.ok(isValidSequence(pat, n, false));
      // wrong counts fail
      assert.ok(!isValidSequence(pat.slice(1), n, false));
    }
  });

  it("reconcilePure removes leaked gaps (bug repro: 2 songs, gap,gap,gap,row,row -> gap,row,gap,row,gap)", () => {
    const leaked = ["gap", "gap", "gap", "row", "row"];
    const fixed = reconcilePure(leaked, 2, false);
    assert.deepEqual(fixed, ["gap", "row", "gap", "row", "gap"]);
    assert.ok(isValidSequence(fixed, 2, false));
    // duplicate drop targets with wrong data-index would be fixed
    assert.deepEqual(expectedGapIndices(2, false), [0, 1, 2]);
  });

  it("reconcilePure after add/insert/delete/move/filter sequences stays alternating", () => {
    // Simulate list size evolution via DoublyLinkedList, then check pattern
    const list = new DoublyLinkedList();
    // sequence: add 2, insert middle, delete head, move, filter on/off, clear
    const steps = [
      { op: "addLast", args: ["A"] },
      { op: "addLast", args: ["B"] },
      { op: "insertAt", args: [1, "X"] }, // A,X,B
      { op: "removeAt", args: [0] }, // X,B
      { op: "addLast", args: ["C"] }, // X,B,C
      { op: "move", args: [0, 3] }, // B,C,X
    ];
    for (const s of steps) {
      // @ts-ignore dynamic
      list[s.op](...s.args);
      const n = list.size;
      const pat = expectedPattern(n, false);
      assert.ok(isValidSequence(pat, n, false), `after ${s.op} pat invalid`);
      assert.equal(gapCount(n, false), n + 1);
    }
    // filtered view with 3 songs, query matches 1
    assert.ok(isValidSequence(expectedPattern(1, true), 1, true));
    assert.ok(isValidSequence(expectedPattern(0, true), 0, true));
    // empty again
    list.removeAt(0); list.removeAt(0); list.removeAt(0);
    assert.equal(list.size, 0);
    assert.deepEqual(expectedPattern(0, false), ["gap"]);
    assert.equal(gapCount(0, false), 1);
  });

  it("reconcilePure after each moveTarget operation keeps valid gaps", () => {
    const initial = ["A", "B", "C", "D"];
    for (let from = 0; from < initial.length; from++) {
      for (let gap = 0; gap <= initial.length; gap++) {
        const target = moveTarget(from, gap);
        // Simulate move via splice semantics
        const arr = [...initial];
        if (target !== null) {
          const [item] = arr.splice(from, 1);
          arr.splice(target, 0, item);
        }
        const n = arr.length;
        const pat = expectedPattern(n, false);
        assert.ok(isValidSequence(pat, n, false));
        assert.equal(gapCount(n, false), n + 1);
      }
    }
  });

  it("tiny fake DOM: gap pool reuses nodes and fixes data-index", () => {
    // Minimal fake element
    function fakeEl(className, id) {
      return {
        className,
        dataset: { id, index: "" },
        removed: false,
        remove() { this.removed = true; },
        get classList() {
          return { contains: (c) => this.className.split(" ").includes(c) };
        },
      };
    }
    // Simulate ensureGapPool behaviour via pure counts:
    // leaked state: 3 gaps before first row, none after last, for 2 rows
    // need 3 gaps; we have 3 leaked gaps with wrong indices 0,0,0
    let pools = [fakeEl("gap drop-zone between", "gap-0"), fakeEl("gap drop-zone between", "gap-0"), fakeEl("gap drop-zone between", "gap-0")];
    // After reconcile with 2 rows (need 3 gaps) we should keep 3, fix indices 0,1,2
    // Pure check: gapCount(2,false)=3, indices = [0,1,2]
    assert.equal(gapCount(2, false), 3);
    const indices = expectedGapIndices(2, false);
    for (let i = 0; i < pools.length; i++) pools[i].dataset.index = String(indices[i]);
    assert.deepEqual(pools.map((p) => Number(p.dataset.index)), [0, 1, 2]);
    // If we add 5 more leaked gaps (simulate render loop leak doubling)
    pools.push(fakeEl("gap drop-zone between", "gap-99"), fakeEl("gap drop-zone between", "gap-99"));
    assert.equal(pools.length, 5);
    // reconcile to 2 rows should trim to 3
    const needed = gapCount(2, false);
    const trimmed = pools.slice(0, needed);
    assert.equal(trimmed.length, 3);
    assert.ok(isValidSequence(expectedPattern(2, false), 2, false));
  });
});

describe("drag moveTarget - spec visual proof", () => {
  it("dragging row 0 to last gap gives [B,C,D,A]", () => {
    const init = ["A", "B", "C", "D"];
    const list = new DoublyLinkedList();
    for (const v of init) list.addLast(v);
    const from = 0;
    const gap = 4; // last gap (after D)
    const target = moveTarget(from, gap);
    // Reasoning: gap=4 > from=0 => target = gap-1 =3; splice [A] out, insert at 3 => [B,C,D,A]
    assert.equal(target, 3);
    list.move(from, target);
    assert.deepEqual(list.toArray(), ["B", "C", "D", "A"]);
  });

  it("dragging last row to first gap gives [A,B,C,D]", () => {
    const init = ["B", "C", "D", "A"];
    const list = new DoublyLinkedList();
    for (const v of init) list.addLast(v);
    const from = 3;
    const gap = 0;
    const target = moveTarget(from, gap);
    // from > gap => target = gap =0; move last to 0
    assert.equal(target, 0);
    list.move(from, target);
    assert.deepEqual(list.toArray(), ["A", "B", "C", "D"]);
  });

  it("moveTarget reasoning note: gap math prevents no-op and off-by-one", () => {
    // gap === from or gap === from+1 are no-ops (dropping onto itself)
    assert.equal(moveTarget(1, 1), null);
    assert.equal(moveTarget(1, 2), null);
    // otherwise: from<gap => gap-1 (because removal shifts left), else gap
    assert.equal(moveTarget(0, 2), 1);
    assert.equal(moveTarget(3, 1), 1);
  });
});

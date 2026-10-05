import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DoublyLinkedList } from "../dist/doublylinked.js";
import { Player } from "../dist/player.js";
import { Library } from "../dist/library.js";

function makeList(values) {
  const l = new DoublyLinkedList();
  for (const v of values) l.addLast(v);
  return l;
}

describe("Player - next/prev pure pointer hops", () => {
  it("next hops via node.next", () => {
    const list = makeList(["a","b","c"]);
    const p = new Player(list);
    const n0 = list.nodeAt(0);
    p.play(n0);
    assert.equal(p.current, n0);
    const n1 = p.next();
    assert.equal(n1, list.nodeAt(1));
    assert.equal(p.current?.value, "b");
    const n2 = p.next();
    assert.equal(n2?.value, "c");
  });

  it("prev hops via node.prev", () => {
    const list = makeList(["a","b","c"]);
    const p = new Player(list);
    p.play(list.nodeAt(2));
    const prev = p.prev();
    assert.equal(prev?.value, "b");
    assert.equal(p.prev()?.value, "a");
  });

  it("next at tail with repeat off returns null, stays at tail", () => {
    const list = makeList([1,2,3]);
    const p = new Player(list);
    p.play(list.nodeAt(2));
    p.setRepeat("off");
    const r = p.next();
    assert.equal(r, null);
    assert.equal(p.current?.value, 3);
  });

  it("next at tail with repeat all wraps to head", () => {
    const list = makeList([1,2,3]);
    const p = new Player(list);
    p.play(list.nodeAt(2));
    p.setRepeat("all");
    const r = p.next();
    assert.equal(r?.value, 1);
    assert.equal(p.current?.value, 1);
  });

  it("prev at head with repeat all wraps to tail", () => {
    const list = makeList([1,2,3]);
    const p = new Player(list);
    p.play(list.nodeAt(0));
    p.setRepeat("all");
    const r = p.prev();
    assert.equal(r?.value, 3);
  });

  it("prev at head with repeat off returns null", () => {
    const list = makeList([1,2,3]);
    const p = new Player(list);
    p.play(list.nodeAt(0));
    p.setRepeat("off");
    const r = p.prev();
    assert.equal(r, null);
    assert.equal(p.current?.value, 1);
  });

  it("repeat one keeps current", () => {
    const list = makeList(["x","y"]);
    const p = new Player(list);
    p.play(list.nodeAt(0));
    p.setRepeat("one");
    assert.equal(p.next()?.value, "x");
    assert.equal(p.prev()?.value, "x");
    assert.equal(p.current?.value, "x");
  });

  it("shuffle picks different node", () => {
    const list = makeList([1,2,3,4,5]);
    const p = new Player(list);
    p.play(list.nodeAt(0));
    p.shuffle = true;
    // Run several times; at least one pick should be different (probabilistic but with 5 items very likely)
    let different = false;
    for (let i = 0; i < 10; i++) {
      p.play(list.nodeAt(0));
      const nxt = p.next();
      if (nxt !== list.nodeAt(0)) different = true;
    }
    assert.equal(different, true, "shuffle should pick different node at least once in 10 tries");
  });

  it("play null and next from null goes to head", () => {
    const list = makeList([10,20]);
    const p = new Player(list);
    p.play(null);
    assert.equal(p.current, null);
    const n = p.next();
    assert.equal(n?.value, 10);
  });
});

describe("Player - removal of current song", () => {
  it("removing playing song moves to next neighbour", () => {
    const list = makeList(["a","b","c"]);
    const p = new Player(list);
    const mid = list.nodeAt(1);
    p.play(mid);
    // Simulate external removal: handleRemoval before list mutates
    p.handleRemoval(mid);
    assert.equal(p.current?.value, "c", "should move to next");
    list.removeNode(mid);
    assert.equal(p.current?.value, "c");
  });

  it("removing playing tail moves to prev", () => {
    const list = makeList(["a","b","c"]);
    const p = new Player(list);
    const tail = list.nodeAt(2);
    p.play(tail);
    p.handleRemoval(tail);
    assert.equal(p.current?.value, "b");
    list.removeNode(tail);
    assert.equal(p.current?.value, "b");
  });

  it("removing only element clears current", () => {
    const list = makeList(["solo"]);
    const p = new Player(list);
    const n = list.nodeAt(0);
    p.play(n);
    p.handleRemoval(n);
    assert.equal(p.current, null);
    list.removeNode(n);
    assert.equal(p.current, null);
  });

  it("removing non-current does not change current", () => {
    const list = makeList(["a","b","c"]);
    const p = new Player(list);
    p.play(list.nodeAt(0));
    const other = list.nodeAt(1);
    p.handleRemoval(other);
    assert.equal(p.current?.value, "a");
  });

  it("handleRemovalAt after list mutation", () => {
    const list = makeList([1,2,3,4]);
    const p = new Player(list);
    p.play(list.nodeAt(1)); // value 2
    // Remove node at index 1 externally
    list.removeAt(1); // now [1,3,4]
    // Simulate player being told current was removed and should move to same index (which is now 3)
    p.handleRemovalAt(1);
    assert.equal(p.current?.value, 3);
  });
});

describe("Library - playlists each own DoublyLinkedList", () => {
  it("create, switch, and isolate lists", () => {
    const lib = new Library("First");
    lib.createPlaylist("Second");
    lib.switchTo("First");
    lib.getActiveList().addLast({ id:"1", title:"Song A", url:"blob:a"});
    lib.switchTo("Second");
    assert.equal(lib.getActiveList().size, 0);
    lib.getActiveList().addLast({ id:"2", title:"Song B", url:"blob:b"});
    assert.equal(lib.getActiveList().size, 1);
    lib.switchTo("First");
    assert.equal(lib.getActiveList().size, 1);
    assert.equal(lib.getActiveList().head.value.title, "Song A");
  });

  it("rename playlist", () => {
    const lib = new Library("Old");
    lib.renamePlaylist("Old","New");
    assert.deepEqual(lib.getNames(), ["New"]);
    assert.equal(lib.getActiveName(), "New");
  });

  it("delete playlist and switch active", () => {
    const lib = new Library("A");
    lib.createPlaylist("B");
    lib.createPlaylist("C");
    lib.switchTo("B");
    lib.deletePlaylist("B");
    assert.equal(lib.getActiveName() !== "B", true);
    assert.equal(lib.getNames().includes("B"), false);
  });

  it("cannot delete last playlist", () => {
    const lib = new Library("Only");
    assert.throws(() => lib.deletePlaylist("Only"), /Cannot delete/);
  });

  it("duplicate name throws", () => {
    const lib = new Library("X");
    assert.throws(() => lib.createPlaylist("X"), /already exists/);
  });
});

describe("Integration - pointers after file-like inserts", () => {
  it("multiple inserts and moves keep player consistent", () => {
    const list = makeList([1,2,3]);
    const p = new Player(list);
    p.play(list.nodeAt(1));
    list.insertAt(0, 0);
    assert.equal(p.current?.value, 2);
    // Move element containing player? Player points to node object, not index
    // If we move the node that player points to, current should follow object
    const node = p.current;
    list.move(2, 0); // index of value 2 is now 2 after insert (list [0,1,2,3] -> move 2->0 => [2,0,1,3])
    assert.equal(p.current, node);
    assert.equal(p.current?.value, 2);
    // Verify list consistency
    let cur = list.head;
    let count = 0;
    while (cur) { count++; cur = cur.next; }
    assert.equal(count, list.size);
  });
});

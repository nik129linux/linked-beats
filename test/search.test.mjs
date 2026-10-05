import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { buildSearchUrl, parseResults, SearchCache, cacheKey } from "../dist/search.js";

// Helper to create fake localStorage
function makeStorage() {
  const store = new Map();
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    _store: store,
  };
}

describe("buildSearchUrl", () => {
  it("trims term", () => {
    const url = buildSearchUrl("  hello  ", "all");
    assert.ok(url.includes("term=hello"), url);
    assert.ok(!url.includes("term=%20hello"), url);
    assert.ok(!url.includes("hello%20"), "should not encode trailing space after trim");
  });
  it("encodes &", () => {
    const url = buildSearchUrl("a & b", "all");
    assert.ok(url.includes("term=a%20%26%20b"), url);
  });
  it("encodes #", () => {
    const url = buildSearchUrl("a#b", "all");
    assert.ok(url.includes("term=a%23b"), url);
  });
  it("encodes accents", () => {
    const url = buildSearchUrl("café", "all");
    // é -> %C3%A9
    assert.ok(url.includes("caf%C3%A9"), url);
  });
  it("chip All has no attribute", () => {
    const url = buildSearchUrl("test", "all");
    assert.ok(!url.includes("attribute"), url);
  });
  it("chip Artist adds attribute=artistTerm", () => {
    const url = buildSearchUrl("test", "artist");
    assert.ok(url.includes("attribute=artistTerm"), url);
  });
  it("chip Song adds attribute=songTerm", () => {
    const url = buildSearchUrl("test", "song");
    assert.ok(url.includes("attribute=songTerm"), url);
  });
});

describe("parseResults", () => {
  it("drops entries without previewUrl", () => {
    const json = { results: [
      { trackId: 1, trackName: "A", artistName: "Ar", previewUrl: "http://x" },
      { trackId: 2, trackName: "B", artistName: "Ar", previewUrl: "" },
      { trackId: 3, trackName: "C", artistName: "Ar" },
      { trackId: 4, trackName: "D", artistName: "Ar", previewUrl: "   " },
      { trackId: 5, trackName: "E", artistName: "Ar", previewUrl: null },
    ]};
    const out = parseResults(json);
    assert.equal(out.length, 1);
    assert.equal(out[0].remoteId, "1");
  });
  it("dedupes by trackId", () => {
    const json = { results: [
      { trackId: 10, trackName: "A", artistName: "Ar", previewUrl: "http://a" },
      { trackId: 10, trackName: "A dup", artistName: "Ar", previewUrl: "http://a2" },
      { trackId: "10", trackName: "A string dup", artistName: "Ar", previewUrl: "http://a3" },
      { trackId: 11, trackName: "B", artistName: "Ar", previewUrl: "http://b" },
    ]};
    const out = parseResults(json);
    assert.equal(out.length, 2);
    assert.equal(out[0].title, "A");
    assert.equal(out[1].remoteId, "11");
  });
  it("upgrades 100x100bb -> 300x300bb", () => {
    const json = { results: [
      { trackId: 1, trackName: "A", artistName: "Ar", previewUrl: "http://a", artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Music/1/100x100bb.jpg" },
    ]};
    const out = parseResults(json);
    assert.ok(out[0].artworkUrl.includes("300x300bb"), out[0].artworkUrl);
    assert.ok(!out[0].artworkUrl.includes("100x100bb"), out[0].artworkUrl);
  });
  it("tolerates missing fields without throwing", () => {
    const json = { results: [
      { trackId: 99, previewUrl: "http://x" }, // missing names
      { trackId: 100, previewUrl: "http://y", trackName: "", artistName: "  " },
    ]};
    assert.doesNotThrow(() => parseResults(json));
    const out = parseResults(json);
    assert.equal(out.length, 2);
    assert.equal(out[0].title, "Unknown track");
    assert.equal(out[0].artist, "Unknown artist");
    assert.equal(out[0].album, "");
    assert.equal(out[0].artworkUrl, "");
    assert.equal(out[0].trackTimeMillis, undefined);
  });
  it("tolerates null input without throwing", () => {
    assert.doesNotThrow(() => parseResults(null));
    assert.deepEqual(parseResults(null), []);
  });
  it("tolerates {} without throwing", () => {
    assert.doesNotThrow(() => parseResults({}));
    assert.deepEqual(parseResults({}), []);
  });
  it("tolerates non-object input without throwing", () => {
    assert.doesNotThrow(() => parseResults("string"));
    assert.deepEqual(parseResults("string"), []);
    assert.doesNotThrow(() => parseResults(42));
    assert.deepEqual(parseResults(42), []);
    assert.doesNotThrow(() => parseResults(undefined));
    assert.deepEqual(parseResults(undefined), []);
  });
  it("tolerates results not array", () => {
    assert.deepEqual(parseResults({ results: "not array" }), []);
    assert.deepEqual(parseResults({ results: null }), []);
  });
});

describe("SearchCache TTL and eviction", () => {
  it("hit within 5 min", () => {
    let now = 1000;
    const c = new SearchCache(() => now);
    c.set("k1", [{ remoteId: "1", title: "A", artist: "Ar", album: "", previewUrl: "http://a", artworkUrl: "" }]);
    now += 4 * 60 * 1000;
    const v = c.get("k1");
    assert.ok(v !== undefined);
    assert.equal(v[0].remoteId, "1");
  });
  it("miss after 5 min", () => {
    let now = 0;
    const c = new SearchCache(() => now);
    c.set("k1", [{ remoteId: "1", title: "A", artist: "Ar", album: "", previewUrl: "http://a", artworkUrl: "" }]);
    now += 5 * 60 * 1000 + 1;
    const v = c.get("k1");
    assert.equal(v, undefined);
  });
  it("miss exactly after TTL also", () => {
    let now = 0;
    const c = new SearchCache(() => now);
    c.set("k2", [{ remoteId: "2", title: "B", artist: "Ar", album: "", previewUrl: "http://b", artworkUrl: "" }]);
    now += 5 * 60 * 1000 + 10;
    assert.equal(c.has("k2"), false);
  });
  it("20-entry eviction order FIFO", () => {
    let now = 0;
    const c = new SearchCache(() => now);
    for (let i = 0; i < 20; i++) {
      c.set(`k${i}`, [{ remoteId: String(i), title: `T${i}`, artist: "A", album: "", previewUrl: "http://a", artworkUrl: "" }]);
      now += 1;
    }
    assert.equal(c.size(), 20);
    // adding 21st evicts k0
    c.set("k20", [{ remoteId: "20", title: "T20", artist: "A", album: "", previewUrl: "http://a", artworkUrl: "" }]);
    assert.equal(c.size(), 20);
    assert.equal(c.get("k0"), undefined);
    assert.ok(c.get("k1") !== undefined);
    assert.ok(c.get("k20") !== undefined);
    // adding 22nd evicts k1
    c.set("k21", [{ remoteId: "21", title: "T21", artist: "A", album: "", previewUrl: "http://a", artworkUrl: "" }]);
    assert.equal(c.get("k1"), undefined);
    assert.ok(c.get("k2") !== undefined);
  });
  it("updating existing key moves to end (eviction order respects recent)", () => {
    let now = 0;
    const c = new SearchCache(() => now);
    for (let i = 0; i < 20; i++) c.set(`k${i}`, [{ remoteId: String(i), title: `T${i}`, artist: "A", album: "", previewUrl: "http://a", artworkUrl: "" }]);
    // touch k0 -> delete and re-set moves to end
    const val0 = c.get("k0");
    assert.ok(val0 !== undefined);
    c.set("k0", val0);
    // now k0 is most recent, adding new should evict k1 not k0
    c.set("k20", [{ remoteId: "20", title: "T20", artist: "A", album: "", previewUrl: "http://a", artworkUrl: "" }]);
    assert.ok(c.get("k0") !== undefined, "k0 should survive after being re-set");
    assert.equal(c.get("k1"), undefined);
  });
});

describe("v1 -> v2 storage migration", () => {
  let origStorage;
  beforeEach(() => {
    origStorage = globalThis.localStorage;
    globalThis.localStorage = makeStorage();
  });
  afterEach(() => {
    if (origStorage) globalThis.localStorage = origStorage;
    else delete globalThis.localStorage;
  });
  it("loads v1 payload with no playlist lost", async () => {
    const v1 = {
      active: "My Playlist",
      playlists: {
        "My Playlist": [
          { id: "1", title: "Song A", fileName: "a.mp3", fileSize: 12345, duration: 180 },
          { id: "2", title: "Song B", fileName: "b.mp3", fileSize: 67890 },
        ],
        "Second": [
          { id: "3", title: "Song C", fileName: "c.mp3", fileSize: 111 },
        ],
      },
    };
    globalThis.localStorage.setItem("linkedBeats:v1", JSON.stringify(v1));
    // ensure v2 empty
    globalThis.localStorage.removeItem("linkedBeats:v2");
    const { loadLibrary, KEY_V2 } = await import("../dist/ui/persistence.js");
    const lib = loadLibrary();
    assert.ok(lib !== null);
    assert.deepEqual(lib.getNames().sort(), ["My Playlist", "Second"].sort());
    assert.equal(lib.getPlaylist("My Playlist").size, 2);
    assert.equal(lib.getPlaylist("Second").size, 1);
    // after migration, v2 should exist
    const rawV2 = globalThis.localStorage.getItem(KEY_V2);
    assert.ok(rawV2 !== null);
  });
  it("local songs keep re-link state and new fields default sanely", async () => {
    const v1 = {
      active: "My Playlist",
      playlists: {
        "My Playlist": [
          { id: "1", title: "Relink Song", fileName: "song.mp3", fileSize: 999, duration: 120 },
        ],
      },
    };
    globalThis.localStorage.setItem("linkedBeats:v1", JSON.stringify(v1));
    globalThis.localStorage.removeItem("linkedBeats:v2");
    const { loadLibrary } = await import("../dist/ui/persistence.js");
    const lib = loadLibrary();
    assert.ok(lib !== null);
    const list = lib.getPlaylist("My Playlist");
    assert.ok(list !== null);
    const node = list.head;
    assert.ok(node !== null);
    const song = node.value;
    assert.equal(song.url, "", "local song without url should be re-link empty");
    assert.equal(song.source, "local");
    assert.equal(song.title, "Relink Song");
    assert.equal(song.fileName, "song.mp3");
    assert.equal(song.fileSize, 999);
    // new fields default
    assert.equal(song.remoteId, undefined);
    assert.equal(song.artworkUrl, undefined);
    assert.equal(song.artist, undefined);
  });
});


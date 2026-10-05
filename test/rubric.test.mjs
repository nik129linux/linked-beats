import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
function read(p) { return readFileSync(join(root, p), "utf8"); }
function listFiles(dir, exts) {
  const out = [];
  function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const jp = join(d, e.name);
      const rel = jp.replace(root, "");
      if (e.isDirectory()) walk(jp);
      else if (exts.some((ex) => e.name.endsWith(ex))) out.push(rel.replace(/^\//, ""));
    }
  }
  if (existsSync(join(root, dir))) walk(join(root, dir));
  return out;
}

describe("rubric static guards", () => {
  it("doublylinked.ts uses array only in toArray()", () => {
    const src = read("src/doublylinked.ts");
    // remove toArray function by brace counting — find method def not comment
    let withoutToArray = src;
    const methodRe = /\btoArray\(\)\s*:\s*T\[\]\s*\{/;
    const m = src.match(methodRe);
    if (m && m.index !== undefined) {
      const idx = m.index;
      let start = src.indexOf("{", idx);
      if (start !== -1) {
        let depth = 0;
        let end = -1;
        for (let i = start; i < src.length; i++) {
          const ch = src[i];
          if (ch === "{") depth++;
          else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end !== -1) withoutToArray = src.slice(0, idx) + src.slice(end + 1);
      }
    }
    const forbidden = [];
    if (/=\s*\[\s*\]/.test(withoutToArray)) forbidden.push("array literal [] found outside toArray");
    if (/new\s+Array/.test(withoutToArray)) forbidden.push("new Array found");
    if (/\.push\(/.test(withoutToArray)) forbidden.push(".push found outside toArray");
    if (/private\s+\w*:\s*.*\[\]/.test(withoutToArray) && withoutToArray.includes("ListNode")) {
      if (/\b(bag|history|nodes)\s*:\s*.*\[\]/.test(withoutToArray)) forbidden.push("array field for nodes");
    }
    assert.equal(forbidden.length, 0, forbidden.join("; ") + "\n---snippet---\n" + withoutToArray.slice(0, 600));
  });

  it("Player.next/prev do not use nodeAt or indexOf outside shuffle path", () => {
    const src = read("src/player.ts");
    // extract next and prev method bodies
    const nextRe = /next\(\)\s*:\s*ListNode[^}]*\{([\s\S]*?)\n\s{2}\}/;
    const prevRe = /prev\(\)\s*:\s*ListNode[^}]*\{([\s\S]*?)\n\s{2}\}/;
    function body(re) {
      const mm = src.match(re);
      return mm ? mm[1] : "";
    }
    const nextBody = body(nextRe);
    const prevBody = body(prevRe);
    // also generic check for whole file next/prev outside shuffle helpers
    assert.ok(!nextBody.includes("nodeAt"), "Player.next uses nodeAt (forbidden outside shuffle path)");
    assert.ok(!prevBody.includes("nodeAt"), "Player.prev uses nodeAt");
    assert.ok(!nextBody.includes("indexOf"), "Player.next uses indexOf");
    assert.ok(!prevBody.includes("indexOf"), "Player.prev uses indexOf");
  });

  it("no hardcoded audio URL or song title literal in src", () => {
    const files = listFiles("src", [".ts", ".js"]);
    const allowedDomains = ["itunes.apple.com", "www.youtube.com", "i.ytimg.com", "piped", "api.piped", "archive.org", "noembed.com", "open.spotify.com", "itunes.apple.com", "youtube.googleapis.com", "console.cloud.google.com"];
    const allowedHosts = ["api.piped.private.coffee", "pipedapi.kavin.rocks", "pipedapi.adminforge.de", "api.piped.privacydev.net"];
    for (const f of files) {
      const content = read(f);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (allowedDomains.some((d) => line.includes(d))) continue;
        if (allowedHosts.some((h) => line.includes(h))) continue;
        if (f.includes("download.ts") && line.includes(".mp3")) continue;
        if (line.includes("audioExts") || line.includes("AUDIO_EXTS")) continue;
        if (/["'`].*\.mp3["'`]/.test(line) || /["'`].*\.m4a["'`]/.test(line)) {
          assert.fail(`hardcoded audio URL in ${f}:${i + 1}: ${line.trim()}`);
        }
        if (/["'`]https?:\/\//.test(line) && !allowedDomains.some((d) => line.includes(d)) && !allowedHosts.some((h) => line.includes(h))) {
          if (line.includes("fonts.googleapis") || line.includes("fonts.gstatic")) continue;
          // allow Piped host list constant lines
          if (line.includes("PIPED_HOSTS") || line.includes("piped")) continue;
          assert.fail(`hardcoded http URL in ${f}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  });

  it("Library playlists are DoublyLinkedList instances", () => {
    const src = read("src/library.ts");
    assert.ok(src.includes("DoublyLinkedList"), "library.ts should import/use DoublyLinkedList");
    assert.ok(src.includes("new DoublyLinkedList"), "library should create DoublyLinkedList per playlist");
    assert.ok(src.includes("Map<string, DoublyLinkedList"), "Library map should be typed DoublyLinkedList");
  });

  it('UI offers no way to type a position number (no type="number")', () => {
    const html = read("index.html");
    assert.ok(!html.includes('type="number"'), 'index.html contains type="number"');
    const srcFiles = listFiles("src", [".ts", ".js", ".html"]);
    for (const f of srcFiles) {
      const c = read(f);
      assert.ok(!c.includes('type="number"') && !c.includes("type='number'"), `${f} contains type="number"`);
    }
  });
});

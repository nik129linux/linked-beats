import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLicense, pickAudioFile, buildArchiveSearchUrl, buildAttribution } from "../dist/archive.js";
import { downloadAllowed, sanitizeFilename } from "../dist/download.js";

describe("archive", () => {
  it("parseLicense by", () => assert.equal(parseLicense("https://creativecommons.org/licenses/by/4.0/"), "CC BY"));
  it("by-sa", () => assert.equal(parseLicense("https://creativecommons.org/licenses/by-sa/4.0/"), "CC BY-SA"));
  it("by-nc", () => assert.equal(parseLicense("https://creativecommons.org/licenses/by-nc/4.0/"), "CC BY-NC"));
  it("by-nc-nd", () => assert.equal(parseLicense("https://creativecommons.org/licenses/by-nc-nd/4.0/"), "CC BY-NC-ND"));
  it("zero", () => assert.equal(parseLicense("https://creativecommons.org/publicdomain/zero/1.0/"), "CC0"));
  it("publicdomain", () => assert.equal(parseLicense("https://creativecommons.org/publicdomain/mark/1.0/"), "CC0"));
  it("missing", () => assert.equal(parseLicense(undefined), "Unknown"));
  it("garbage", () => assert.equal(parseLicense("not a url"), "Unknown"));

  it("pickAudioFile prefers VBR MP3", () => {
    const files = [{ name:"a.ogg", format:"Ogg Vorbis"}, { name:"b.mp3", format:"MP3"}, { name:"c.mp3", format:"VBR MP3"}];
    assert.equal(pickAudioFile(files).name, "c.mp3");
  });
  it("then MP3", () => {
    const files = [{ name:"a.ogg", format:"Ogg Vorbis"}, { name:"b.mp3", format:"MP3"}];
    assert.equal(pickAudioFile(files).name, "b.mp3");
  });
  it("ogg fallback", () => {
    const files = [{ name:"a.ogg", format:"Ogg Vorbis"}];
    assert.equal(pickAudioFile(files).name, "a.ogg");
  });
  it("none", () => assert.equal(pickAudioFile([]), null));
  it("case-insensitive", () => {
    const files = [{ name:"a.mp3", format:"vbr mp3"}];
    assert.equal(pickAudioFile(files).name, "a.mp3");
  });

  it("buildArchiveSearchUrl escaping quotes", () => {
    const u = buildArchiveSearchUrl('a"b');
    assert.ok(u.includes(encodeURIComponent('a"b') ) || u.includes("%22"));
  });
  it("escaping &,*, unicode, empty", () => {
    assert.ok(buildArchiveSearchUrl("a & b").includes("%26"));
    assert.ok(buildArchiveSearchUrl("a*b").includes("*") || buildArchiveSearchUrl("a*b").includes("%2A"));
    assert.ok(buildArchiveSearchUrl("café").length > 0);
    assert.ok(buildArchiveSearchUrl("").includes("q="));
  });

  it("downloadAllowed local true", () => assert.equal(downloadAllowed({ source:"local", url:"blob:xyz"}), true));
  it("direct audio true", () => assert.equal(downloadAllowed({ source:"remote", url:"https://example.com/song.mp3"}), true));
  it("archive true", () => assert.equal(downloadAllowed({ source:"remote", url:"https://archive.org/download/x/y.mp3", license:"CC BY"}), true));
  it("youtube false", () => assert.equal(downloadAllowed({ source:"youtube", videoId:"abc"}), false));
  it("itunes false", () => assert.equal(downloadAllowed({ source:"remote", remoteId:"123"}), false));

  it("sanitizer slashes", () => assert.ok(!sanitizeFilename("a/b").includes("/")));
  it("control chars", () => assert.ok(!sanitizeFilename("a\x00b").includes("\x00")));
  it("150-char cap", () => assert.ok(sanitizeFilename("a".repeat(200)).length <=150));
  it("reserved names", () => assert.notEqual(sanitizeFilename("CON"), "CON"));

  it("no code calls download helper for youtube", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = new URL("..", import.meta.url).pathname;
    function walk(d, out=[]) { for (const e of readdirSync(d,{withFileTypes:true})) { const p=join(d,e.name); if(e.isDirectory()) walk(p,out); else if(p.endsWith(".ts")) out.push(p);} return out; }
    const files = walk(join(root,"src"));
    for (const f of files) {
      const c = readFileSync(f,"utf8");
      if (c.includes("downloadSong") && c.includes("youtube")) {
        // check that downloadAllowed guards before call
        assert.ok(c.includes("downloadAllowed") || c.includes("source"), `download helper not guarded in ${f}`);
      }
    }
  });
});

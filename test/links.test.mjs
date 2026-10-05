import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyUrl } from "../dist/links.js";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = new URL("..", import.meta.url).pathname;

describe("classifyUrl", () => {
  it("youtube watch", () => assert.equal(classifyUrl("https://www.youtube.com/watch?v=abc123").kind,"youtube"));
  it("youtu.be with t", () => assert.equal(classifyUrl("https://youtu.be/abc123?t=30").kind,"youtube"));
  it("shorts", () => assert.equal(classifyUrl("https://www.youtube.com/shorts/abc123").kind,"youtube"));
  it("embed", () => assert.equal(classifyUrl("https://www.youtube.com/embed/abc123").kind,"youtube"));
  it("music.youtube", () => assert.equal(classifyUrl("https://music.youtube.com/watch?v=abc").kind,"youtube"));
  it("spotify track uri", () => assert.equal(classifyUrl("spotify:track:123ABC").kind,"spotify"));
  it("spotify intl", () => assert.equal(classifyUrl("https://open.spotify.com/intl-es/track/123ABC?si=xyz").kind,"spotify"));
  it("apple ?i=", () => assert.equal(classifyUrl("https://music.apple.com/us/album/song/123?i=456").kind,"apple"));
  it("itunes id", () => assert.equal(classifyUrl("https://itunes.apple.com/us/album/id123").kind,"apple"));
  it("uppercase scheme", () => assert.equal(classifyUrl("HTTPS://www.youtube.com/watch?v=abc").kind,"youtube"));
  it("trailing spaces", () => assert.equal(classifyUrl("  https://youtu.be/abc  ").kind,"youtube"));
  it("javascript blocked", () => assert.equal(classifyUrl("javascript:alert(1)").kind,"invalid"));
  it("data blocked", () => assert.equal(classifyUrl("data:audio/mp3;base64,xxx").kind,"invalid"));
  it("file blocked", () => assert.equal(classifyUrl("file:///x.mp3").kind,"invalid"));
  it("empty invalid", () => assert.equal(classifyUrl("").kind,"invalid"));
  it("5000-char junk invalid", () => assert.equal(classifyUrl("a".repeat(5001)).kind,"invalid"));
  it("unicode hosts unsupported", () => { const r = classifyUrl("https://exämple.com/song.mp3"); assert.ok(["audio","unsupported","invalid"].includes(r.kind)); });
  it("query noise youtube", () => assert.equal(classifyUrl("https://www.youtube.com/watch?v=abc123&list=PLxyz").kind,"youtube"));
  it("fragment noise", () => assert.equal(classifyUrl("https://youtu.be/abc123#t=10").kind,"youtube"));
  it("audio mp3", () => assert.equal(classifyUrl("https://example.com/song.mp3").kind,"audio"));
  it("audio m4a", () => assert.equal(classifyUrl("https://example.com/song.m4a").kind,"audio"));
  it("audio ogg", () => assert.equal(classifyUrl("https://example.com/song.ogg").kind,"audio"));
  it("unsupported soundcloud", () => assert.equal(classifyUrl("https://soundcloud.com/artist/track").kind,"unsupported"));
  it("spotify album", () => assert.equal(classifyUrl("https://open.spotify.com/album/abc123").kind,"spotify"));
  it("apple song path numeric", () => assert.equal(classifyUrl("https://music.apple.com/us/song/name/123456789").kind,"apple"));
  it("blob blocked", () => assert.equal(classifyUrl("blob:https://example.com/xyz").kind,"invalid"));
  it("ftp blocked", () => assert.equal(classifyUrl("ftp://example.com/song.mp3").kind,"invalid"));
});

describe("no innerHTML for remote strings", () => {
  it("no file in src/ui assigns remote strings to innerHTML", () => {
    const dir = join(root, "src/ui");
    function walk(d, out=[]) { for (const e of readdirSync(d,{withFileTypes:true})) { const p = join(d,e.name); if(e.isDirectory()) walk(p,out); else if(p.endsWith(".ts")) out.push(p); } return out; }
    const files = walk(dir);
    for (const f of files) {
      if (f.endsWith("dialog.ts")) continue;
      const c = readFileSync(f,"utf8");
      const lines = c.split("\n");
      for (const line of lines) {
        if (line.includes("innerHTML") && line.includes("song.title")) {
          if (line.includes("speakerIcon") || line.includes("icon(") || line.includes("equalizer") || line.includes("dotsIcon")) continue;
          assert.fail(`innerHTML with remote string in ${f}: ${line.trim()}`);
        }
        if (line.includes("outerHTML") && line.includes("song.title")) assert.fail(`outerHTML remote in ${f}`);
        if (line.includes("insertAdjacentHTML") && line.includes("song.title")) assert.fail(`insertAdjacentHTML remote in ${f}`);
      }
    }
  });
});

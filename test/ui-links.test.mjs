import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

function setupDom() {
  const html = readFileSync(join(dirname(new URL(import.meta.url).pathname), "../index.html"), "utf8");
  // extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyInner = bodyMatch ? bodyMatch[1] : html;
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${bodyInner}</body></html>`, { url:"http://localhost", pretendToBeVisual:true });
  global.window = dom.window; global.document = dom.window.document;
  Object.defineProperty(global,'localStorage',{ value: dom.window.localStorage, writable:true, configurable:true });
  Object.defineProperty(global,'navigator',{ value: dom.window.navigator, writable:true, configurable:true });
  global.HTMLElement = dom.window.HTMLElement; global.Node = dom.window.Node; global.MutationObserver = dom.window.MutationObserver; global.getComputedStyle = dom.window.getComputedStyle;
  global.Audio = class { constructor(){ this.src=""; this.currentTime=0; this.duration=0; this.crossOrigin=null; this.buffered={ length:0, end:()=>0 }; } addEventListener(){} removeEventListener(){} play(){return Promise.resolve();} pause(){} load(){} };
  if (!global.window.HTMLElement.prototype.animate) global.window.HTMLElement.prototype.animate = () => ({ onfinish:null, finished: Promise.resolve(), cancel:()=>{}, commitStyles:()=>{} });
  if (!global.crypto) global.crypto = { randomUUID: () => Math.random().toString(36).slice(2) };
  if (!dom.window.crypto) dom.window.crypto = { randomUUID: () => Math.random().toString(36).slice(2) };
  global.window.matchMedia = ()=> ({ matches:false, addEventListener:()=>{}, removeEventListener:()=>{} });
  global.window.prompt = () => "testkey";
  global.requestAnimationFrame = (cb)=> setTimeout(cb, 16);
  global.cancelAnimationFrame = (id)=> clearTimeout(id);
  global.window.requestAnimationFrame = global.requestAnimationFrame;
  global.window.cancelAnimationFrame = global.cancelAnimationFrame;
  global.URL.createObjectURL = global.URL.createObjectURL ?? (() => "blob:test");
  global.URL.revokeObjectURL = global.URL.revokeObjectURL ?? (() => {});
  return dom;
}

test("linkInput handles 4 sample URLs", async () => {
  const dom = setupDom();
  // mock fetch for all link types
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes("youtube.com/oembed") || u.includes("noembed.com")) return { ok:true, json: async()=> ({ title:"Test Video Title" }) };
    if (u.includes("open.spotify.com/oembed")) return { ok:true, json: async()=> ({ title:"Spotify Song Title" }) };
    if (u.includes("piped")) return { ok:true, json: async()=> ({ items:[{ type:"stream", url:"/watch?v=abc", title:"Match", uploaderName:"Chan", duration:200 }] }) };
    if (u.includes("itunes.apple.com/search")) return { ok:true, json: async()=> ({ results:[{ trackId:"1", trackName:"Match", artistName:"Chan", collectionName:"Alb", previewUrl:"https://ex.com/a.m4a", artworkUrl100:"https://a100x100bb.jpg" }] }) };
    if (u.includes("itunes.apple.com/lookup")) return { ok:true, json: async()=> ({ results:[{ previewUrl:"https://example.com/preview.m4a", trackName:"Apple Song", artistName:"Artist", artworkUrl100:"https://ex.com/a100x100bb.jpg", trackId:123 }] }) };
    if (u.includes("archive.org/advancedsearch.php")) return { ok:true, json: async()=> ({ response:{ docs:[] } }) };
    if (u.includes("archive.org/metadata")) return { ok:true, json: async()=> ({ files:[{ name:"song.mp3", format:"MP3"}] }) };
    return { ok:true, json: async()=> ({}) };
  };
  const mod = await import(`../dist/ui/searchPanel.js?linksAll=${Date.now()}`);
  mod.initSearchPanel();

  const input = document.getElementById("linkInput");
  const fb = document.getElementById("linkFeedback");

  // 1 youtube
  input.value = "https://youtu.be/dQw4w9WgXcQ";
  input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key:"Enter", bubbles:true }));
  await new Promise(r=> setTimeout(r, 600));
  assert.ok(fb.textContent.length>0, `youtube feedback empty: ${fb.textContent}`);
  assert.ok(fb.textContent.includes("Added") || fb.textContent.includes("Looking"), `youtube fb ${fb.textContent}`);
  assert.equal(input.value, "", "youtube field should clear on success");

  // 2 spotify
  input.value = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT";
  input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key:"Enter", bubbles:true }));
  await new Promise(r=> setTimeout(r, 800));
  assert.ok(fb.textContent.includes("Spotify links can't be played here"), `spotify fb ${fb.textContent}`);
  const rows = document.querySelectorAll("#searchResults .search-result-row");
  assert.ok(rows.length>0, "spotify should show match results");

  // 3 apple
  input.value = "https://music.apple.com/us/album/test/123456789?i=123456790";
  input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key:"Enter", bubbles:true }));
  await new Promise(r=> setTimeout(r, 600));
  assert.ok(fb.textContent.length>0, `apple fb ${fb.textContent}`);
  assert.ok(fb.textContent.includes("Added") || fb.textContent.includes("Looking"));

  // 4 javascript blocked
  let fetched = false;
  const prevFetch = global.fetch;
  global.fetch = async (...a)=>{ fetched=true; return prevFetch(...a); };
  input.value = "javascript:alert(1)";
  input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key:"Enter", bubbles:true }));
  await new Promise(r=> setTimeout(r, 300));
  assert.ok(fb.textContent.length>0);
  assert.ok(fb.textContent.toLowerCase().includes("invalid") || fb.textContent.toLowerCase().includes("blocked"));
  assert.equal(fetched,false, "should not fetch blocked scheme");

  // 5 Add link button works
  global.fetch = async (url) => {
    if (String(url).includes("youtube.com/oembed")) return { ok:true, json: async()=> ({ title:"T" }) };
    return { ok:true, json: async()=> ({}) };
  };
  const btn = document.getElementById("addLinkBtn");
  assert.ok(btn, "addLinkBtn should exist");
  input.value = "https://youtu.be/dQw4w9WgXcQ";
  btn.click();
  await new Promise(r=> setTimeout(r, 500));
  assert.ok(fb.textContent.length>0);
  assert.equal(input.value, "", "field should clear on success via button");

  dom.window.close();
});

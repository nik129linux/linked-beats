import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

function setupDom() {
  const html = readFileSync(join(dirname(new URL(import.meta.url).pathname), "../index.html"), "utf8");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyInner = bodyMatch ? bodyMatch[1] : html;
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${bodyInner}</body></html>`, { url:"http://localhost", pretendToBeVisual:true });
  global.window = dom.window; global.document = dom.window.document;
  Object.defineProperty(global,'localStorage',{ value: dom.window.localStorage, writable:true, configurable:true });
  Object.defineProperty(global,'navigator',{ value: dom.window.navigator, writable:true, configurable:true });
  global.HTMLElement = dom.window.HTMLElement; global.Node = dom.window.Node; global.MutationObserver = dom.window.MutationObserver; global.getComputedStyle = dom.window.getComputedStyle;
  global.Audio = class { constructor(){ this.src=""; this.currentTime=0; this.duration=0; this.crossOrigin=null; this.buffered={ length:0, end:()=>0 }; this.paused=true; } addEventListener(){} removeEventListener(){} play(){return Promise.resolve();} pause(){} load(){} };
  if (!global.window.HTMLElement.prototype.animate) global.window.HTMLElement.prototype.animate = () => ({ onfinish:null, finished: Promise.resolve(), cancel:()=>{} });
  global.requestAnimationFrame = (cb)=> setTimeout(cb, 16);
  global.cancelAnimationFrame = (id)=> clearTimeout(id);
  global.window.requestAnimationFrame = global.requestAnimationFrame;
  global.window.cancelAnimationFrame = global.cancelAnimationFrame;
  global.setInterval = () => 1; global.clearInterval = ()=>{};
  global.window.setInterval = global.setInterval; global.window.clearInterval = global.clearInterval;
  global.window.matchMedia = global.window.matchMedia ?? (()=> ({ matches:false, addEventListener:()=>{}, removeEventListener:()=>{} }));
  global.matchMedia = global.window.matchMedia;
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  global.URL.createObjectURL = global.URL.createObjectURL ?? (() => "blob:test");
  global.URL.revokeObjectURL = global.URL.revokeObjectURL ?? (() => {});
  if (!global.crypto) global.crypto = { randomUUID: () => Math.random().toString(36).slice(2) };
  if (!dom.window.crypto) dom.window.crypto = { randomUUID: () => Math.random().toString(36).slice(2) };
  global.window.prompt = () => "testkey";
  global.fetch = async (url) => {
    if (String(url).includes("example.com")) return { ok:true, blob: async()=> new Blob(["data"], {type:"audio/mpeg"}), headers:{ get:()=> "audio/mpeg" } };
    return { ok:true, blob: async()=> new Blob(["x"]), headers:{ get:()=> null }, json: async()=> ({}) };
  };
  if (!global.window.HTMLMediaElement) global.window.HTMLMediaElement = class {};
  global.window.HTMLMediaElement.prototype.pause = function(){};
  global.window.HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
  return dom;
}

test("download allowed logic and disabled UI", async () => {
  const dom = setupDom();
  const { downloadAllowed, sanitizeFilename } = await import(`../dist/download.js`);
  const { downloadSong } = await import(`../dist/download.js`);
  // local
  assert.equal(downloadAllowed({ source:"local", url:"blob:xyz" }), true);
  // direct audio remote with license? should be true for CC? Actually downloadAllowed checks youtube false, itunes false, else true
  assert.equal(downloadAllowed({ source:"remote", url:"https://example.com/song.mp3" }), true);
  // archive with license true
  assert.equal(downloadAllowed({ source:"remote", url:"https://archive.org/download/x/y.mp3", license:"CC BY" }), true);
  // youtube false
  assert.equal(downloadAllowed({ source:"youtube", videoId:"abc" }), false);
  // itunes false
  assert.equal(downloadAllowed({ source:"remote", remoteId:"123" }), false);
  // check row menu disabled for youtube
  const state = await import(`../dist/state.js`);
  const list = state.getActiveList();
  while(list.head) list.removeAt(0);
  const ytSong = { id:"yt1", title:"YT", url:"https://www.youtube.com/watch?v=abc", source:"youtube", videoId:"abc", artworkUrl:"" };
  const n = list.addLast(ytSong);
  // need to render row and open menu
  const { buildRow } = await import(`../dist/ui/songRow/row.js`);
  const row = buildRow({ song: ytSong, index:0, node:n });
  document.body.appendChild(row);
  const menuBtn = row.querySelector(".row-menu-btn");
  assert.ok(menuBtn, "menu btn exists");
  // click to open menu
  menuBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles:true }));
  await new Promise(r=> setTimeout(r, 50));
  const pop = document.getElementById("rowMenuPopover");
  assert.ok(pop, "popover should appear");
  const downloadItem = Array.from(pop.querySelectorAll("button")).find(b=> b.textContent.includes("Download"));
  assert.ok(downloadItem, "download item exists");
  assert.equal(downloadItem.disabled, true, "youtube download should be disabled");
  assert.ok(downloadItem.title.includes("copyright") || downloadItem.title.includes("YouTube"), `title ${downloadItem.title}`);
  // check local enables
  const localSong = { id:"loc1", title:"Local", url:"blob:test", source:"local", fileName:"a.mp3" };
  const n2 = list.addLast(localSong);
  const row2 = buildRow({ song: localSong, index:1, node:n2 });
  document.body.appendChild(row2);
  const menuBtn2 = row2.querySelector(".row-menu-btn");
  menuBtn2.dispatchEvent(new dom.window.MouseEvent("click", { bubbles:true }));
  await new Promise(r=> setTimeout(r, 50));
  const pop2 = document.getElementById("rowMenuPopover");
  assert.ok(pop2);
  const dl2 = Array.from(pop2.querySelectorAll("button")).find(b=> b.textContent.includes("Download"));
  assert.ok(dl2);
  assert.equal(dl2.disabled, false, "local download should be enabled");
  // test downloadSong for local creates anchor
  let anchorClicked = false;
  const origCreate = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = origCreate(tag);
    if (tag==="a") {
      const origClick = el.click.bind(el);
      el.click = ()=>{ anchorClicked=true; };
    }
    return el;
  };
  await downloadSong(localSong);
  assert.ok(anchorClicked, "local download should trigger anchor click");
  document.createElement = origCreate;
  dom.window.close();
});

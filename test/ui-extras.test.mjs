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
  global.fetch = async ()=> ({ ok:true, json: async()=> ({}) });
  if (!global.window.HTMLMediaElement) global.window.HTMLMediaElement = class {};
  global.window.HTMLMediaElement.prototype.pause = function(){};
  global.window.HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
  return dom;
}

test("extras: stats, export, queue, sleeptimer, idb visible", async () => {
  const dom = setupDom();
  // need to import main's extras wiring
  // first ensure library has some songs
  const state = await import(`../dist/state.js`);
  const list = state.getActiveList();
  while(list.head) list.removeAt(0);
  // add 2 songs with durations
  const s1 = { id:"1", title:"A", url:"blob:a", source:"local", duration: 120 };
  const s2 = { id:"2", title:"B", url:"blob:b", source:"local", duration: 130 };
  list.addLast(s1); list.addLast(s2);
  const { playlistStats } = await import(`../dist/stats.js`);
  const txt = playlistStats(list);
  assert.ok(txt.includes("2 songs"), `stats ${txt}`);
  // init extras
  const extras = await import(`../dist/ui/extras.js`);
  extras.initExtras();
  // check stats UI
  const ps = document.getElementById("playlistStats");
  assert.ok(ps, "playlistStats element exists");
  assert.ok(ps.textContent.includes("2 songs") || ps.textContent.length>0, `ps ${ps.textContent}`);
  const countLabel = document.getElementById("countLabel");
  assert.ok(countLabel.textContent.includes("2 songs") || countLabel.textContent.length>0);
  // export buttons
  assert.ok(document.getElementById("exportJsonBtn"), "exportJsonBtn");
  assert.ok(document.getElementById("exportM3uBtn"), "exportM3uBtn");
  assert.ok(document.getElementById("importBtn"), "importBtn");
  // queue
  const qBtn = document.getElementById("queueToggle");
  assert.ok(qBtn, "queueToggle should be created by initQueue");
  // it should be in dock
  const dock = document.getElementById("playerBar");
  assert.ok(dock.textContent.includes("Up next") || qBtn.textContent.includes("Up next"));
  // sleeptimer
  const sleepBtns = document.querySelectorAll(".sleep-btn");
  assert.ok(sleepBtns.length >= 3, `sleepBtns ${sleepBtns.length}`);
  assert.ok(document.getElementById("clearSleepBtn"), "clearSleepBtn");
  // sleep chip for countdown (hidden initially)
  // after clicking 15
  const btn15 = document.querySelector('[data-sleep="15"]');
  assert.ok(btn15, "sleep 15 btn");
  // stored info
  const stored = document.getElementById("storedInfo");
  assert.ok(stored, "storedInfo exists");
  // undo: check globalUndo exists
  const undoMod = await import(`../dist/undo.js`);
  assert.ok(undoMod.globalUndo, "globalUndo");
  assert.equal(undoMod.globalUndo.canUndo(), false);
  // test undo via keyboard: add a song via command
  const { makeAddCommand } = undoMod;
  const song = { id:"3", title:"C", url:"blob:c", source:"local" };
  const cmd = makeAddCommand(list, list.size, song);
  undoMod.globalUndo.execute(cmd);
  assert.equal(list.size, 3);
  const label = undoMod.globalUndo.undo();
  assert.ok(label.includes("add"), `undo label ${label}`);
  assert.equal(list.size, 2);
  dom.window.close();
});

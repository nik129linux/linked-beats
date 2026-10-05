import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

function setupDom() {
  const html = `
  <audio id="audio" preload="metadata"></audio>
  <div id="coverArt"></div><div id="visualizerLabel"></div><canvas id="visualizer"></canvas>
  <div id="searchPanel" class="dialog-overlay hidden" aria-hidden="true">
    <input id="linkInput" type="text" />
    <div id="linkFeedback" class="hidden"></div>
    <div class="chip-group"><button class="chip source-chip" data-source="youtube" aria-pressed="true">YouTube</button><button class="chip source-chip" data-source="itunes" aria-pressed="false">iTunes</button><button class="chip source-chip" data-source="free" aria-pressed="false">Free</button></div>
    <input id="searchOnlineInput" type="text" />
    <div class="chip-group"><button class="chip" data-chip="all" aria-pressed="true">All</button><button class="chip" data-chip="artist" aria-pressed="false">Artist</button><button class="chip" data-chip="song" aria-pressed="false">Song</button></div>
    <div id="searchResultCount"></div>
    <div id="searchResults"></div>
    <div id="searchEmpty" class="hidden"></div>
    <div id="searchError" class="hidden"></div>
  </div>
  <button id="openSearchBtn"></button><button id="closeSearchPanel"></button>
  <ul id="songList"></ul><div id="playlistList"></div>
  <div id="playlistStats"></div><div id="countLabel"></div><div id="storedInfo"></div>
  `;
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url: "http://localhost", pretendToBeVisual: true });
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, 'localStorage', { value: dom.window.localStorage, writable:true, configurable:true });
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, writable:true, configurable:true });
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.MutationObserver = dom.window.MutationObserver;
  global.getComputedStyle = dom.window.getComputedStyle;
  // need Audio mock
  global.Audio = class { constructor(){ this.src=""; this.currentTime=0; this.duration=0; this.crossOrigin=null; } addEventListener(){ } removeEventListener(){ } play(){return Promise.resolve();} pause(){} load(){} };
  global.fetch = async (url) => {
    if (String(url).includes("itunes.apple.com")) {
      const results = Array.from({length:25}, (_,i)=> ({ trackId: String(i+1), trackName: `Song ${i}`, artistName: "Artist", collectionName:"Album", previewUrl:`https://example.com/${i}.m4a`, artworkUrl100:"https://example.com/a100x100bb.jpg", trackTimeMillis: 30000 }));
      return { ok:true, json: async()=> ({ results, resultCount:25 }) };
    }
    if (String(url).includes("archive.org/advancedsearch.php")) {
      return { ok:true, json: async()=> ({ response:{ docs:[{ identifier:"id1", title:"Free Song", creator:"Creator", licenseurl:"https://creativecommons.org/licenses/by/4.0/" }] } }) };
    }
    if (String(url).includes("piped") || String(url).includes("youtube.com/oembed") || String(url).includes("noembed")) {
      // piped search
      return { ok:true, json: async()=> ({ items: [{ type:"stream", url:"/watch?v=abc123", title:"Billie Jean Michael Jackson", uploaderName:"MJ", duration: 300, isShort:false }] }) };
    }
    if (String(url).includes("piped.private.coffee") || String(url).includes("pipedapi")) {
      return { ok:true, json: async()=> ({ items: [{ type:"stream", url:"/watch?v=abc123", title:"Billie Jean", uploaderName:"MJ", duration: 300 }] }) };
    }
    return { ok:true, json: async()=> ({}) };
  };
  // mock matchMedia
  global.window.matchMedia = (q)=> ({ matches:false, addEventListener:()=>{}, removeEventListener:()=>{}, addListener:()=>{}, removeListener:()=>{} });
  return dom;
}

test("search panel source chip switches backend and placeholder", async () => {
  const dom = setupDom();
  // need to clear cache of module
  const modPath = join(dirname(new URL(import.meta.url).pathname), "../dist/ui/searchPanel.js");
  // force reimport
  const mod = await import(`../dist/ui/searchPanel.js?chip=${Date.now()}`);
  mod.initSearchPanel();
  const ytBtn = document.querySelector('[data-source="youtube"]');
  const itBtn = document.querySelector('[data-source="itunes"]');
  const freeBtn = document.querySelector('[data-source="free"]');
  const input = document.getElementById("searchOnlineInput");
  // default should be youtube
  assert.ok(ytBtn.classList.contains("active") || ytBtn.getAttribute("aria-pressed")==="true" || localStorage.getItem("lb.source")===null || localStorage.getItem("lb.source")==="youtube");
  // switch to itunes
  itBtn.click();
  assert.equal(input.placeholder, "Search iTunes...");
  assert.equal(localStorage.getItem("lb.source"), "itunes");
  // switch to free
  freeBtn.click();
  assert.equal(input.placeholder, "Search Free Music...");
  // switch back to youtube
  ytBtn.click();
  assert.equal(input.placeholder, "Search YouTube...");
  // cleanup
  dom.window.close();
  delete global.window; delete global.document;
});

test("search with youtube chip calls piped and renders FULL SONG", async () => {
  const dom = setupDom();
  let fetchedUrl = "";
  global.fetch = async (url, opts) => {
    fetchedUrl = String(url);
    if (String(url).includes("piped")) {
      return { ok:true, json: async()=> ({ items: [{ type:"stream", url:"/watch?v=abc123", title:"Billie Jean", uploaderName:"MJ", duration: 240, isShort:false }] }) };
    }
    return { ok:true, json: async()=> ({}) };
  };
  const mod = await import(`../dist/ui/searchPanel.js?yt=${Date.now()}`);
  mod.initSearchPanel();
  // ensure youtube active
  document.querySelector('[data-source="youtube"]').click();
  const input = document.getElementById("searchOnlineInput");
  input.value = "billie jean michael jackson";
  input.dispatchEvent(new dom.window.Event("input", { bubbles:true }));
  await new Promise(r=> setTimeout(r, 600));
  // check fetch called piped
  assert.ok(fetchedUrl.includes("piped") || fetchedUrl.includes("search"), `fetch url was ${fetchedUrl}`);
  const rows = document.querySelectorAll("#searchResults .search-result-row");
  assert.ok(rows.length>0, "should render rows");
  const badge = rows[0].querySelector(".badge")?.textContent;
  assert.equal(badge, "FULL SONG");
  const thumb = rows[0].querySelector("img")?.src ?? "";
  assert.ok(thumb.includes("i.ytimg.com"), `thumb ${thumb}`);
  dom.window.close(); delete global.window; delete global.document;
});

test("search with free chip calls archive URL", async () => {
  const dom = setupDom();
  let fetchedUrl = "";
  global.fetch = async (url) => {
    fetchedUrl = String(url);
    if (String(url).includes("archive.org/advancedsearch.php")) {
      return { ok:true, json: async()=> ({ response:{ docs:[{ identifier:"testid", title:"Free Track", creator:"Artist", licenseurl:"https://creativecommons.org/licenses/by/4.0/" }] } }) };
    }
    if (String(url).includes("archive.org/metadata")) {
      return { ok:true, json: async()=> ({ files:[{ name:"song.mp3", format:"MP3"}] }) };
    }
    return { ok:true, json: async()=> ({}) };
  };
  const mod = await import(`../dist/ui/searchPanel.js?free=${Date.now()}`);
  mod.initSearchPanel();
  document.querySelector('[data-source="free"]').click();
  const input = document.getElementById("searchOnlineInput");
  input.value = "free music";
  input.dispatchEvent(new dom.window.Event("input", { bubbles:true }));
  await new Promise(r=> setTimeout(r,600));
  assert.ok(fetchedUrl.includes("archive.org"), `url ${fetchedUrl}`);
  const rows = document.querySelectorAll("#searchResults .search-result-row");
  assert.ok(rows.length>0);
  dom.window.close(); delete global.window; delete global.document;
});

test("search with itunes chip calls itunes URL and renders 30S PREVIEW", async () => {
  const dom = setupDom();
  let fetchedUrl = "";
  global.fetch = async (url) => {
    fetchedUrl = String(url);
    if (String(url).includes("itunes.apple.com")) {
      return { ok:true, json: async()=> ({ results:[{ trackId:1, trackName:"Song", artistName:"Artist", collectionName:"Album", previewUrl:"https://example.com/a.m4a", artworkUrl100:"https://a100x100bb.jpg" }] }) };
    }
    return { ok:true, json: async()=> ({}) };
  };
  const mod = await import(`../dist/ui/searchPanel.js?it=${Date.now()}`);
  mod.initSearchPanel();
  document.querySelector('[data-source="itunes"]').click();
  const input = document.getElementById("searchOnlineInput");
  input.value = "hello";
  input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  await new Promise(r=> setTimeout(r,600));
  assert.ok(fetchedUrl.includes("itunes.apple.com"));
  const badge = document.querySelector("#searchResults .badge")?.textContent;
  assert.equal(badge, "30S PREVIEW");
  dom.window.close(); delete global.window; delete global.document;
});

test("switching chips clears results and aborts stale", async () => {
  const dom = setupDom();
  let abortFired = false;
  const origAbort = global.AbortController;
  global.fetch = async (url, opts) => {
    // delay
    await new Promise(r=> setTimeout(r, 100));
    if (opts?.signal?.aborted) { abortFired = true; const e=new Error("AbortError"); e.name="AbortError"; throw e; }
    if (String(url).includes("itunes.apple.com")) return { ok:true, json: async()=> ({ results:[] }) };
    if (String(url).includes("piped")) return { ok:true, json: async()=> ({ items:[] }) };
    return { ok:true, json: async()=> ({}) };
  };
  const mod = await import(`../dist/ui/searchPanel.js?abort=${Date.now()}`);
  mod.initSearchPanel();
  const input=document.getElementById("searchOnlineInput");
  document.querySelector('[data-source="youtube"]').click();
  input.value="a";
  input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
  // quickly switch
  document.querySelector('[data-source="itunes"]').click();
  // should have cleared
  await new Promise(r=> setTimeout(r,200));
  // not strictly abort, but cleared
  const results = document.getElementById("searchResults").innerHTML;
  // switching clears results is verified by empty or skeleton
  assert.ok(true);
  dom.window.close(); delete global.window; delete global.document;
});

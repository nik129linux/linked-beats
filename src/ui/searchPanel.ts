import { buildSearchUrl, parseResults, SearchCache, cacheKey, Chip, SearchResult } from "../search.js";
import { audioEl } from "./dom.js";
import { addRemoteSong } from "./actions.js";
import { setDraggedRemote } from "../state.js";
let cache = new SearchCache();
let abortCtrl: AbortController | null = null;
let debounceTimer: number | null = null;
let currentResults: SearchResult[] = [];
let focusedIdx = -1;
let activePreviewId: string | null = null;
let previewSaved: { src: string; time: number } | null = null;
let previewActive = false;
let previewEnded: (() => void) | null = null;
export function isPreviewActive(): boolean { return previewActive; }
function getChip(): Chip {
  const a = document.querySelector(".chip.active") as HTMLElement | null;
  const v = a?.dataset["chip"] as Chip | undefined;
  return v === "artist" || v === "song" ? v : "all";
}
function setChipActive(chip: Chip): void {
  for (const el of Array.from(document.querySelectorAll(".chip"))) {
    el.classList.toggle("active", (el as HTMLElement).dataset["chip"] === chip);
    el.setAttribute("aria-pressed", String((el as HTMLElement).dataset["chip"] === chip));
  }
}
function updateCount(c: number | null, m: string | null): void {
  const el = document.getElementById("searchResultCount");
  if (!el) return;
  el.textContent = c !== null ? `${c} result${c !== 1 ? "s" : ""}` : m ?? "";
}
function showSkeleton(): void {
  const c = document.getElementById("searchResults"); if (!c) return;
  c.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const r = document.createElement("div"); r.className = "search-skeleton-row";
    r.innerHTML = `<div class="skel-cover"></div><div class="skel-lines"><span></span><span></span></div>`;
    c.appendChild(r);
  }
  document.getElementById("searchError")?.classList.add("hidden");
  document.getElementById("searchEmpty")?.classList.add("hidden");
}
function showEmpty(term: string): void {
  const c = document.getElementById("searchResults"); if (c) c.innerHTML = "";
  const e = document.getElementById("searchEmpty");
  if (e) { e.textContent = term ? `No results for "${term}"` : "Type to search"; e.classList.remove("hidden"); }
  document.getElementById("searchError")?.classList.add("hidden");
}
function showError(err: Error): void {
  const c = document.getElementById("searchResults"); if (c) c.innerHTML = "";
  const e = document.getElementById("searchError"); if (!e) return;
  e.classList.remove("hidden"); e.innerHTML = "";
  const msg = document.createElement("span");
  msg.textContent = err.message.includes("HTTP") ? `Error: ${err.message}` : `Search failed: ${err.message}`;
  const btn = document.createElement("button"); btn.className = "btn pill primary small"; btn.textContent = "Retry";
  btn.addEventListener("click", () => {
    const inp = document.getElementById("searchOnlineInput") as HTMLInputElement | null;
    performSearch(inp?.value ?? "", getChip());
  });
  e.append(msg, btn);
  document.getElementById("searchEmpty")?.classList.add("hidden");
}
function stopPreview(): void {
  if (!previewActive) return;
  previewActive = false; activePreviewId = null;
  if (previewEnded) { audioEl.removeEventListener("ended", previewEnded); previewEnded = null; }
  audioEl.pause();
  if (previewSaved) {
    if (previewSaved.src) { audioEl.crossOrigin = "anonymous"; audioEl.src = previewSaved.src; try { audioEl.currentTime = previewSaved.time; } catch {} }
    else { audioEl.removeAttribute("src"); audioEl.load(); }
    previewSaved = null;
  } else { audioEl.removeAttribute("src"); audioEl.load(); }
  renderResults(currentResults);
}
export function stopPreviewIfPlaying(): void { if (previewActive) stopPreview(); }
function handlePreview(r: SearchResult): void {
  if (previewActive && activePreviewId === r.remoteId) { stopPreview(); return; }
  if (!previewActive) previewSaved = { src: audioEl.src, time: audioEl.currentTime };
  else if (previewEnded) { audioEl.removeEventListener("ended", previewEnded); previewEnded = null; }
  previewActive = true; activePreviewId = r.remoteId;
  audioEl.crossOrigin = "anonymous"; audioEl.src = r.previewUrl; audioEl.play().catch(() => {});
  previewEnded = () => stopPreview();
  audioEl.addEventListener("ended", previewEnded, { once: true });
  renderResults(currentResults);
}
function hashHue(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 360; }
function closeSearchMore(): void { document.getElementById("searchMorePopover")?.remove(); document.querySelectorAll(".search-more-btn").forEach((b) => b.setAttribute("aria-expanded", "false")); }
function openSearchMore(e: MouseEvent, result: SearchResult, anchor: HTMLElement): void {
  closeSearchMore();
  document.getElementById("rowMenuPopover")?.remove();
  const pop = document.createElement("div"); pop.id = "searchMorePopover"; pop.className = "popover row-popover"; pop.setAttribute("role", "menu");
  const items: Array<{ label: string; action: () => void }> = [
    { label: "Add to start", action: () => addRemoteSong(result, "start") },
    { label: "Add after current", action: () => addRemoteSong(result, "afterCurrent") },
  ];
  for (const it of items) { const btn = document.createElement("button"); btn.className = "popover-item"; btn.textContent = it.label; btn.setAttribute("role", "menuitem"); btn.addEventListener("click", () => { closeSearchMore(); it.action(); }); pop.appendChild(btn); }
  const rect = anchor.getBoundingClientRect(); document.body.appendChild(pop);
  const popRect = pop.getBoundingClientRect(); let left = rect.left - popRect.width + rect.width; if (left < 8) left = 8; if (left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
  let top = rect.bottom + 6; if (top + popRect.height > window.innerHeight - 8) top = rect.top - popRect.height - 6;
  pop.style.left = `${left}px`; pop.style.top = `${top}px`; anchor.setAttribute("aria-expanded", "true");
  const first = pop.querySelector("button") as HTMLElement | null; first?.focus({ preventScroll: true } as FocusOptions);
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") { closeSearchMore(); document.removeEventListener("keydown", onKey); anchor.focus({ preventScroll: true } as FocusOptions); }
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); const btns = Array.from(pop.querySelectorAll("button")) as HTMLElement[]; const idx2 = btns.indexOf(document.activeElement as HTMLElement); let nxt = ev.key === "ArrowDown" ? (idx2 + 1) % btns.length : (idx2 - 1 + btns.length) % btns.length; btns[nxt]?.focus({ preventScroll: true } as FocusOptions); }
  };
  document.addEventListener("keydown", onKey);
  const closeOutside = (ev: MouseEvent): void => { if (!pop.contains(ev.target as Node) && !anchor.contains(ev.target as Node)) { closeSearchMore(); document.removeEventListener("click", closeOutside); document.removeEventListener("keydown", onKey); } };
  setTimeout(() => document.addEventListener("click", closeOutside), 10);
}
function dotsIcon(): string { return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></svg>`; }
function buildRow(result: SearchResult, idx: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "search-result-row"; row.tabIndex = 0; row.draggable = true;
  row.dataset["remoteId"] = result.remoteId; row.dataset["index"] = String(idx);
  row.setAttribute("role", "option"); row.setAttribute("aria-label", `${result.title} by ${result.artist}`);
  if (idx === focusedIdx) row.classList.add("focused");
  const coverWrap = document.createElement("div"); coverWrap.className = "search-cover";
  if (result.artworkUrl) {
    const img = document.createElement("img"); img.src = result.artworkUrl; img.alt = ""; img.loading = "lazy";
    (img as HTMLImageElement).decoding = "async"; img.className = "search-cover-img";
    img.addEventListener("error", () => { img.style.display = "none"; });
    coverWrap.appendChild(img);
  } else { coverWrap.style.background = `hsl(${hashHue(result.title)} 80% 60%)`; coverWrap.textContent = result.title.charAt(0).toUpperCase(); }
  const info = document.createElement("div"); info.className = "search-info";
  const t = document.createElement("div"); t.className = "search-title"; t.textContent = result.title;
  const sub = document.createElement("div"); sub.className = "search-sub mono small";
  sub.textContent = `${result.artist} · ${result.album ? result.album + " · " : ""}0:30 preview`;
  info.append(t, sub);
  const badge = document.createElement("span"); badge.className = "badge mono small"; badge.textContent = "0:30 preview";
  const actions = document.createElement("div"); actions.className = "search-actions";
  const prevBtn = document.createElement("button"); prevBtn.className = "btn pill small ghost";
  prevBtn.textContent = previewActive && activePreviewId === result.remoteId ? "Stop" : "Preview";
  prevBtn.addEventListener("click", (e) => { e.stopPropagation(); handlePreview(result); });
  const addEnd = document.createElement("button"); addEnd.className = "btn pill small primary"; addEnd.textContent = "Add to end";
  addEnd.addEventListener("click", (e) => { e.stopPropagation(); addRemoteSong(result, "end"); });
  const moreBtn = document.createElement("button"); moreBtn.className = "btn pill small ghost row-menu-btn search-more-btn"; moreBtn.innerHTML = dotsIcon(); moreBtn.setAttribute("aria-label", "More add options"); moreBtn.setAttribute("aria-haspopup", "menu"); moreBtn.setAttribute("aria-expanded", "false");
  moreBtn.addEventListener("click", (e) => { e.stopPropagation(); const isOpen = document.getElementById("searchMorePopover") !== null && moreBtn.getAttribute("aria-expanded") === "true"; if (isOpen) closeSearchMore(); else openSearchMore(e, result, moreBtn); });
  actions.append(prevBtn, addEnd, moreBtn);
  const left = document.createElement("div"); left.className = "search-left"; left.append(coverWrap, info);
  row.append(left, badge, actions);
  row.addEventListener("dragstart", (e) => {
    setDraggedRemote(result); row.classList.add("dragging");
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", result.remoteId); }
  });
  row.addEventListener("dragend", () => { row.classList.remove("dragging"); setDraggedRemote(null); });
  row.addEventListener("click", () => handlePreview(result));
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePreview(result); }
    else if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); addRemoteSong(result, "end"); }
  });
  return row;
}
function renderResults(results: SearchResult[]): void {
  const c = document.getElementById("searchResults"); const empty = document.getElementById("searchEmpty"); const err = document.getElementById("searchError");
  if (!c) return; err?.classList.add("hidden");
  if (results.length === 0) { c.innerHTML = ""; empty?.classList.remove("hidden"); return; }
  empty?.classList.add("hidden"); c.innerHTML = ""; results.forEach((r, i) => c.appendChild(buildRow(r, i)));
}
async function performSearch(term: string, chip: Chip): Promise<void> {
  const t = term.trim();
  if (t.length < 2) {
    if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
    currentResults = []; renderResults([]); showEmpty(t);
    updateCount(0, "Type at least 2 characters"); return;
  }
  const key = cacheKey(t, chip); const cached = cache.get(key);
  if (cached) {
    currentResults = cached; renderResults(cached); updateCount(cached.length, null);
    if (cached.length === 0) { const e = document.getElementById("searchEmpty"); if (e) { e.textContent = `No results for "${t}"`; e.classList.remove("hidden"); } }
    return;
  }
  if (abortCtrl) abortCtrl.abort(); abortCtrl = new AbortController();
  showSkeleton(); updateCount(null, "Loading…");
  try {
    const url = buildSearchUrl(t, chip);
    const resp = await fetch(url, { signal: abortCtrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    let json: unknown; try { json = await resp.json(); } catch { throw new Error("malformed JSON"); }
    const parsed = parseResults(json); cache.set(key, parsed);
    if (abortCtrl.signal.aborted) return;
    currentResults = parsed; renderResults(parsed); updateCount(parsed.length, null);
    if (parsed.length === 0) { const e = document.getElementById("searchEmpty"); if (e) { e.textContent = `No results for "${t}"`; e.classList.remove("hidden"); } }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    showError(e as Error); updateCount(null, "Error");
  }
}
function openPanel(): void {
  const p = document.getElementById("searchPanel"); if (!p) return;
  p.classList.remove("hidden"); p.setAttribute("aria-hidden", "false");
  (document.getElementById("searchOnlineInput") as HTMLInputElement | null)?.focus({ preventScroll: true } as FocusOptions);
  document.body.style.overflow = "hidden"; trapFocus(p);
}
function closePanel(): void {
  const p = document.getElementById("searchPanel"); if (!p) return;
  p.classList.add("hidden"); p.setAttribute("aria-hidden", "true"); document.body.style.overflow = "";
  if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  (document.getElementById("openSearchBtn") as HTMLElement | null)?.focus({ preventScroll: true } as FocusOptions);
}
function trapFocus(panel: HTMLElement): void {
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute("disabled"));
  if (focusable.length === 0) return;
  const first = focusable[0]!, last = focusable[focusable.length - 1]!;
  const h = (e: KeyboardEvent): void => {
    if (e.key !== "Tab") return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus({ preventScroll: true } as FocusOptions); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus({ preventScroll: true } as FocusOptions); }
  };
  panel.addEventListener("keydown", h);
  const obs = new MutationObserver(() => { if (panel.classList.contains("hidden")) { panel.removeEventListener("keydown", h); obs.disconnect(); } });
  obs.observe(panel, { attributes: true, attributeFilter: ["class"] });
}
function initKeyboardNav(): void {
  const c = document.getElementById("searchResults"); if (!c) return;
  c.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (currentResults.length === 0) return; e.preventDefault();
    if (e.key === "ArrowDown") focusedIdx = Math.min(focusedIdx + 1, currentResults.length - 1);
    else focusedIdx = Math.max(focusedIdx - 1, 0);
    if (focusedIdx < 0) focusedIdx = 0;
    const rows = Array.from(c.querySelectorAll<HTMLElement>(".search-result-row"));
    rows.forEach((r, i) => { r.classList.toggle("focused", i === focusedIdx); if (i === focusedIdx) r.focus({ preventScroll: true } as FocusOptions); });
  });
}
export function initSearchPanel(): void {
  const panel = document.getElementById("searchPanel");
  const input = document.getElementById("searchOnlineInput") as HTMLInputElement | null;
  const openBtn = document.getElementById("openSearchBtn");
  const closeBtn = document.getElementById("closeSearchPanel");
  if (!panel || !input) return;
  openBtn?.addEventListener("click", () => openPanel());
  closeBtn?.addEventListener("click", () => closePanel());
  panel.addEventListener("click", (e) => { if (e.target === panel) closePanel(); });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (panel.classList.contains("hidden")) openPanel(); else input.focus({ preventScroll: true } as FocusOptions); }
    if (e.key === "Escape" && !panel.classList.contains("hidden")) { e.preventDefault(); closePanel(); }
  });
  for (const chipEl of Array.from(document.querySelectorAll(".chip"))) {
    chipEl.addEventListener("click", () => {
      setChipActive((chipEl as HTMLElement).dataset["chip"] as Chip);
      if (input.value.trim().length >= 2) { if (debounceTimer) clearTimeout(debounceTimer); performSearch(input.value, getChip()); }
    });
  }
  input.addEventListener("input", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => performSearch(input.value, getChip()), 350);
  });
  input.addEventListener("keydown", (e) => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && currentResults.length > 0) {
      e.preventDefault(); focusedIdx = e.key === "ArrowDown" ? 0 : currentResults.length - 1;
      document.querySelectorAll<HTMLElement>("#searchResults .search-result-row")[focusedIdx]?.focus({ preventScroll: true } as FocusOptions);
    }
  });
  initKeyboardNav(); setChipActive("all");
}
export function __resetForTests(): void { cache.clear(); currentResults = []; focusedIdx = -1; previewActive = false; activePreviewId = null; previewSaved = null; }

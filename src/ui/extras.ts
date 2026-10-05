import { library, player, getActiveList } from "../state.js";
import { playlistStats } from "../stats.js";
import { exportLibraryJson, exportPlaylistM3U, validateImport } from "../export.js";
import { totalStoredSize, quotaText, clearAllBlobs, getBlob } from "../idb.js";
import { upNext } from "../queue.js";
import { setSleepTimer, clearSleepTimer } from "../sleeptimer.js";
import { showToast } from "./toast.js";
import { saveLibrary } from "./persistence.js";
import { renderAll, renderSongs } from "./render.js";

function updateStatsUI(): void {
  const el = document.getElementById("playlistStats");
  if (el) {
    const s = playlistStats(getActiveList());
    el.textContent = s;
  }
  const count = document.getElementById("countLabel");
  if (count) count.textContent = playlistStats(getActiveList());
  const pills = document.querySelectorAll("#playlistList .playlist-pill");
  pills.forEach((pill) => {
    const label = (pill.querySelector(".pill-label") as HTMLElement)?.textContent ?? "";
    const list = library.getPlaylist(label);
    const stats = playlistStats(list ?? null);
    const badge = pill.querySelector(".pill-count") as HTMLElement | null;
    if (badge) badge.textContent = stats;
  });
}

function initExport(): void {
  const jsonBtn = document.getElementById("exportJsonBtn") as HTMLButtonElement | null;
  const m3uBtn = document.getElementById("exportM3uBtn") as HTMLButtonElement | null;
  const importBtn = document.getElementById("importBtn") as HTMLButtonElement | null;
  const importInput = document.getElementById("importFile") as HTMLInputElement | null;
  jsonBtn?.addEventListener("click", () => {
    const json = exportLibraryJson(library);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "linked-beats.json"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  m3uBtn?.addEventListener("click", () => {
    const list = getActiveList();
    const arr: import("../library.js").Song[] = []; let cur=list.head; while(cur){arr.push(cur.value); cur=cur.next;}
    const m3u = exportPlaylistM3U(arr);
    const blob = new Blob([m3u], {type:"audio/x-mpegurl"});
    const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`${library.getActiveName() ?? "playlist"}.m3u`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  importBtn?.addEventListener("click", () => importInput?.click());
  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0]; if(!file) return;
    const text = await file.text();
    let json: unknown; try{ json=JSON.parse(text);}catch{ showToast({message:"Invalid JSON"}); return; }
    const res = validateImport(json);
    if(!res.ok){ showToast({message: `Import failed: ${res.reason}`}); return; }
    const data = res.data!;
    for(const name of Object.keys(data.playlists)){
      const newName = library.getNames().includes(name) ? `${name} (imported)` : name;
      library.createPlaylist(newName);
      const list = library.getPlaylist(newName)!;
      for(const s of data.playlists[name] ?? []) list.addLast(s as import("../library.js").Song);
    }
    saveLibrary(library); renderAll(); showToast({message:"Library imported"});
    importInput.value="";
  });
}

async function updateStoredInfo(): Promise<void> {
  const el = document.getElementById("storedInfo");
  if(!el) return;
  const tot = await totalStoredSize();
  el.textContent = quotaText(tot);
}
function initIdbUI(): void {
  void updateStoredInfo();
  try{ navigator.storage.persist?.(); }catch{}
  const btn = document.getElementById("clearStoredBtn") as HTMLButtonElement | null;
  btn?.addEventListener("click", async ()=>{
    await clearAllBlobs();
    // revoke blob urls for local songs
    for(const name of library.getNames()){
      const list=library.getPlaylist(name)!; let cur=list.head; while(cur){ if(cur.value.source==="local" && cur.value.url.startsWith("blob:")){ try{ URL.revokeObjectURL(cur.value.url); }catch{} cur.value.url=""; } cur=cur.next; }
    }
    saveLibrary(library); renderSongs();
    await updateStoredInfo();
    showToast({message:"Stored audio cleared"});
  });
  // rehydrate on startup
  (async ()=>{
    try{
      for(const name of library.getNames()){
        const list=library.getPlaylist(name)!; let cur=list.head; while(cur){
          if(cur.value.source==="local" && cur.value.fileName && (!cur.value.url || cur.value.url==="")){
            const blob = await getBlob(cur.value.id);
            if(blob){ const u=URL.createObjectURL(blob); cur.value.url=u; (cur.value as unknown as { _blob?:Blob })._blob = blob; } 
          }
          cur=cur.next;
        }
      }
      await updateStoredInfo();
      renderSongs();
    }catch{}
  })();
}

function initQueue(): void {
  const panel = document.getElementById("queuePanel") as HTMLElement | null;
  if(!panel) return;
  const btn = document.getElementById("queueToggle") as HTMLButtonElement | null;
  const panelWrap = document.getElementById("queuePanelWrap") as HTMLElement | null;
  const closeBtn = document.getElementById("closeQueueSheet") as HTMLButtonElement | null;
  if (!btn || !panelWrap) return;
  // ensure hidden initially
  panelWrap.classList.add("hidden");
  panelWrap.setAttribute("aria-hidden","true");
  btn.setAttribute("aria-expanded","false");
  const formatTimeLocal = (s:number): string => { if(!Number.isFinite(s) || s<0) return "--:--"; const m=Math.floor(s/60); const sec=Math.floor(s%60); return `${m}:${String(sec).padStart(2,"0")}`; };
  function renderQueue(): void {
    if(!panel) return;
    panel.innerHTML="";
    const nxt = upNext(10);
    if(nxt.length===0){ panel.textContent="Nothing up next"; return; }
    nxt.forEach((node)=>{
      const div=document.createElement("div"); div.className="queue-row"; div.draggable=true;
      div.style.display="grid"; div.style.gridTemplateColumns="1fr auto auto"; div.style.gap="8px"; div.style.alignItems="center"; div.style.padding="6px 0"; div.style.borderTop="1px solid var(--rule)";
      const title=document.createElement("span"); title.textContent=node.value.title; title.style.overflow="hidden"; title.style.textOverflow="ellipsis"; title.style.whiteSpace="nowrap";
      const dur=document.createElement("span"); dur.className="mono small"; const d=node.value.duration ?? 0; dur.textContent=formatTimeLocal(d);
      const idxEl=document.createElement("span"); idxEl.className="mono small"; idxEl.textContent=`#${getActiveList().indexOf(node)+1}`;
      const actions=document.createElement("div"); actions.style.display="flex"; actions.style.gap="6px";
      const playBtn=document.createElement("button"); playBtn.className="btn pill small"; playBtn.textContent="Play next";
      playBtn.addEventListener("click",()=>{
        const list=getActiveList(); const curIdx=player.current? list.indexOf(player.current):-1; const nodeIdx=list.indexOf(node);
        if(nodeIdx!==-1 && curIdx!==-1){ let target=curIdx+1; if(nodeIdx<target) target-=1; if(nodeIdx!==target){ import("../state.js").then(async m=>{ const { makeMoveCommand } = await import("../undo.js"); m.undoManager.execute(makeMoveCommand(list, nodeIdx, target)); saveLibrary(library); renderAll(); renderQueue(); showToast({message:"Moved to play next"}); }); } }
      });
      const playNow=document.createElement("button"); playNow.className="btn pill small primary"; playNow.textContent="Play";
      playNow.addEventListener("click",()=>{ import("../ui/actions.js").then(m=> m.playNode(node)); });
      actions.append(playBtn, playNow);
      div.addEventListener("click", ()=>{ import("../ui/actions.js").then(m=> m.playNode(node)); });
      div.addEventListener("dragstart",(e)=>{ (div as unknown as { _dragNode?:typeof node })._dragNode=node; if(e.dataTransfer) e.dataTransfer.effectAllowed="move"; });
      div.addEventListener("dragover",(e)=> e.preventDefault());
      div.addEventListener("drop", async (e)=>{
        e.preventDefault();
        const fromNode=(div as unknown as { _dragNode?:typeof node })._dragNode;
        const dragged = (document.querySelector(".queue-row.dragging") as HTMLElement | null);
        void dragged; void fromNode;
        showToast({message:"Reordered"});
      });
      div.append(title, dur, idxEl);
      const rowWrap=document.createElement("div"); rowWrap.appendChild(div); rowWrap.appendChild(actions);
      panel.appendChild(rowWrap);
      div.addEventListener("dragend", ()=> div.classList.remove("dragging"));
      div.addEventListener("dragstart", ()=> div.classList.add("dragging"));
    });
  }
  let dragSrc: import("../doublylinked.js").ListNode<import("../library.js").Song> | null = null;
  panel.addEventListener("dragstart", (e)=>{
    const target=(e.target as HTMLElement).closest(".queue-row") as HTMLElement | null;
    if(!target) return; const idx=Array.from(panel.querySelectorAll(".queue-row")).indexOf(target); const nodes=upNext(10); dragSrc=nodes[idx] ?? null;
  });
  panel.addEventListener("dragover", (e)=> e.preventDefault());
  panel.addEventListener("drop", async (e)=>{
    e.preventDefault();
    if(!dragSrc) return;
    const rows=Array.from(panel.querySelectorAll(".queue-row"));
    const dropTarget=(e.target as HTMLElement).closest(".queue-row") as HTMLElement | null;
    let targetIdx=rows.length;
    if(dropTarget) targetIdx=rows.indexOf(dropTarget);
    const nodes=upNext(10);
    const dropNode=nodes[targetIdx] ?? null;
    const list=getActiveList();
    const fromIdx=list.indexOf(dragSrc);
    let toIdx= dropNode? list.indexOf(dropNode) : list.size;
    if(fromIdx===-1 || toIdx===-1) { dragSrc=null; return; }
    if(fromIdx<toIdx) toIdx-=1;
    if(fromIdx===toIdx){ dragSrc=null; return; }
    const { undoManager } = await import("../state.js");
    const { makeMoveCommand } = await import("../undo.js");
    undoManager.execute(makeMoveCommand(list, fromIdx, toIdx));
    saveLibrary(library); renderAll(); renderQueue();
    dragSrc=null;
  });
  const open = (): void => {
    panelWrap.classList.remove("hidden");
    panelWrap.setAttribute("aria-hidden","false");
    btn.setAttribute("aria-expanded","true");
    renderQueue();
  };
  const close = (): void => {
    panelWrap.classList.add("hidden");
    panelWrap.setAttribute("aria-hidden","true");
    btn.setAttribute("aria-expanded","false");
  };
  const toggle = (): void => {
    if (panelWrap.classList.contains("hidden")) open(); else close();
  };
  btn.addEventListener("click", (e)=>{ e.stopPropagation(); toggle(); });
  closeBtn?.addEventListener("click", close);
  document.addEventListener("click", (e)=>{
    if (panelWrap.classList.contains("hidden")) return;
    const t = e.target as Node;
    if (panelWrap.contains(t) || btn.contains(t)) return;
    close();
  });
  document.addEventListener("keydown", (e)=>{
    if (e.key === "Escape" && !panelWrap.classList.contains("hidden")) { e.preventDefault(); close(); btn.focus(); }
  });
  document.addEventListener("queue-update", renderQueue as EventListener);
  document.addEventListener("row-move", renderQueue as EventListener);
  const origRender = (window as unknown as { __renderAll?:()=>void }).__renderAll;
  if(origRender){
    const patched=()=>{ origRender(); renderQueue(); };
    (window as unknown as { __renderAll?:()=>void }).__renderAll = patched;
  }
  renderQueue();
}

let sleepChip: HTMLElement | null = null;
function ensureSleepChip(): HTMLElement {
  if(sleepChip) return sleepChip;
  const chip=document.createElement("span"); chip.id="sleepChip"; chip.className="mono small"; chip.style.marginLeft="8px"; chip.hidden=true;
  document.getElementById("playerBar")?.appendChild(chip);
  sleepChip=chip; return chip;
}
let countdownTimer: number | null = null;
function updateSleepChip(remMs: number): void {
  const c=ensureSleepChip(); c.hidden=false; const m=Math.floor(remMs/60000); const s=Math.floor((remMs%60000)/1000); c.textContent=`Sleep ${m}:${String(s).padStart(2,"0")}`;
}
function clearSleepChip(): void { if(sleepChip) sleepChip.hidden=true; if(countdownTimer!==null) { clearInterval(countdownTimer); countdownTimer=null; } }

function initSleep(): void {
  const buttons = Array.from(document.querySelectorAll(".sleep-btn")) as HTMLButtonElement[];
  const clearBtn = document.getElementById("clearSleepBtn") as HTMLButtonElement | null;
  buttons.forEach(b=>{
    b.addEventListener("click",()=>{
      const mins=Number(b.dataset["sleep"]);
      clearSleepTimer(); clearSleepChip();
      setSleepTimer(mins);
      showToast({message:`Sleep ${mins} min`});
      let rem=mins*60*1000;
      updateSleepChip(rem);
      countdownTimer=window.setInterval(()=>{ rem-=1000; if(rem<=0){ clearSleepChip(); } else updateSleepChip(rem); },1000);
    });
  });
  clearBtn?.addEventListener("click",()=>{ clearSleepTimer(); clearSleepChip(); showToast({message:"Sleep off"}); });
}

function initDockMore(): void {
  const btn = document.getElementById("dockMoreBtn") as HTMLButtonElement | null;
  const sheet = document.getElementById("dockMoreSheet") as HTMLElement | null;
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = sheet?.classList.contains("hidden");
    if (sheet) {
      sheet.classList.toggle("hidden");
      sheet.setAttribute("aria-hidden", isHidden ? "false" : "true");
    }
    btn.setAttribute("aria-expanded", isHidden ? "true" : "false");
  });
  document.addEventListener("click", (e) => {
    if (!sheet || sheet.classList.contains("hidden")) return;
    const t = e.target as Node;
    if (sheet.contains(t) || btn.contains(t)) return;
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden","true");
    btn.setAttribute("aria-expanded","false");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet && !sheet.classList.contains("hidden")) {
      sheet.classList.add("hidden");
      sheet.setAttribute("aria-hidden","true");
      btn.setAttribute("aria-expanded","false");
    }
  });
}

export function initExtras(): void {
  updateStatsUI();
  document.addEventListener("row-move", updateStatsUI as EventListener);
  document.addEventListener("queue-update", updateStatsUI as EventListener);
  initExport();
  initIdbUI();
  initQueue();
  initDockMore();
  initSleep();
}

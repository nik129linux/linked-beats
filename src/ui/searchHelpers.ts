import { showToast } from "./toast.js";
import { getActiveList } from "../state.js";
import { library } from "../state.js";
import { saveLibrary } from "./persistence.js";
import { renderAll } from "./render.js";
import { pickAudioFile, buildAttribution } from "../archive.js";

function hashHue(s:string): number { let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h%360; }
function dotsIcon(): string { return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></svg>`; }

export function buildRowYtHelper(r: import("../ytsearch.js").YtResult, idx: number, focusedIdx: number): HTMLElement {
  const row = document.createElement("div"); row.className = "search-result-row"; row.tabIndex = 0; row.draggable = true; row.dataset["videoId"] = r.videoId; row.dataset["index"] = String(idx); row.setAttribute("role","option"); row.setAttribute("aria-label", `${r.cleanedTitle} by ${r.channel}`); if(idx===focusedIdx) row.classList.add("focused");
  const cw=document.createElement("div"); cw.className="search-cover"; const img=document.createElement("img"); img.src=r.thumbnail; img.alt=""; img.loading="lazy"; img.className="search-cover-img"; cw.appendChild(img);
  const info=document.createElement("div"); info.className="search-info"; const t=document.createElement("div"); t.className="search-title"; t.textContent=r.cleanedTitle; const sub=document.createElement("div"); sub.className="search-sub mono small"; const dur=r.duration? `${Math.floor(r.duration/60)}:${String(r.duration%60).padStart(2,"0")}`:""; sub.textContent=`${r.channel}${dur?" · "+dur:""}`; info.append(t,sub);
  const badge=document.createElement("span"); badge.className="badge mono small"; badge.textContent="FULL SONG";
  const actions=document.createElement("div"); actions.className="search-actions";
  const play=document.createElement("button"); play.className="btn pill small primary"; play.textContent="Play now";
  play.addEventListener("click",(e)=>{ e.stopPropagation(); const song: import("../library.js").Song={ id:crypto.randomUUID(), title:r.cleanedTitle, artist:r.channel, url:`https://www.youtube.com/watch?v=${r.videoId}`, source:"youtube", videoId:r.videoId, artworkUrl:r.thumbnail, duration:r.duration }; const list=getActiveList(); const node=list.addLast(song); saveLibrary(library); renderAll(); import("../engines.js").then(m=> m.playSongNode(node)); });
  const addEnd=document.createElement("button"); addEnd.className="btn pill small ghost"; addEnd.textContent="Add to end";
  addEnd.addEventListener("click",(e)=>{ e.stopPropagation(); const song: import("../library.js").Song={ id:crypto.randomUUID(), title:r.cleanedTitle, artist:r.channel, url:`https://www.youtube.com/watch?v=${r.videoId}`, source:"youtube", videoId:r.videoId, artworkUrl:r.thumbnail, duration:r.duration }; getActiveList().addLast(song); saveLibrary(library); renderAll(); showToast({message:`Added "${r.cleanedTitle}"`}); });
  const moreBtn=document.createElement("button"); moreBtn.className="btn pill small ghost row-menu-btn search-more-btn"; moreBtn.innerHTML=dotsIcon(); moreBtn.setAttribute("aria-label","More add options");
  moreBtn.addEventListener("click",(e)=>{ e.stopPropagation(); // reuse popover logic
    const existing=document.getElementById("searchMorePopover") as HTMLElement | null; if(existing) existing.remove();
    const pop=document.createElement("div"); pop.id="searchMorePopover"; pop.className="popover row-popover"; const acts=[{label:"Add to start",fn:()=>{ const s: import("../library.js").Song={ id:crypto.randomUUID(), title:r.cleanedTitle, artist:r.channel, url:`https://www.youtube.com/watch?v=${r.videoId}`, source:"youtube", videoId:r.videoId, artworkUrl:r.thumbnail, duration:r.duration }; getActiveList().insertAt(0,s); saveLibrary(library); renderAll(); showToast({message:`Added "${r.cleanedTitle}"`}); }},{label:"Add after current",fn:()=>{ const list=getActiveList(); let idx=list.size; if((library as unknown as { getActiveList:()=>import("../doublylinked.js").DoublyLinkedList<import("../library.js").Song> }).getActiveList) void 0; const cur=(library as unknown as never); void cur; const p= (globalThis as unknown as { __player?: { current?: import("../doublylinked.js").ListNode<import("../library.js").Song>}}).__player; void p; import("../state.js").then(st=>{ let at=st.getActiveList().size; if(st.player.current){ const c=st.getActiveList().indexOf(st.player.current); at=c!==-1?c+1:at; } const song: import("../library.js").Song={ id:crypto.randomUUID(), title:r.cleanedTitle, artist:r.channel, url:`https://www.youtube.com/watch?v=${r.videoId}`, source:"youtube", videoId:r.videoId, artworkUrl:r.thumbnail, duration:r.duration }; st.getActiveList().insertAt(at,song); saveLibrary(library); renderAll(); }); }}];
    for(const a of acts){ const b=document.createElement("button"); b.className="popover-item"; b.textContent=a.label; b.addEventListener("click",()=>{ pop.remove(); a.fn(); }); pop.appendChild(b); }
    document.body.appendChild(pop); const rect=moreBtn.getBoundingClientRect(); const pr=pop.getBoundingClientRect(); let left=rect.left-pr.width+rect.width; if(left<8) left=8; let top=rect.bottom+6; if(top+pr.height>window.innerHeight-8) top=rect.top-pr.height-6; pop.style.left=`${left}px`; pop.style.top=`${top}px`;
    setTimeout(()=> document.addEventListener("click", function h(ev){ if(!pop.contains((ev.target as Node)) && ev.target!==moreBtn){ pop.remove(); document.removeEventListener("click", h); } }), 10);
  });
  actions.append(play,addEnd,moreBtn);
  const left=document.createElement("div"); left.className="search-left"; left.append(cw,info); row.append(left,badge,actions);
  // keyboard: Enter play, Shift+Enter add
  row.addEventListener("keydown",(e)=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); play.click(); } else if(e.key==="Enter" && e.shiftKey){ e.preventDefault(); addEnd.click(); } });
  return row;
}
export function buildRowArchiveHelper(item: { id:string; title:string; creator:string; license:string }): HTMLElement {
  const row=document.createElement("div"); row.className="search-result-row"; row.tabIndex=0; row.draggable=true; row.setAttribute("role","option"); row.setAttribute("aria-label", `${item.title} by ${item.creator}`);
  const cw=document.createElement("div"); cw.className="search-cover"; cw.style.background=`hsl(${hashHue(item.title)} 80% 60%)`; cw.textContent=item.title.charAt(0).toUpperCase();
  const info=document.createElement("div"); info.className="search-info"; const t=document.createElement("div"); t.className="search-title"; t.textContent=item.title; const sub=document.createElement("div"); sub.className="search-sub mono small"; sub.textContent=item.creator; info.append(t,sub);
  const badge=document.createElement("span"); badge.className="badge mono small"; badge.textContent=item.license;
  const actions=document.createElement("div"); actions.className="search-actions";
  const playNow=document.createElement("button"); playNow.className="btn pill small primary"; playNow.textContent="Play now";
  playNow.addEventListener("click",(e)=>{ e.stopPropagation(); fetch(`https://archive.org/metadata/${item.id}`).then(r=>r.json()).then(j=>{ const files=j.files as {name:string;format:string}[]; const best=pickAudioFile(files); if(!best){ showToast({message:"No audio"}); return; } const url=`https://archive.org/download/${item.id}/${best.name}`; const song: import("../library.js").Song={ id:crypto.randomUUID(), title:item.title, artist:item.creator, url, source:"remote", license:item.license, attribution: buildAttribution(item.title,item.creator,item.license)}; const list=getActiveList(); const node=list.addLast(song); saveLibrary(library); renderAll(); import("../engines.js").then(m=> m.playSongNode(node)); }); });
  const addEnd=document.createElement("button"); addEnd.className="btn pill small ghost"; addEnd.textContent="Add to end";
  addEnd.addEventListener("click",(e)=>{ e.stopPropagation(); fetch(`https://archive.org/metadata/${item.id}`).then(r=>r.json()).then(j=>{ const files=j.files as {name:string;format:string}[]; const best=pickAudioFile(files); if(!best){ showToast({message:"No audio"}); return; } const url=`https://archive.org/download/${item.id}/${best.name}`; const song: import("../library.js").Song={ id:crypto.randomUUID(), title:item.title, artist:item.creator, url, source:"remote", license:item.license, attribution: buildAttribution(item.title,item.creator,item.license)}; getActiveList().addLast(song); saveLibrary(library); renderAll(); showToast({message:`Added "${item.title}"`}); }); });
  const moreBtn=document.createElement("button"); moreBtn.className="btn pill small ghost row-menu-btn search-more-btn"; moreBtn.innerHTML=dotsIcon(); moreBtn.setAttribute("aria-label","More");
  moreBtn.addEventListener("click",(e)=>{
    e.stopPropagation();
    document.getElementById("searchMorePopover")?.remove();
    const pop=document.createElement("div"); pop.id="searchMorePopover"; pop.className="popover row-popover";
    const acts=[{label:"Add to start",fn:()=>{ fetch(`https://archive.org/metadata/${item.id}`).then(r=>r.json()).then(j=>{ const files=j.files as {name:string;format:string}[]; const best=pickAudioFile(files); if(!best) return; const url=`https://archive.org/download/${item.id}/${best.name}`; const song: import("../library.js").Song={ id:crypto.randomUUID(), title:item.title, artist:item.creator, url, source:"remote", license:item.license, attribution: buildAttribution(item.title,item.creator,item.license)}; getActiveList().insertAt(0,song); saveLibrary(library); renderAll(); }); }},{label:"Add after current",fn:()=>{ import("../state.js").then(st=>{ fetch(`https://archive.org/metadata/${item.id}`).then(r=>r.json()).then(j=>{ const files=j.files as {name:string;format:string}[]; const best=pickAudioFile(files); if(!best) return; const url=`https://archive.org/download/${item.id}/${best.name}`; const song: import("../library.js").Song={ id:crypto.randomUUID(), title:item.title, artist:item.creator, url, source:"remote", license:item.license, attribution: buildAttribution(item.title,item.creator,item.license)}; let at=st.getActiveList().size; if(st.player.current){ const c=st.getActiveList().indexOf(st.player.current); at=c!==-1?c+1:at; } st.getActiveList().insertAt(at,song); saveLibrary(library); renderAll(); }); }); }}];
    for(const a of acts){ const b=document.createElement("button"); b.className="popover-item"; b.textContent=a.label; b.addEventListener("click",()=>{ pop.remove(); a.fn();}); pop.appendChild(b); }
    document.body.appendChild(pop); const rect=moreBtn.getBoundingClientRect(); const pr=pop.getBoundingClientRect(); let left=rect.left-pr.width+rect.width; if(left<8) left=8; let top=rect.bottom+6; if(top+pr.height>window.innerHeight-8) top=rect.top-pr.height-6; pop.style.left=`${left}px`; pop.style.top=`${top}px`;
    setTimeout(()=> document.addEventListener("click", function h(ev){ if(!pop.contains((ev.target as Node)) && ev.target!==moreBtn){ pop.remove(); document.removeEventListener("click",h);} }),10);
  });
  actions.append(playNow, addEnd, moreBtn);
  const left=document.createElement("div"); left.className="search-left"; left.append(cw,info);
  row.append(left,badge,actions);
  return row;
}

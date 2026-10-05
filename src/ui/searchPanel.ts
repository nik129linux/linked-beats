import { buildSearchUrl, parseResults, SearchCache, cacheKey, Chip, SearchResult } from "../search.js";
import { audioEl } from "./dom.js";
import { addRemoteSong } from "./actions.js";
import { setDraggedRemote } from "../state.js";
import { searchYouTubePiped, YtCache, cleanYoutubeTitle, splitYoutubeTitle } from "../ytsearch.js";
import { buildArchiveSearchUrl, parseLicense, pickAudioFile, buildAttribution } from "../archive.js";
import { classifyUrl } from "../links.js";
import { showToast } from "./toast.js";
import { library, getActiveList, player } from "../state.js";
import { renderAll } from "./render.js";
import { saveLibrary } from "./persistence.js";
import { buildRowYtHelper, buildRowArchiveHelper } from "./searchHelpers.js";

let cache = new SearchCache();
let ytCache = new YtCache();
let abortCtrl: AbortController | null = null;
let debounceTimer: number | null = null;
let currentResults: SearchResult[] = [];
let currentYt: import("../ytsearch.js").YtResult[] = [];
let currentArchive: { id:string; title:string; creator:string; license:string }[] = [];
let focusedIdx = -1;
let activePreviewId: string | null = null;
let previewSaved: { src:string; time:number } | null = null;
let previewActive = false;
let previewEnded: (()=>void) | null = null;
export function isPreviewActive(): boolean { return previewActive; }
type Source = "youtube"|"itunes"|"free";
function getSource(): Source { try{ const s=localStorage.getItem("lb.source") as Source | null; if(s==="youtube"||s==="itunes"||s==="free") return s; }catch{} return "youtube"; }
function setSource(s:Source): void { try{ localStorage.setItem("lb.source",s);}catch{} updateSourceUI(s); }
function updateSourceUI(s:Source): void {
  for(const el of Array.from(document.querySelectorAll(".source-chip"))){ const v=(el as HTMLElement).dataset["source"] as Source; const a=v===s; el.classList.toggle("active",a); el.setAttribute("aria-pressed",String(a)); }
  const inp=document.getElementById("searchOnlineInput") as HTMLInputElement | null;
  if(inp){ if(s==="youtube") inp.placeholder="Search YouTube..."; else if(s==="itunes") inp.placeholder="Search iTunes..."; else inp.placeholder="Search Free Music..."; }
}
function getChip(): Chip { const a=document.querySelector(".chip.active") as HTMLElement | null; const v=a?.dataset["chip"] as Chip | undefined; return v==="artist"||v==="song"?v:"all"; }
function setChipActive(chip:Chip): void { for(const el of Array.from(document.querySelectorAll(".chip"))){ if((el as HTMLElement).dataset["chip"]===undefined) continue; if((el as HTMLElement).dataset["source"]!==undefined) continue; el.classList.toggle("active",(el as HTMLElement).dataset["chip"]===chip); el.setAttribute("aria-pressed",String((el as HTMLElement).dataset["chip"]===chip)); } }
function updateCount(c:number|null,m:string|null): void { const el=document.getElementById("searchResultCount"); if(!el) return; el.textContent=c!==null?`${c} result${c!==1?"s":""}`:m??""; }
function showSkeleton(): void { const c=document.getElementById("searchResults"); if(!c) return; c.innerHTML=""; for(let i=0;i<3;i++){ const r=document.createElement("div"); r.className="search-skeleton-row"; r.innerHTML=`<div class="skel-cover"></div><div class="skel-lines"><span></span><span></span></div>`; c.appendChild(r);} document.getElementById("searchError")?.classList.add("hidden"); document.getElementById("searchEmpty")?.classList.add("hidden"); }
function showEmpty(term:string): void { const c=document.getElementById("searchResults"); if(c) c.innerHTML=""; const e=document.getElementById("searchEmpty"); if(e){ e.textContent=term?`No results for "${term}"`:"Type to search"; e.classList.remove("hidden"); } document.getElementById("searchError")?.classList.add("hidden"); }
function showError(err:Error, term:string): void { const c=document.getElementById("searchResults"); if(c) c.innerHTML=""; const e=document.getElementById("searchError"); if(!e) return; e.classList.remove("hidden"); e.innerHTML=""; const isYt=getSource()==="youtube"; if(isYt){ const span=document.createElement("span"); span.textContent=err.message==="No results"?"YouTube search is not responding right now (the free search servers are down). Paste a YouTube link above and press Enter, or add your own API key.":`Search failed: ${err.message}`; e.append(span); const b1=document.createElement("button"); b1.className="btn pill primary small"; b1.textContent="Use my own API key"; b1.addEventListener("click",()=>{ const k=prompt("Paste YouTube API key (stored locally):")??""; if(k.trim()){ try{ localStorage.setItem("lb.ytkey",k.trim()); }catch{} showToast({message:"Key saved"});} }); const b2=document.createElement("button"); b2.className="btn pill small"; b2.textContent="Paste a link instead"; b2.addEventListener("click",()=> (document.getElementById("linkInput") as HTMLInputElement | null)?.focus()); e.append(b1,b2); } else { const msg=document.createElement("span"); msg.textContent=err.message.includes("HTTP")?`Error: ${err.message}`:`Search failed: ${err.message}`; const btn=document.createElement("button"); btn.className="btn pill primary small"; btn.textContent="Retry"; btn.addEventListener("click",()=>{ const inp=document.getElementById("searchOnlineInput") as HTMLInputElement | null; performSearch(inp?.value ?? "", getChip()); }); e.append(msg,btn); } document.getElementById("searchEmpty")?.classList.add("hidden"); void term; }
function stopPreview(): void { if(!previewActive) return; previewActive=false; activePreviewId=null; if(previewEnded){ audioEl.removeEventListener("ended",previewEnded); previewEnded=null;} audioEl.pause(); if(previewSaved){ if(previewSaved.src){ audioEl.crossOrigin="anonymous"; audioEl.src=previewSaved.src; try{ audioEl.currentTime=previewSaved.time;}catch{} } else { audioEl.removeAttribute("src"); audioEl.load(); } previewSaved=null; } else { audioEl.removeAttribute("src"); audioEl.load(); } renderCurrent(); }
export function stopPreviewIfPlaying(): void { if(previewActive) stopPreview(); }
function handlePreview(r:SearchResult): void { if(previewActive && activePreviewId===r.remoteId){ stopPreview(); return; } if(!previewActive) previewSaved={ src:audioEl.src, time:audioEl.currentTime }; else if(previewEnded){ audioEl.removeEventListener("ended",previewEnded); previewEnded=null; } previewActive=true; activePreviewId=r.remoteId; audioEl.crossOrigin="anonymous"; audioEl.src=r.previewUrl; audioEl.play().catch(()=>{}); previewEnded=()=>stopPreview(); audioEl.addEventListener("ended",previewEnded,{once:true}); renderCurrent(); }
function hashHue(s:string): number { let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h%360; }
function closeSearchMore(): void { document.getElementById("searchMorePopover")?.remove(); document.querySelectorAll(".search-more-btn").forEach(b=> b.setAttribute("aria-expanded","false")); }
function openSearchMore(e:MouseEvent,result:SearchResult,anchor:HTMLElement): void { closeSearchMore(); document.getElementById("rowMenuPopover")?.remove(); const pop=document.createElement("div"); pop.id="searchMorePopover"; pop.className="popover row-popover"; pop.setAttribute("role","menu"); const items: Array<{label:string;action:()=>void}>=[{label:"Add to start",action:()=> addRemoteSong(result,"start")},{label:"Add after current",action:()=> addRemoteSong(result,"afterCurrent")}]; for(const it of items){ const btn=document.createElement("button"); btn.className="popover-item"; btn.textContent=it.label; btn.setAttribute("role","menuitem"); btn.addEventListener("click",()=>{ closeSearchMore(); it.action(); }); pop.appendChild(btn); } const rect=anchor.getBoundingClientRect(); document.body.appendChild(pop); const pr=pop.getBoundingClientRect(); let left=rect.left-pr.width+rect.width; if(left<8) left=8; if(left+pr.width>window.innerWidth-8) left=window.innerWidth-pr.width-8; let top=rect.bottom+6; if(top+pr.height>window.innerHeight-8) top=rect.top-pr.height-6; pop.style.left=`${left}px`; pop.style.top=`${top}px`; anchor.setAttribute("aria-expanded","true"); const first=pop.querySelector("button") as HTMLElement | null; first?.focus({preventScroll:true} as FocusOptions); const onKey=(ev:KeyboardEvent):void=>{ if(ev.key==="Escape"){ closeSearchMore(); document.removeEventListener("keydown",onKey); anchor.focus({preventScroll:true} as FocusOptions);} if(ev.key==="ArrowDown"||ev.key==="ArrowUp"){ ev.preventDefault(); const btns=Array.from(pop.querySelectorAll("button")) as HTMLElement[]; const idx2=btns.indexOf(document.activeElement as HTMLElement); const nxt=ev.key==="ArrowDown"?(idx2+1)%btns.length:(idx2-1+btns.length)%btns.length; btns[nxt]?.focus({preventScroll:true} as FocusOptions);} }; document.addEventListener("keydown",onKey); const closeOutside=(ev:MouseEvent):void=>{ if(!pop.contains(ev.target as Node) && !anchor.contains(ev.target as Node)){ closeSearchMore(); document.removeEventListener("click",closeOutside); document.removeEventListener("keydown",onKey);} }; setTimeout(()=> document.addEventListener("click",closeOutside),10); }
function dotsIcon(): string { return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></svg>`; }
function buildRowItunes(result:SearchResult,idx:number): HTMLElement {
  const row=document.createElement("div"); row.className="search-result-row"; row.tabIndex=0; row.draggable=true; row.dataset["remoteId"]=result.remoteId; row.dataset["index"]=String(idx); row.setAttribute("role","option"); row.setAttribute("aria-label",`${result.title} by ${result.artist}`); if(idx===focusedIdx) row.classList.add("focused");
  const cw=document.createElement("div"); cw.className="search-cover"; if(result.artworkUrl){ const img=document.createElement("img"); img.src=result.artworkUrl; img.alt=""; img.loading="lazy"; (img as HTMLImageElement).decoding="async"; img.className="search-cover-img"; img.addEventListener("error",()=>{img.style.display="none";}); cw.appendChild(img);} else { cw.style.background=`hsl(${hashHue(result.title)} 80% 60%)`; cw.textContent=result.title.charAt(0).toUpperCase(); }
  const info=document.createElement("div"); info.className="search-info"; const t=document.createElement("div"); t.className="search-title"; t.textContent=result.title; const sub=document.createElement("div"); sub.className="search-sub mono small"; sub.textContent=`${result.artist} · ${result.album?result.album+" · ":""}0:30 preview`; info.append(t,sub);
  const badge=document.createElement("span"); badge.className="badge mono small"; badge.textContent="30S PREVIEW";
  const actions=document.createElement("div"); actions.className="search-actions"; const playBtn=document.createElement("button"); playBtn.className="btn pill small primary"; playBtn.textContent="Play now"; playBtn.addEventListener("click",(e)=>{ e.stopPropagation(); import("./actions.js").then(m=>{ const song=m.createRemoteSong(result); const list=getActiveList(); let n; try{ n=list.insertAt(list.size,song);}catch{ n=list.addLast(song);} import("../engines.js").then(en=> en.playSongNode(n)); }); }); const addEnd=document.createElement("button"); addEnd.className="btn pill small ghost"; addEnd.textContent="Add to end"; addEnd.addEventListener("click",(e)=>{ e.stopPropagation(); addRemoteSong(result,"end"); }); const moreBtn=document.createElement("button"); moreBtn.className="btn pill small ghost row-menu-btn search-more-btn"; moreBtn.innerHTML=dotsIcon(); moreBtn.setAttribute("aria-label","More add options"); moreBtn.addEventListener("click",(e)=>{ e.stopPropagation(); const isOpen=document.getElementById("searchMorePopover")!==null && moreBtn.getAttribute("aria-expanded")==="true"; if(isOpen) closeSearchMore(); else openSearchMore(e as MouseEvent,result,moreBtn); }); actions.append(playBtn,addEnd,moreBtn);
  const left=document.createElement("div"); left.className="search-left"; left.append(cw,info); row.append(left,badge,actions);
  row.addEventListener("dragstart",(e)=>{ setDraggedRemote(result); row.classList.add("dragging"); if(e.dataTransfer){ e.dataTransfer.effectAllowed="copy"; e.dataTransfer.setData("text/plain",result.remoteId);} }); row.addEventListener("dragend",()=>{ row.classList.remove("dragging"); setDraggedRemote(null); }); row.addEventListener("click",()=> handlePreview(result)); row.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); handlePreview(result);} else if(e.key==="Enter"&&e.shiftKey){ e.preventDefault(); addRemoteSong(result,"end"); } });
  return row;
}
function renderCurrent(): void {
  const c=document.getElementById("searchResults"); const empty=document.getElementById("searchEmpty"); const err=document.getElementById("searchError"); if(!c) return; err?.classList.add("hidden");
  const src=getSource();
  if(src==="youtube"){ if(currentYt.length===0){ c.innerHTML=""; empty?.classList.remove("hidden"); return; } empty?.classList.add("hidden"); c.innerHTML=""; currentYt.forEach((r,i)=> c.appendChild(buildRowYtHelper(r,i,focusedIdx))); return; }
  if(src==="free"){ if(currentArchive.length===0){ c.innerHTML=""; empty?.classList.remove("hidden"); return; } empty?.classList.add("hidden"); c.innerHTML=""; currentArchive.forEach((r)=> c.appendChild(buildRowArchiveHelper(r))); return; }
  if(currentResults.length===0){ c.innerHTML=""; empty?.classList.remove("hidden"); return; }
  empty?.classList.add("hidden"); c.innerHTML=""; currentResults.forEach((r,i)=> c.appendChild(buildRowItunes(r,i)));
}
async function performSearch(term:string,chip:Chip): Promise<void> {
  const src=getSource(); const t=term.trim();
  if(t.length<2){ if(abortCtrl){ abortCtrl.abort(); abortCtrl=null; } currentResults=[]; currentYt=[]; currentArchive=[]; renderCurrent(); showEmpty(t); updateCount(0,"Type at least 2 characters"); return; }
  if(src==="itunes"){ const key=cacheKey(t,chip); const cached=cache.get(key); if(cached){ currentResults=cached; renderCurrent(); updateCount(cached.length,null); if(cached.length===0){ const e=document.getElementById("searchEmpty"); if(e){ e.textContent=`No results for "${t}"`; e.classList.remove("hidden"); } } return; } }
  if(src==="youtube"){ const cached=ytCache.get(t.toLowerCase().trim()); if(cached){ currentYt=cached; renderCurrent(); updateCount(cached.length,null); return; } }
  if(abortCtrl) abortCtrl.abort(); abortCtrl=new AbortController(); showSkeleton(); updateCount(null,"Loading…");
  try{
     if(src==="youtube"){ const res=await searchYouTubePiped(t, fetch, ytCache); if(abortCtrl.signal.aborted) return; currentYt=res; renderCurrent(); updateCount(res.length,null); if(res.length===0) showError(new Error("No results"),t); }
     else if(src==="free"){ const url=buildArchiveSearchUrl(t); const resp=await fetch(url,{signal:abortCtrl.signal}); if(!resp.ok) throw new Error(`HTTP ${resp.status}`); const json=await resp.json() as { response:{ docs:{ identifier:string; title:string | string[]; creator?:string | string[]; licenseurl?:string }[] }}; const docs=json.response?.docs ?? [];      const mapped=docs.map(d=>{
       const tit = typeof d.title==="string"? d.title : Array.isArray(d.title)? (d.title[0] ?? d.identifier) : d.identifier;
       let creat: string; if(Array.isArray(d.creator)) creat = (d.creator[0] as string) ?? "Unknown"; else if(typeof d.creator==="string") creat = d.creator; else creat = "Unknown";
       let lic = parseLicense(d.licenseurl ?? ""); if(lic==="Unknown") lic="CC";
       return { id:d.identifier, title: tit, creator: creat, license: lic };
     }); if(abortCtrl.signal.aborted) return; currentArchive=mapped; renderCurrent(); updateCount(mapped.length,null); if(mapped.length===0) showError(new Error("No results"),t); }
    else { const url=buildSearchUrl(t,chip); const resp=await fetch(url,{signal:abortCtrl.signal}); if(!resp.ok) throw new Error(`HTTP ${resp.status}`); let json: unknown; try{ json=await resp.json(); }catch{ throw new Error("malformed JSON"); } const parsed=parseResults(json); cache.set(cacheKey(t,chip),parsed); if(abortCtrl.signal.aborted) return; currentResults=parsed; renderCurrent(); updateCount(parsed.length,null); if(parsed.length===0){ const e=document.getElementById("searchEmpty"); if(e){ e.textContent=`No results for "${t}"`; e.classList.remove("hidden"); } } }
  }catch(e){ if((e as Error).name==="AbortError") return; showError(e as Error,t); updateCount(null,"Error"); }
}
let searchOpener: HTMLElement | null = null;
function openPanel(): void { const p=document.getElementById("searchPanel"); if(!p) return; searchOpener=document.activeElement as HTMLElement | null; p.classList.remove("hidden"); p.setAttribute("aria-hidden","false"); (document.getElementById("searchOnlineInput") as HTMLInputElement | null)?.focus({preventScroll:true} as FocusOptions); document.body.style.overflow="hidden"; trapFocus(p); }
function closePanel(): void { const p=document.getElementById("searchPanel"); if(!p) return; p.classList.add("hidden"); p.setAttribute("aria-hidden","true"); document.body.style.overflow=""; if(abortCtrl){ abortCtrl.abort(); abortCtrl=null; } if(debounceTimer){ clearTimeout(debounceTimer); debounceTimer=null; } const opener=searchOpener ?? (document.getElementById("openSearchBtn") as HTMLElement | null); if(opener) opener.focus({preventScroll:true} as FocusOptions); searchOpener=null; }
function trapFocus(panel:HTMLElement): void { const focusable=Array.from(panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el=> !el.hasAttribute("disabled")); if(focusable.length===0) return; const first=focusable[0]!, last=focusable[focusable.length-1]!; const h=(e:KeyboardEvent):void=>{ if(e.key!=="Tab") return; if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus({preventScroll:true} as FocusOptions);} else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus({preventScroll:true} as FocusOptions);} }; panel.addEventListener("keydown",h); const obs=new MutationObserver(()=>{ if(panel.classList.contains("hidden")){ panel.removeEventListener("keydown",h); obs.disconnect(); }}); obs.observe(panel,{attributes:true, attributeFilter:["class"]}); }
function initKeyboardNav(): void { const c=document.getElementById("searchResults"); if(!c) return; c.addEventListener("keydown",(e)=>{
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    if(currentResults.length===0 && currentYt.length===0 && currentArchive.length===0) return;
    e.preventDefault(); const total=getSource()==="youtube"? currentYt.length : getSource()==="free"? currentArchive.length : currentResults.length;
    if(e.key==="ArrowDown") focusedIdx=Math.min(focusedIdx+1,total-1); else focusedIdx=Math.max(focusedIdx-1,0);
    if(focusedIdx<0) focusedIdx=0; const rows=Array.from(c.querySelectorAll<HTMLElement>(".search-result-row"));
    rows.forEach((r,i)=>{ r.classList.toggle("focused",i===focusedIdx); if(i===focusedIdx) r.focus({preventScroll:true} as FocusOptions); });
    return;
  }
  if(e.key==="Enter"){
    const src=getSource();
    if(src==="youtube" && focusedIdx>=0 && focusedIdx<currentYt.length){
      e.preventDefault();
      const r=currentYt[focusedIdx]!;
      if(e.shiftKey){
        const song: import("../library.js").Song={ id:crypto.randomUUID(), title:r.cleanedTitle, artist:r.channel, url:`https://www.youtube.com/watch?v=${r.videoId}`, source:"youtube", videoId:r.videoId, artworkUrl:r.thumbnail, duration:r.duration };
        getActiveList().addLast(song); saveLibrary(library); renderAll(); showToast({message:`Added "${r.cleanedTitle}"`});
      } else {
        const song: import("../library.js").Song={ id:crypto.randomUUID(), title:r.cleanedTitle, artist:r.channel, url:`https://www.youtube.com/watch?v=${r.videoId}`, source:"youtube", videoId:r.videoId, artworkUrl:r.thumbnail, duration:r.duration };
        const list=getActiveList(); const node=list.addLast(song); saveLibrary(library); renderAll(); import("../engines.js").then(m=> m.playSongNode(node));
      }
      return;
    }
    if(src==="itunes" && focusedIdx>=0 && focusedIdx<currentResults.length){
      e.preventDefault(); const r=currentResults[focusedIdx]!;
      if(e.shiftKey) addRemoteSong(r,"end"); else handlePreview(r);
      return;
    }
    if(src==="free" && focusedIdx>=0 && focusedIdx<currentArchive.length){
      e.preventDefault(); const item=currentArchive[focusedIdx]!;
      // for free, Enter = Add to end, Shift+Enter also add
      fetch(`https://archive.org/metadata/${item.id}`).then(r=>r.json()).then(j=>{ const files=j.files as {name:string;format:string}[]; const best=pickAudioFile(files); if(!best) return; const url=`https://archive.org/download/${item.id}/${best.name}`; const song: import("../library.js").Song={ id:crypto.randomUUID(), title:item.title, artist:item.creator, url, source:"remote", license:item.license, attribution: buildAttribution(item.title,item.creator,item.license)}; getActiveList().addLast(song); saveLibrary(library); renderAll(); });
      return;
    }
  }
}); }
function initLinkHandling(): void {
  const input=document.getElementById("linkInput") as HTMLInputElement | null;
  const feedback=document.getElementById("linkFeedback") as HTMLElement | null;
  if(!input) return;
  let addBtn=document.getElementById("addLinkBtn") as HTMLButtonElement | null;
  if(!addBtn){ addBtn=document.createElement("button"); addBtn.id="addLinkBtn"; addBtn.className="btn pill small primary"; addBtn.textContent="Add link"; addBtn.type="button"; input.after(addBtn); }
  const doHandle=async (val:string):Promise<void>=>{
    const url=val.trim(); const fb=document.getElementById("linkFeedback") as HTMLElement | null;
    if(!url){ if(fb){ fb.textContent="Enter a URL"; fb.classList.remove("hidden"); } return; }
    const cls=classifyUrl(url);
    if(cls.kind==="invalid"){ if(fb){ fb.textContent="Link is invalid or uses a blocked scheme (javascript:, data:, file:)"; fb.classList.remove("hidden"); } return; }
    if(cls.kind==="unsupported"){ if(fb){ fb.textContent="This link type is not supported here"; fb.classList.remove("hidden"); } return; }
    if(fb){ fb.textContent="Looking up..."; fb.classList.remove("hidden"); }
    try{
      if(cls.kind==="youtube" && cls.videoId){
        const vid=cls.videoId; let title=vid; let author=""; try{ const r=await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`); if(r.ok){ const j=await r.json() as {title?:string; author_name?:string}; if(j.title) title=j.title; if(j.author_name) author=j.author_name; } }catch{}
        // also try noembed fallback if oembed fails to get title
        if(title===vid){ try{ const r2=await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${vid}`); if(r2.ok){ const j2=await r2.json() as {title?:string; author_name?:string}; if(j2.title) title=j2.title; if(j2.author_name) author=j2.author_name; } }catch{} }
        let cleaned=cleanYoutubeTitle(title, author);
        let finalArtist=author || undefined;
        if(author && title.toLowerCase().startsWith(author.toLowerCase()+" - ")){ const sp=splitYoutubeTitle(title, author); cleaned=sp.title; finalArtist=sp.artist; }
        const song: import("../library.js").Song={ id:crypto.randomUUID(), title: cleaned, artist: finalArtist, url:`https://www.youtube.com/watch?v=${vid}`, source:"youtube", videoId:vid, artworkUrl:`https://i.ytimg.com/vi/${vid}/mqdefault.jpg`, duration:0 };
        getActiveList().addLast(song); saveLibrary(library); renderAll(); const fb2=document.getElementById("linkFeedback") as HTMLElement | null; if(fb2) fb2.textContent=`Added "${cleaned}"`; input.value="";
      } else if(cls.kind==="spotify"){
        const fb2=document.getElementById("linkFeedback") as HTMLElement | null; if(fb2) fb2.textContent="Spotify links can't be played here. Pick the match:";
        let title=""; try{ const r=await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`); if(r.ok){ const j=await r.json() as {title?:string}; title=j.title ?? ""; }}catch{}
        const q=title || url;
        try{
          const yt=await searchYouTubePiped(q, fetch, ytCache); currentYt=yt;
          const itUrl=buildSearchUrl(q,"all"); const resp=await fetch(itUrl); let parsed: SearchResult[]=[]; if(resp.ok){ const j=await resp.json(); parsed=parseResults(j); }
          currentResults=parsed;
          // render spotify combined: create section in linkFeedback
          const fbContainer=document.getElementById("linkFeedback") as HTMLElement | null;
          if(fbContainer){
            let spotDiv=document.getElementById("spotifyResults"); if(spotDiv) spotDiv.remove();
            spotDiv=document.createElement("div"); spotDiv.id="spotifyResults"; spotDiv.className="spotify-results";
            const mkItem=(text:string)=>{ const d=document.createElement("div"); d.textContent=text; d.className="mono small"; return d; };
            if(yt.length>0){
              const h=document.createElement("div"); h.textContent="YouTube matches:"; h.className="mono small"; h.style.fontWeight="600"; spotDiv.appendChild(h);
              for(const y of yt.slice(0,3)){ const row=document.createElement("div"); row.className="search-result-row"; row.style.display="grid"; row.style.gridTemplateColumns="1fr auto"; row.textContent=`${y.cleanedTitle} — ${y.channel}`; const btn=document.createElement("button"); btn.className="btn pill small"; btn.textContent="Add"; btn.addEventListener("click",()=>{ const s: import("../library.js").Song={ id:crypto.randomUUID(), title:y.cleanedTitle, artist:y.channel, url:`https://www.youtube.com/watch?v=${y.videoId}`, source:"youtube", videoId:y.videoId, artworkUrl:y.thumbnail, duration:y.duration }; getActiveList().addLast(s); saveLibrary(library); renderAll(); showToast({message:`Added "${y.cleanedTitle}"`}); }); row.appendChild(btn); spotDiv.appendChild(row);
              }
            }
            if(parsed.length>0){
              const h2=document.createElement("div"); h2.textContent="iTunes matches:"; h2.className="mono small"; h2.style.fontWeight="600"; spotDiv.appendChild(h2);
              for(const p of parsed.slice(0,3)){ const row=document.createElement("div"); row.className="search-result-row"; row.style.display="grid"; row.style.gridTemplateColumns="1fr auto"; row.textContent=`${p.title} — ${p.artist}`; const btn=document.createElement("button"); btn.className="btn pill small"; btn.textContent="Add"; btn.addEventListener("click",()=>{ addRemoteSong(p,"end"); }); row.appendChild(btn); spotDiv.appendChild(row); }
            }
            if(yt.length===0 && parsed.length===0) spotDiv.appendChild(mkItem("No matches found"));
            fbContainer.appendChild(spotDiv);
            fbContainer.classList.remove("hidden");
          }
          // also keep search panel updated for source tabs
          renderCurrent();
        }catch{
          const fbErr=document.getElementById("linkFeedback") as HTMLElement | null; if(fbErr) fbErr.textContent="Spotify links can't be played here. Pick the match:";
        }
      } else if(cls.kind==="apple"){
        const id=cls.trackId; const fb2=document.getElementById("linkFeedback") as HTMLElement | null; if(!id){ if(fb2) fb2.textContent="Could not find Apple track id"; return; }
        const r=await fetch(`https://itunes.apple.com/lookup?id=${id}`); if(!r.ok) throw new Error(String(r.status)); const j=await r.json() as { results:{ previewUrl?:string; trackName?:string; artistName?:string; artworkUrl100?:string; trackId?:number }[] }; const it=j.results?.[0]; if(!it?.previewUrl){ if(fb2) fb2.textContent="No preview"; return; }
        const song: import("../library.js").Song={ id:crypto.randomUUID(), title:it.trackName ?? "Unknown", artist:it.artistName, url:it.previewUrl, source:"remote", remoteId:String(it.trackId ?? id), artworkUrl:it.artworkUrl100?.replace("100x100bb","300x300bb") ?? "" }; getActiveList().addLast(song); saveLibrary(library); renderAll(); if(fb2) fb2.textContent=`Added "${song.title}"`; input.value="";
      } else if(cls.kind==="audio"){
        const fb2=document.getElementById("linkFeedback") as HTMLElement | null;
        let isCors=true; try{ const h=await fetch(url,{method:"HEAD"}); const cors=h.headers.get("access-control-allow-origin"); if(!cors) isCors=false; }catch{ isCors=false; }
        await new Promise<void>((res,rej)=>{ const a=new Audio(); let done=false; const to=window.setTimeout(()=>{ if(!done){ done=true; rej(new Error("timeout")); }},8000); a.preload="metadata"; a.src=url; a.addEventListener("loadedmetadata",()=>{ if(!done){ done=true; clearTimeout(to); res(); }}); a.addEventListener("error",()=>{ if(!done){ done=true; clearTimeout(to); rej(new Error("error")); }}); if(isCors) a.crossOrigin="anonymous"; });
        const filename=url.split("/").pop()?.split("?")[0] ?? "audio"; const song: import("../library.js").Song={ id:crypto.randomUUID(), title: decodeURIComponent(filename.replace(/\.[^/.]+$/,"")) || filename, url, source:"remote", noCors:!isCors }; getActiveList().addLast(song); saveLibrary(library); renderAll(); if(fb2) fb2.textContent=`Added "${song.title}"`; input.value="";
      }
    }catch(e){ const fb2=document.getElementById("linkFeedback") as HTMLElement | null; if(fb2) fb2.textContent=(e as Error).message; }
  };
  addBtn.addEventListener("click",()=> doHandle(input.value));
  input.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); doHandle((e.target as HTMLInputElement).value); }});
  document.addEventListener("paste",(e)=>{
    const t=e.target as HTMLElement; if(t && (t.tagName==="INPUT" || t.tagName==="TEXTAREA")) return;
    const text=e.clipboardData?.getData("text") ?? ""; if(!text) return;
    const cls=classifyUrl(text.trim()); if(cls.kind==="invalid"||cls.kind==="unsupported") return;
    e.preventDefault(); input.value=text.trim(); void doHandle(text.trim());
  });
  const listEl=document.getElementById("songList");
  listEl?.addEventListener("dragover",(e)=>{ const dt=e.dataTransfer; if(dt?.types.includes("text/uri-list")||dt?.types.includes("text/plain")) e.preventDefault(); });
  listEl?.addEventListener("drop",(e)=>{
    const dt=e.dataTransfer; if(!dt) return;
    const uri=dt.getData("text/uri-list") || dt.getData("text/plain") || "";
    if(!uri) return;
    const first=uri.split("\n")[0]?.trim() ?? ""; if(!first) return;
    const cls=classifyUrl(first); if(cls.kind==="invalid"){ const fb=document.getElementById("linkFeedback") as HTMLElement | null; if(fb){ fb.textContent="Link is invalid"; fb.classList.remove("hidden"); } return; }
    e.preventDefault(); void doHandle(first);
  });
}
export function initSearchPanel(): void {
  const panel=document.getElementById("searchPanel"); const input=document.getElementById("searchOnlineInput") as HTMLInputElement | null; const openBtn=document.getElementById("openSearchBtn"); const closeBtn=document.getElementById("closeSearchPanel"); if(!panel||!input) return; updateSourceUI(getSource()); openBtn?.addEventListener("click",()=> openPanel()); closeBtn?.addEventListener("click",()=> closePanel()); panel.addEventListener("click",(e)=>{ if(e.target===panel) closePanel(); }); document.addEventListener("keydown",(e)=>{ if((e.ctrlKey||e.metaKey)&& e.key.toLowerCase()==="k"){ e.preventDefault(); if(panel.classList.contains("hidden")) openPanel(); else input.focus({preventScroll:true} as FocusOptions); } if(e.key==="Escape"&&!panel.classList.contains("hidden")){ e.preventDefault(); closePanel(); } }); for(const chipEl of Array.from(document.querySelectorAll(".chip"))){ if((chipEl as HTMLElement).dataset["source"]!==undefined) continue; chipEl.addEventListener("click",()=>{ setChipActive((chipEl as HTMLElement).dataset["chip"] as Chip); if(input.value.trim().length>=2){ if(debounceTimer) clearTimeout(debounceTimer); performSearch(input.value,getChip()); } }); } for(const sEl of Array.from(document.querySelectorAll(".source-chip"))){ sEl.addEventListener("click",()=>{ const src=(sEl as HTMLElement).dataset["source"] as Source; setSource(src); currentResults=[]; currentYt=[]; currentArchive=[]; renderCurrent(); showEmpty(""); if(input.value.trim().length>=2){ if(debounceTimer) clearTimeout(debounceTimer); performSearch(input.value,getChip()); } else updateCount(0,"Type at least 2 characters"); }); } input.addEventListener("input",()=>{ if(debounceTimer) clearTimeout(debounceTimer); debounceTimer=window.setTimeout(()=> performSearch(input.value,getChip()),350); }); input.addEventListener("keydown",(e)=>{ if((e.key==="ArrowDown"||e.key==="ArrowUp") && (currentResults.length>0||currentYt.length>0||currentArchive.length>0)){ e.preventDefault(); const total=getSource()==="youtube"? currentYt.length : getSource()==="free"? currentArchive.length : currentResults.length; focusedIdx=e.key==="ArrowDown"?0:total-1; document.querySelectorAll<HTMLElement>("#searchResults .search-result-row")[focusedIdx]?.focus({preventScroll:true} as FocusOptions); } }); initKeyboardNav(); setChipActive("all"); initLinkHandling(); }
export function __resetForTests(): void { cache.clear(); ytCache=new YtCache(); currentResults=[]; currentYt=[]; currentArchive=[]; focusedIdx=-1; previewActive=false; activePreviewId=null; previewSaved=null; try{ localStorage.removeItem("lb.source"); }catch{} }

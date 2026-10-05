import { ListNode } from "../doublylinked.js";
import { Song } from "../library.js";
import { library, player, getActiveList, pendingInsertIndex, setPendingInsertIndex, objectUrls, lastDeleted, setLastDeleted } from "../state.js";
import { audioEl, fileInput, folderInput } from "./dom.js";
import { showToast } from "./toast.js";
import { saveLibrary, tryRelink } from "./persistence.js";
import { applyHue } from "./cover.js";
import type { SearchResult } from "../search.js";
let renderAllFn: (() => void) | null = null;
let renderSongsFn: (() => void) | null = null;
let updatePlayerBarFn: (() => void) | null = null;
export function setRenderCallbacks(all: () => void, songs: () => void, bar: () => void): void { renderAllFn = all; renderSongsFn = songs; updatePlayerBarFn = bar; }
function isBlobUrl(url: string): boolean { return url.startsWith("blob:"); }
function setAudioSrc(url: string): void { audioEl.crossOrigin = "anonymous"; audioEl.src = url; }
function createSongFromFile(file: File): Song | null {
  if (file.type && !file.type.startsWith("audio/")) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const audioExts = ["mp3","wav","ogg","flac","m4a","aac","wma","opus","webm"];
    if (!audioExts.includes(ext)) return null;
  }
  const activeSongs: Song[] = []; let cur = getActiveList().head;
  while (cur !== null) { activeSongs.push(cur.value); cur = cur.next; }
  const relinked = tryRelink(activeSongs, file);
  if (relinked) {
    const url = URL.createObjectURL(file); objectUrls.add(url);
    relinked.url = url; relinked.fileName = file.name; relinked.fileSize = file.size;
    relinked.title = file.name.replace(/\.[^/.]+$/, "") || file.name;
    const probe = new Audio(); probe.preload = "metadata"; probe.crossOrigin = "anonymous"; probe.src = url;
    probe.addEventListener("loadedmetadata", () => { if (Number.isFinite(probe.duration) && probe.duration>0) { relinked.duration=probe.duration; renderSongsFn?.(); updatePlayerBarFn?.(); }});
    showToast({ message: `Re-linked "${relinked.title}"` }); saveLibrary(library); renderSongsFn?.(); updatePlayerBarFn?.(); return null;
  }
  const url = URL.createObjectURL(file); objectUrls.add(url);
  const title = file.name.replace(/\.[^/.]+$/, "") || file.name;
  const song: Song = { id: crypto.randomUUID(), title, url, fileName: file.name, fileSize: file.size, source: "local" };
  const probe = new Audio(); probe.preload="metadata"; probe.crossOrigin="anonymous"; probe.src=url;
  probe.addEventListener("loadedmetadata", () => { if (Number.isFinite(probe.duration) && probe.duration>0) { song.duration=probe.duration; renderSongsFn?.(); updatePlayerBarFn?.(); saveLibrary(library); }});
  return song;
}
export function createRemoteSong(result: SearchResult): Song {
  const song: Song = { id: crypto.randomUUID(), title: result.title, artist: result.artist, url: result.previewUrl, source: "remote", remoteId: result.remoteId, artworkUrl: result.artworkUrl, trackTimeMillis: result.trackTimeMillis };
  const probe = new Audio(); probe.preload="metadata"; probe.crossOrigin="anonymous"; probe.src=result.previewUrl;
  probe.addEventListener("loadedmetadata", () => { if (Number.isFinite(probe.duration)&&probe.duration>0){ song.duration=probe.duration; renderSongsFn?.(); updatePlayerBarFn?.(); saveLibrary(library); }});
  probe.addEventListener("error", () => {});
  return song;
}
function findRemoteDup(list: import("../doublylinked.js").DoublyLinkedList<Song>, remoteId: string): boolean { let cur=list.head; while(cur!==null){ if(cur.value.source==="remote"&&cur.value.remoteId===remoteId) return true; cur=cur.next; } return false; }
export function addRemoteSong(result: SearchResult, position: "end"|"start"|"afterCurrent"|number): void {
  const list=getActiveList();
  if(findRemoteDup(list,result.remoteId)){ showToast({message:`Already in ${library.getActiveName()}: ${result.title}`}); return; }
  const song=createRemoteSong(result); let idx:number;
  if(position==="end") idx=list.size; else if(position==="start") idx=0;
  else if(position==="afterCurrent"){ if(player.current){ const c=list.indexOf(player.current); idx=c!==-1?c+1:list.size; } else idx=list.size; }
  else if(typeof position==="number"){ idx=position; if(idx<0) idx=0; if(idx>list.size) idx=list.size; }
  else idx=list.size;
  let node:ListNode<Song>; try{ node=list.insertAt(idx,song);} catch (_e) { node=list.addLast(song); }
  if(player.shuffle && player.getPlayingList()===list) player.notifyInsert(node);
  saveLibrary(library); renderAllFn?.(); showToast({message:`Added "${song.title}"`});
}
export function playNode(node: ListNode<Song>|null, owner=getActiveList()): void {
  if(!node) return;
  if(!node.value.url){ showToast({message:`"${node.value.title}" needs re-link: drop the file again`}); player.play(node,owner); applyHue(node.value.title); renderSongsFn?.(); updatePlayerBarFn?.(); return; }
  player.play(node,owner); applyHue(node.value.title); setAudioSrc(node.value.url); audioEl.play().catch(()=>{}); renderSongsFn?.(); updatePlayerBarFn?.(); saveLibrary(library);
}
export function handleDelete(indexOrNode: number|ListNode<Song>): void {
  const list=getActiveList(); let index:number; let node:ListNode<Song>|null;
  if(typeof indexOrNode==="number"){ index=indexOrNode; node=list.nodeAt(index); } else { node=indexOrNode; index=list.indexOf(node); if(index===-1) return; }
  if(!node) return;
  const wasPlaying=player.current===node; const url=node.value.url; const songVal=node.value;
  player.handleRemoval(node); list.removeNode(node); if(player.shuffle) player.notifyRemove(node);
  setLastDeleted({index,song:songVal});
  showToast({message:`Deleted "${songVal.title}"`,duration:6000,actionLabel:"Undo",onAction:()=>undoDelete()});
  if(isBlobUrl(url)&&url!==""){ let stillUsed=false; for(const name of library.getNames()){ const pl=library.getPlaylist(name); if(!pl) continue; let c=pl.head; while(c!==null){ if(c.value.url===url&&url!==""){ stillUsed=true; break;} c=c.next; } if(stillUsed) break; } if(!stillUsed){ URL.revokeObjectURL(url); objectUrls.delete(url); } }
  if(wasPlaying){ if(player.current?.value.url){ setAudioSrc(player.current.value.url); audioEl.play().catch(()=>{}); } else { audioEl.pause(); audioEl.removeAttribute("src"); audioEl.load(); } }
  else if(audioEl.src===url){ audioEl.pause(); audioEl.removeAttribute("src"); audioEl.load(); }
  saveLibrary(library); renderAllFn?.();
}
export function undoDelete(): void {
  if(!lastDeleted) return; const list=getActiveList(); const idx=Math.min(lastDeleted.index,list.size);
  list.insertAt(idx,lastDeleted.song); if(player.shuffle){ const n=list.nodeAt(idx); if(n) player.notifyInsert(n); }
  setLastDeleted(null); saveLibrary(library); renderAllFn?.(); showToast({message:"Restored song"});
}
export function handleFiles(files: File[]|FileList, insertIndex:number|null): void {
  const arr=Array.from(files as unknown as Iterable<File>); if(arr.length===0) return;
  const list=getActiveList(); let base=pendingInsertIndex??insertIndex??list.size; if(base<0) base=0; if(base>list.size) base=list.size;
  setPendingInsertIndex(null); let added=0;
  for(const file of arr){
    let dup=false; let c=list.head; while(c!==null){ if(c.value.fileName===file.name&&c.value.fileSize===file.size){dup=true;break;} c=c.next;}
    if(dup){
      showToast({
        message: `Already in ${library.getActiveName()}: ${file.name}`,
        duration: 4000,
        actionLabel: "Add anyway",
        onAction: () => {
          const s = createSongFromFile(file);
          if (!s) return;
          try {
            const n = list.insertAt(base, s);
            if (player.shuffle) player.notifyInsert(n);
            base++;
            if (player.current === null && list.head) { player.play(list.head, list); applyHue(list.head.value.title); }
            saveLibrary(library); renderAllFn?.();
          } catch (_e) { const n = list.addLast(s); if (player.shuffle) player.notifyInsert(n); }
        },
      });
      continue;
    }
    const song=createSongFromFile(file); if(song===null) continue; if(!song) continue;
    try{ const n=list.insertAt(base,song); if(player.shuffle) player.notifyInsert(n); base++; added++; } catch (_e) { const n=list.addLast(song); if(player.shuffle) player.notifyInsert(n); base=list.size; }
  }
  if(added>0){ if(player.current===null&&list.head){ player.play(list.head,list); applyHue(list.head.value.title); } saveLibrary(library); renderAllFn?.(); showToast({message:`Added ${added} song${added!==1?"s":""}`}); }
  fileInput.value=""; folderInput.value="";
}
export function handleAddToPlaylist(song: Song, targetName:string): void {
  const target=library.getPlaylist(targetName); if(!target) return;
  const clone:Song={ id:crypto.randomUUID(), title:song.title, url:song.url, duration:song.duration, fileName:song.fileName, fileSize:song.fileSize, source:song.source, remoteId:song.remoteId, artworkUrl:song.artworkUrl, artist:song.artist, trackTimeMillis:song.trackTimeMillis };
  if(clone.source==="remote"&&clone.remoteId){ let cur=target.head; while(cur){ if(cur.value.remoteId===clone.remoteId){ showToast({message:`Already in ${targetName}`}); return;} cur=cur.next;} }
  const node=target.addLast(clone); if(player.shuffle&&player.getPlayingList()===target) player.notifyInsert(node);
  saveLibrary(library); renderAllFn?.(); showToast({message:`Added to ${targetName}`});
}
export function moveToTop(indexOrNode:number|ListNode<Song>): void {
  const list=getActiveList(); const idx=typeof indexOrNode==="number"?indexOrNode:list.indexOf(indexOrNode); if(idx===-1||idx===0) return;
  try{ list.move(idx,0); saveLibrary(library); renderAllFn?.(); }catch(e){ console.error(e); }
}
export function moveToBottom(indexOrNode:number|ListNode<Song>): void {
  const list=getActiveList(); let idx:number; if(typeof indexOrNode==="number") idx=indexOrNode; else { idx=list.indexOf(indexOrNode); if(idx===-1) return; }
  if(idx===list.size-1) return; try{ list.move(idx,list.size); saveLibrary(library); renderAllFn?.(); }catch(e){ console.error(e); }
}
export function playNext(indexOrNode:number|ListNode<Song>): void {
  const list=getActiveList(); let idx:number; let node:ListNode<Song>|null;
  if(typeof indexOrNode==="number"){ idx=indexOrNode; node=list.nodeAt(idx);} else { node=indexOrNode; idx=list.indexOf(node); if(idx===-1) return; }
  if(!node||!player.current) return;
  let curIdx=-1; let cur=list.head; let i=0; while(cur){ if(cur===player.current) curIdx=i; cur=cur.next; i++; } if(curIdx===-1) return;
  let target=curIdx+1; if(idx<target) target-=1; if(idx===target||idx===target-1) return;
  try{ list.move(idx,target); saveLibrary(library); renderAllFn?.(); showToast({message:"Moved to play next"});}catch(e){ console.error(e); }
}

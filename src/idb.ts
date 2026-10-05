export const PER_FILE_CAP = 80 * 1024 * 1024;
export const TOTAL_CAP = 300 * 1024 * 1024;

export function canStore(fileSize: number, currentTotal: number): boolean {
  if (fileSize > PER_FILE_CAP) return false;
  if (currentTotal + fileSize > TOTAL_CAP) return false;
  return true;
}
export function quotaText(used: number): string {
  const mb = (used / (1024 * 1024)).toFixed(0);
  return `STORED LOCALLY ${mb} MB / 300 MB`;
}

let db: IDBDatabase | null = null;
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (db) { res(db); return; }
    const req = indexedDB.open("linkedBeats", 1);
    req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs"); };
    req.onsuccess = () => { db = req.result; res(db); };
    req.onerror = () => rej(req.error);
  });
}
export async function storeBlob(id: string, blob: Blob): Promise<void> {
  try { const d = await openDb(); await new Promise<void>((res, rej) => { const tx = d.transaction("blobs","readwrite"); tx.objectStore("blobs").put(blob, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); try { await navigator.storage.persist?.(); } catch {} } catch {}
}
export async function getBlob(id: string): Promise<Blob | null> {
  try { const d = await openDb(); return await new Promise<Blob | null>((res) => { const tx = d.transaction("blobs","readonly"); const req = tx.objectStore("blobs").get(id); req.onsuccess = () => res(req.result ?? null); req.onerror = () => res(null); }); } catch { return null; }
}
export async function removeBlob(id: string): Promise<void> { try { const d = await openDb(); await new Promise<void>((res) => { const tx = d.transaction("blobs","readwrite"); tx.objectStore("blobs").delete(id); tx.oncomplete = () => res(); tx.onerror = () => res(); }); } catch {} }
export async function totalStoredSize(): Promise<number> {
  try { const d = await openDb(); return await new Promise<number>((res) => { const tx = d.transaction("blobs","readonly"); const store = tx.objectStore("blobs"); let total = 0; const cursor = store.openCursor(); cursor.onsuccess = () => { const c = cursor.result; if (c) { const v = c.value as Blob; total += v.size; c.continue(); } else res(total); }; cursor.onerror = () => res(0); }); } catch { return 0; }
}
export async function clearAllBlobs(): Promise<void> { try{ const d=await openDb(); await new Promise<void>((res)=>{ const tx=d.transaction("blobs","readwrite"); tx.objectStore("blobs").clear(); tx.oncomplete=()=>res(); tx.onerror=()=>res(); }); }catch{} }

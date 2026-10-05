import type { Song } from "./library.js";
import type { Library } from "./library.js";

export interface ExportJson { version: number; playlists: Record<string, Song[]> }

export function exportLibraryJson(lib: Library): string {
  const data: ExportJson = { version: 3, playlists: {} };
  for (const name of lib.getNames()) {
    const list = lib.getPlaylist(name); if (!list) continue;
    const arr: Song[] = []; let cur = list.head; while (cur) { arr.push(cur.value); cur = cur.next; }
    data.playlists[name] = arr;
  }
  return JSON.stringify(data);
}

export function exportPlaylistM3U(songs: Song[]): string {
  const lines = ["#EXTM3U"];
  for (const s of songs) {
    const dur = s.duration ? Math.round(s.duration) : -1;
    lines.push(`#EXTINF:${dur},${s.artist ?? "Unknown"} - ${s.title}`);
    lines.push(s.url || s.title);
  }
  return lines.join("\n");
}

export function validateImport(json: unknown): { ok: boolean; reason?: string; data?: ExportJson } {
  if (!json || typeof json !== "object") return { ok: false, reason: "not object" };
  const o = json as Record<string, unknown>;
  const playlists = o["playlists"];
  if (!playlists || typeof playlists !== "object") return { ok: false, reason: "no playlists" };
  const str = JSON.stringify(json);
  if (str.length > 5 * 1024 * 1024) return { ok: false, reason: "too large" };
  let total = 0;
  for (const k of Object.keys(playlists as Record<string, unknown>)) {
    const arr = (playlists as Record<string, unknown>)[k];
    if (!Array.isArray(arr)) return { ok: false, reason: "playlist not array" };
    total += arr.length;
    if (arr.length > 5000) return { ok: false, reason: "too many songs" };
    for (const item of arr) {
      if (!item || typeof item !== "object") return { ok: false, reason: "bad song" };
      const rec = item as Record<string, unknown>;
      const title = rec["title"]; if (typeof title !== "string" || title.length > 500) return { ok: false, reason: "bad title" };
      const url = rec["url"]; if (typeof url === "string" && url.length > 2000) return { ok: false, reason: "url too long" };
      if (typeof url === "string" && url && !url.startsWith("http") && !url.startsWith("blob:")) {
        // local songs may have blob url but imported ones shouldn't have javascript:
        if (url.startsWith("javascript:") || url.startsWith("data:")) return { ok: false, reason: "bad url scheme" };
      }
    }
  }
  if (total > 5000) return { ok: false, reason: "too many total" };
  return { ok: true, data: json as ExportJson };
}

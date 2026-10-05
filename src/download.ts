import type { Song } from "./library.js";
import { showToast } from "./ui/toast.js";

export function downloadAllowed(song: Song): boolean {
  if (song.source === "youtube") return false;
  if (song.source === "remote" && song.remoteId && !song.license) return false;
  return true;
}

export async function downloadSong(song: Song): Promise<void> {
  if (!downloadAllowed(song)) { showToast({ message: "Downloads aren't offered for YouTube or iTunes content (copyright and terms of service)" }); return; }
  // For local files, url is blob: we can trigger download via a tag
  if (song.source === "local" && song.url) {
    const a = document.createElement("a"); a.href = song.url; a.download = song.fileName ?? `${song.title}.mp3`; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); return;
  }
  if (song.url) {
    try {
      const res = await fetch(song.url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = sanitizeFilename(`${song.title}${extFromUrl(song.url)}`); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (song.attribution) showToast({ message: song.attribution });
    } catch {
      window.open(song.url, "_blank", "noopener");
    }
  }
}

function extFromUrl(u: string): string { try { const p = new URL(u).pathname; const e = p.split(".").pop(); if (e && e.length <= 5) return `.${e}`; } catch {} return ".mp3"; }
export function sanitizeFilename(name: string): string {
  let s = name.replace(/[\/\\:*?"<>|]/g, "_").replace(/[\x00-\x1F\x7F]/g, "_").trim();
  if (s.length > 150) s = s.slice(0, 150);
  const reserved = ["CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"];
  if (reserved.includes(s.toUpperCase())) s = `_${s}`;
  if (s === "") s = "download";
  return s;
}

export const PIPED_HOSTS = [
  "https://api.piped.private.coffee",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.privacydev.net",
];

export interface YtResult {
  videoId: string;
  title: string;
  cleanedTitle: string;
  channel: string;
  duration: number;
  thumbnail: string;
}

export function parseIsoDuration(iso: string): number {
  if (!iso || typeof iso !== "string") return 0;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  if (iso === "P0D" || iso === "PT0S") return 0;
  const days = Number(m[1] ?? 0);
  const h = Number(m[2] ?? 0);
  const min = Number(m[3] ?? 0);
  const sec = Number(m[4] ?? 0);
  if (!Number.isFinite(days) || !Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(sec)) return 0;
  // PT3M20S etc; if no T part but D, still valid
  if (!iso.includes("T") && !iso.includes("D")) return 0;
  const total = days * 86400 + h * 3600 + min * 60 + sec;
  // garbage like "P" without numbers should be 0 but our regex matches empty groups -> 0
  // ensure iso starts with P
  if (!iso.startsWith("P")) return 0;
  return total;
}

export function cleanYoutubeTitle(title: string, author?: string): string {
  if (!title) return "";
  let s = title;
  // If author prefix exists like "Rick Astley - Never Gonna...", strip author prefix when matches author param or generic split
  if (author && typeof author === "string" && author.trim().length>0) {
    const a = author.trim();
    if (s.toLowerCase().startsWith(a.toLowerCase() + " - ")) {
      s = s.slice(a.length + 3);
    }
  } else {
    // Generic fallback: if title contains " - " and first part looks like artist (no brackets, length reasonable), keep but don't strip automatically; caller can handle
    // Do nothing; just keep title as is for generic clean.
  }
  const patterns = [
    /\(Official Video\)/gi,
    /\[Official Music Video\]/gi,
    /\(Official Music Video\)/gi,
    /\(Official Lyric Video\)/gi,
    /\[Official Lyric Video\]/gi,
    /\(Lyrics\)/gi,
    /\[Lyrics\]/gi,
    /\(Lyric Video\)/gi,
    /\(HD\)/gi,
    /\[HD\]/gi,
    /4K Remaster/gi,
    /\(4K\)/gi,
    /\[4K\]/gi,
    /\s*-\s*Topic\s*$/i,
    /\(Remastered\)/gi,
  ];
  for (const p of patterns) s = s.replace(p, "");
  // strip empty brackets/parens left after removals
  s = s.replace(/\s*\(\s*\)/g, "");
  s = s.replace(/\s*\[\s*\]/g, "");
  // collapse and trim
  s = s.replace(/\s{2,}/g, " ").trim();
  // trim trailing separators and dashes
  s = s.replace(/[\s\-–—]+$/g, "").trim();
  s = s.replace(/^[ \-_–—]+/g, "").trim();
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || title.trim();
}
export function splitYoutubeTitle(title: string, author: string): { title: string; artist: string } {
  if (author && title.toLowerCase().startsWith(author.toLowerCase() + " - ")) {
    const rest = title.slice(author.length + 3);
    return { title: cleanYoutubeTitle(rest), artist: author };
  }
  return { title: cleanYoutubeTitle(title), artist: author };
}

export function parsePipedItems(json: unknown): YtResult[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  const items = obj["items"];
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: YtResult[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    if (rec["type"] !== "stream") continue;
    const url = typeof rec["url"] === "string" ? rec["url"] : "";
    const m = url.match(/v=([^&]+)/);
    const videoId = m ? m[1]! : "";
    if (!videoId) continue;
    if (seen.has(videoId)) continue;
    if (rec["isShort"] === true) continue;
    const dur = typeof rec["duration"] === "number" ? rec["duration"] : -1;
    if (dur !== undefined && dur <= 0) continue;
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    const rawTitle = typeof rec["title"] === "string" ? rec["title"] : "Unknown";
    const channel = typeof rec["uploaderName"] === "string" ? rec["uploaderName"] : "Unknown";
    const duration = Number.isFinite(dur) ? dur as number : 0;
    const split = splitYoutubeTitle(rawTitle, channel);
    out.push({ videoId, title: rawTitle, cleanedTitle: split.title, channel: split.artist, duration, thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` });
  }
  return out;
}

export function parseYtApiItems(searchJson: unknown, contentJson: unknown): YtResult[] {
  if (!searchJson || typeof searchJson !== "object") return [];
  const sj = searchJson as Record<string, unknown>;
  const items = sj["items"];
  if (!Array.isArray(items)) return [];
  const durationMap = new Map<string, string>();
  if (contentJson && typeof contentJson === "object") {
    const cj = contentJson as Record<string, unknown>;
    const citems = cj["items"];
    if (Array.isArray(citems)) {
      for (const c of citems) {
        if (!c || typeof c !== "object") continue;
        const rec = c as Record<string, unknown>;
        const id = typeof rec["id"] === "string" ? rec["id"] : "";
        const cd = (rec["contentDetails"] as Record<string, unknown> | undefined)?.["duration"];
        if (id && typeof cd === "string") durationMap.set(id, cd);
      }
    }
  }
  const out: YtResult[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    const idObj = rec["id"] as Record<string, unknown> | undefined;
    const videoId = typeof idObj?.["videoId"] === "string" ? idObj["videoId"] as string : typeof rec["id"] === "string" ? rec["id"] as string : "";
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    const snippet = rec["snippet"] as Record<string, unknown> | undefined;
    const rawTitle = typeof snippet?.["title"] === "string" ? snippet["title"] as string : "Unknown";
    const channel = typeof snippet?.["channelTitle"] === "string" ? snippet["channelTitle"] as string : "Unknown";
    const iso = durationMap.get(videoId) ?? "";
    const duration = iso ? parseIsoDuration(iso) : 0;
    const split = splitYoutubeTitle(rawTitle, channel);
    out.push({ videoId, title: rawTitle, cleanedTitle: split.title, channel: split.artist, duration, thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` });
  }
  return out;
}

// Cache for queries
export class YtCache {
  private map = new Map<string, { value: YtResult[]; time: number }>();
  ttl = 5 * 60 * 1000;
  max = 20;
  private now: () => number;
  constructor(nowFn: () => number = () => Date.now()) { this.now = nowFn; }
  get(k: string): YtResult[] | undefined { const e = this.map.get(k); if (!e) return undefined; if (this.now() - e.time > this.ttl) { this.map.delete(k); return undefined; } return e.value; }
  set(k: string, v: YtResult[]): void { if (this.map.has(k)) this.map.delete(k); this.map.set(k, { value: v, time: this.now() }); if (this.map.size > this.max) { const first = this.map.keys().next().value as string | undefined; if (first) this.map.delete(first); } }
  has(k: string): boolean { return this.get(k) !== undefined; }
}

// Fetch with fallback chain (injectable)
export async function searchYouTubePiped(
  query: string,
  fetchFn: typeof fetch = fetch,
  cache?: YtCache,
  sessionMemory?: Map<string, string>,
): Promise<YtResult[]> {
  const key = query.toLowerCase().trim();
  if (key.length < 2) return [];
  if (cache) { const c = cache.get(key); if (c) return c; }
  const hosts = [...PIPED_HOSTS];
  // prefer remembered host
  const remembered = sessionMemory?.get("pipedHost");
  if (remembered && hosts.includes(remembered)) { hosts.splice(hosts.indexOf(remembered), 1); hosts.unshift(remembered); }
  let lastErr: unknown = null;
  for (const host of hosts) {
    for (const filter of ["music_songs", "videos"]) {
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
        const url = `${host}/search?q=${encodeURIComponent(query)}&filter=${filter}`;
        const res = await fetchFn(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json() as unknown;
        const parsed = parsePipedItems(json);
        if (parsed.length > 0) {
          sessionMemory?.set("pipedHost", host);
          // remember for 10 min via timestamp? caller handles
          cache?.set(key, parsed);
          return parsed;
        }
        // if empty and filter was music_songs, try videos
        if (filter === "music_songs") continue;
        // both empty => try next host
      } catch (e) { lastErr = e; continue; }
    }
  }
  void lastErr;
  return [];
}

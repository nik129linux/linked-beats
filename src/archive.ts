export function parseLicense(licenseUrl: string | undefined | null): string {
  if (!licenseUrl || typeof licenseUrl !== "string") return "Unknown";
  const u = licenseUrl.toLowerCase();
  if (u.includes("creativecommons.org/publicdomain/zero") || u.includes("creativecommons.org/publicdomain/zero/1.0") || u.includes("/zero/")) return "CC0";
  if (u.includes("/by-nc-nd/")) return "CC BY-NC-ND";
  if (u.includes("/by-nc-sa/")) return "CC BY-NC-SA";
  if (u.includes("/by-nc/")) return "CC BY-NC";
  if (u.includes("/by-nd/")) return "CC BY-ND";
  if (u.includes("/by-sa/")) return "CC BY-SA";
  if (u.includes("/by/")) return "CC BY";
  if (u.includes("publicdomain")) return "CC0";
  return "Unknown";
}

export interface ArchiveFile { name: string; format: string; length?: string; size?: string }

export function pickAudioFile(files: ArchiveFile[] | undefined | null): ArchiveFile | null {
  if (!files || !Array.isArray(files) || files.length === 0) return null;
  const norm = (f: string): string => f.toLowerCase();
  const prefer = ["vbr mp3", "mp3", "ogg vorbis"];
  // case-insensitive
  let best: ArchiveFile | null = null;
  let bestRank = Infinity;
  for (const f of files) {
    if (!f || typeof f.format !== "string" || typeof f.name !== "string") continue;
    const fmt = norm(f.format);
    let rank = -1;
    for (let i = 0; i < prefer.length; i++) if (fmt === prefer[i]) rank = i;
    if (rank === -1) continue;
    if (rank < bestRank) { bestRank = rank; best = f; }
  }
  return best;
}

export function buildArchiveSearchUrl(term: string): string {
  const base = "https://archive.org/advancedsearch.php";
  const q = term.trim();
  const query = `mediatype:audio AND licenseurl:*creativecommons* AND title:${q ? `"${q.replace(/"/g, '\\"')}"` : "*"}`;
  const params = new URLSearchParams();
  params.set("q", query);
  params.append("fl[]", "identifier");
  params.append("fl[]", "title");
  params.append("fl[]", "creator");
  params.append("fl[]", "licenseurl");
  params.set("rows", "20");
  params.set("output", "json");
  return `${base}?${params.toString()}`;
}

export function downloadAllowedForArchive(_song: unknown): boolean { return true; }

export function buildAttribution(title: string, creator: string, license: string): string {
  return `${title} by ${creator}, ${license}, via Internet Archive`;
}

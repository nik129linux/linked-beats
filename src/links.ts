export type LinkKind = "audio" | "youtube" | "spotify" | "apple" | "unsupported" | "invalid";

export interface ClassifyResult {
  kind: LinkKind;
  url?: string;
  videoId?: string;
  trackId?: string;
  reason?: string;
}

const AUDIO_EXTS = ["mp3","m4a","aac","ogg","oga","opus","wav","flac","weba","webm"];

export function classifyUrl(input: string): ClassifyResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "invalid", reason: "empty" };
  if (trimmed.length > 5000) return { kind: "invalid", reason: "too long" };
  if (/^spotify:(track|album|playlist|episode):[a-zA-Z0-9]+$/.test(trimmed)) return { kind: "spotify", url: trimmed, trackId: trimmed.split(":")[2] };
  let url: URL;
  try { url = new URL(trimmed); } catch {
    return { kind: "invalid", reason: "not a url" };
  }
  const scheme = url.protocol.replace(":", "").toLowerCase();
  if (scheme === "spotify") {
    const parts = url.pathname.split(":").filter(Boolean);
    const id = parts[1] ?? parts[0] ?? "";
    if (id) return { kind: "spotify", url: trimmed, trackId: id };
    return { kind: "spotify", url: trimmed };
  }
  if (["javascript","data","file","blob","ftp"].includes(scheme)) return { kind: "invalid", reason: "blocked scheme" };
  if (scheme !== "http" && scheme !== "https") return { kind: "invalid", reason: "unsupported scheme" };
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const search = url.search;

  // audio extension check first (but youtube etc take precedence? spec says kinds audio includes extension)
  // youtube
  if (host.includes("youtube.com") || host === "youtu.be" || host.includes("music.youtube.com") || host.includes("m.youtube.com")) {
    let videoId: string | null = null;
    if (host === "youtu.be") {
      const parts = path.split("/").filter(Boolean);
      videoId = parts[0] ?? null;
      if (videoId) videoId = videoId.split("?")[0] ?? videoId;
    } else if (path.startsWith("/shorts/")) {
      videoId = path.split("/")[2] ?? null;
    } else if (path.startsWith("/embed/")) {
      videoId = path.split("/")[2] ?? null;
    } else {
      videoId = url.searchParams.get("v");
    }
    if (videoId) {
      // strip query noise
      videoId = videoId.split("&")[0] ?? videoId;
      videoId = videoId.split("?")[0] ?? videoId;
      return { kind: "youtube", url: trimmed, videoId };
    }
  }
  // spotify
  if (host.includes("spotify.com") || host.includes("open.spotify.com")) {
    // handle /intl-xx/track/ID
    const m = path.match(/\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
    if (m) return { kind: "spotify", url: trimmed, trackId: m[2] };
    // also spotify:track uri already handled
  }
  if (trimmed.startsWith("spotify:track:")) {
    return { kind: "spotify", url: trimmed, trackId: trimmed.split(":")[2] };
  }
  // apple / itunes
  if (host.includes("music.apple.com") || host.includes("itunes.apple.com")) {
    const iParam = url.searchParams.get("i");
    if (iParam) return { kind: "apple", url: trimmed, trackId: iParam };
    const m1 = path.match(/\/id(\d+)/);
    if (m1) return { kind: "apple", url: trimmed, trackId: m1[1] };
    const parts = path.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    if (/^\d+$/.test(last)) return { kind: "apple", url: trimmed, trackId: last };
    // even if not matched, it's apple domain
    return { kind: "apple", url: trimmed };
  }
  // soundcloud unsupported
  if (host.includes("soundcloud.com")) return { kind: "unsupported", reason: "SoundCloud not supported", url: trimmed };
  // audio extension
  const ext = path.split(".").pop()?.toLowerCase().split("?")[0] ?? "";
  if (AUDIO_EXTS.includes(ext)) return { kind: "audio", url: trimmed };
  // fallback: if no ext but maybe audio via content-type probe later, classify as audio? spec says kinds audio (extension or later content-type probe) -> for now treat without ext as invalid unless probe
  // Check if url looks like direct audio URL without extension but will be probed later; we return audio to allow probe path
  // but spec says unsupported for SoundCloud etc, invalid for others?
  // If none matched, unsupported if it has host but not known type
  if (host) return { kind: "unsupported", url: trimmed, reason: "unknown host" };
  return { kind: "invalid", reason: "unknown" };
}

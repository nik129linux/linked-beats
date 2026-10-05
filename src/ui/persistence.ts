import { Library, Song } from "../library.js";
import { DoublyLinkedList } from "../doublylinked.js";

export const KEY_V3 = "linkedBeats:v3";
export const KEY_V2 = "linkedBeats:v2";
export const KEY_V1 = "linkedBeats:v1";

export function migrateSongV2toV3(ps: PersistedSong): PersistedSong {
  if (!ps.source) ps.source = "local";
  if (ps.source === "youtube" && !ps.videoId && ps.url) {
    const m = ps.url.match(/[?&]v=([^&]+)/) ?? ps.url.match(/youtu\.be\/([^?]+)/) ?? ps.url.match(/\/shorts\/([^?]+)/) ?? ps.url.match(/\/embed\/([^?]+)/);
    if (m) ps.videoId = m[1] ?? undefined;
  }
  return ps;
}

interface PersistedSong {
  id: string;
  title: string;
  duration?: number;
  fileName?: string;
  fileSize?: number;
  artist?: string;
  source?: "local" | "remote" | "youtube";
  remoteId?: string;
  artworkUrl?: string;
  trackTimeMillis?: number;
  url?: string;
  videoId?: string;
  license?: string;
  attribution?: string;
  noCors?: boolean;
}

interface PersistedLibrary {
  active: string | null;
  playlists: Record<string, PersistedSong[]>;
}

function songToPersisted(s: Song): PersistedSong {
  const ps: PersistedSong = {
    id: s.id,
    title: s.title,
    duration: s.duration,
  };
  if (s.fileName !== undefined) ps.fileName = s.fileName;
  if (s.fileSize !== undefined) ps.fileSize = s.fileSize;
  if (s.artist !== undefined) ps.artist = s.artist;
  ps.source = s.source ?? "local";
  if (s.remoteId !== undefined) ps.remoteId = s.remoteId;
  if (s.artworkUrl !== undefined) ps.artworkUrl = s.artworkUrl;
  if (s.trackTimeMillis !== undefined) ps.trackTimeMillis = s.trackTimeMillis;
  if (s.videoId !== undefined) ps.videoId = s.videoId;
  if (s.license !== undefined) ps.license = s.license;
  if (s.attribution !== undefined) ps.attribution = s.attribution;
  if (s.noCors !== undefined) ps.noCors = s.noCors;
  if ((s.source === "remote" || s.source === "youtube") && s.url) ps.url = s.url;
  return ps;
}

function persistedToSong(ps: PersistedSong): Song {
  const src = ps.source === "remote" || ps.source === "youtube" ? ps.source : "local";
  const song: Song = {
    id: ps.id,
    title: ps.title,
    url: src === "local" ? "" : (ps.url ?? ""),
    duration: ps.duration,
    fileName: ps.fileName,
    fileSize: ps.fileSize,
    artist: ps.artist,
    source: src,
    remoteId: ps.remoteId,
    artworkUrl: ps.artworkUrl,
    trackTimeMillis: ps.trackTimeMillis,
    videoId: ps.videoId,
    license: ps.license,
    attribution: ps.attribution,
    noCors: ps.noCors,
  };
  return song;
}

function parseLibraryData(data: PersistedLibrary): Library | null {
  if (!data.playlists || typeof data.playlists !== "object") return null;
  const names = Object.keys(data.playlists);
  if (names.length === 0) return null;
  const first = names[0]!;
  const lib = new Library(first);
  const firstList = lib.getPlaylist(first)!;
  const firstSongs = data.playlists[first] ?? [];
  for (const ps of firstSongs) {
    firstList.addLast(persistedToSong(ps));
  }
  for (let i = 1; i < names.length; i++) {
    const name = names[i]!;
    lib.createPlaylist(name);
    const list = lib.getPlaylist(name)!;
    const songs = data.playlists[name] ?? [];
    for (const ps of songs) {
      list.addLast(persistedToSong(ps));
    }
  }
  if (data.active && lib.getPlaylist(data.active)) lib.switchTo(data.active);
  return lib;
}

export function saveLibrary(lib: Library): void {
  try {
    const data: PersistedLibrary = {
      active: lib.getActiveName(),
      playlists: {},
    };
    for (const name of lib.getNames()) {
      const list = lib.getPlaylist(name);
      if (!list) continue;
      const songs: PersistedSong[] = [];
      let cur = list.head;
      while (cur !== null) {
        const s = cur.value as Song;
        songs.push(songToPersisted(s));
        cur = cur.next;
      }
      data.playlists[name] = songs;
    }
    const json = JSON.stringify(data);
    localStorage.setItem(KEY_V3, json);
    localStorage.setItem(KEY_V2, json);
  } catch {
  }
}

export function loadLibrary(): Library | null {
  try {
    let raw = localStorage.getItem(KEY_V3);
    if (raw) {
      const data = JSON.parse(raw) as PersistedLibrary;
      const lib = parseLibraryData(data);
      if (lib) return lib;
    }
    raw = localStorage.getItem(KEY_V2);
    if (raw) {
      const data = JSON.parse(raw) as PersistedLibrary;
      // migrate v2->v3
      for (const k of Object.keys(data.playlists)) {
        data.playlists[k] = (data.playlists[k] ?? []).map((ps) => migrateSongV2toV3(ps as PersistedSong));
      }
      const lib = parseLibraryData(data);
      if (lib) { try { saveLibrary(lib); } catch {} return lib; }
    }
    raw = localStorage.getItem(KEY_V1);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedLibrary;
    const lib = parseLibraryData(data);
    if (lib) {
      try { saveLibrary(lib); } catch {}
      return lib;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLibraryStorage(): void {
  try {
    localStorage.removeItem(KEY_V3);
    localStorage.removeItem(KEY_V2);
    localStorage.removeItem(KEY_V1);
  } catch {}
}

/** Try to re-link a file to a persisted song entry without URL */
export function tryRelink(songs: Song[], file: File): Song | null {
  for (const s of songs) {
    if (s.source === "remote") continue;
    if (s.fileName === file.name && s.fileSize === file.size && s.url === "") return s;
  }
  return null;
}

import { Library, Song } from "../library.js";
import { DoublyLinkedList } from "../doublylinked.js";

export const KEY_V2 = "linkedBeats:v2";
export const KEY_V1 = "linkedBeats:v1";

interface PersistedSong {
  id: string;
  title: string;
  duration?: number;
  fileName?: string;
  fileSize?: number;
  artist?: string;
  source?: "local" | "remote";
  remoteId?: string;
  artworkUrl?: string;
  trackTimeMillis?: number;
  url?: string;
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
  // Persist URL only for remote songs (previewUrl). For local, keep empty.
  if (s.source === "remote" && s.url) ps.url = s.url;
  return ps;
}

function persistedToSong(ps: PersistedSong): Song {
  const isRemote = ps.source === "remote";
  const song: Song = {
    id: ps.id,
    title: ps.title,
    url: isRemote ? (ps.url ?? "") : "",
    duration: ps.duration,
    fileName: ps.fileName,
    fileSize: ps.fileSize,
    artist: ps.artist,
    source: isRemote ? "remote" : "local",
    remoteId: ps.remoteId,
    artworkUrl: ps.artworkUrl,
    trackTimeMillis: ps.trackTimeMillis,
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
    localStorage.setItem(KEY_V2, JSON.stringify(data));
  } catch {
    // ignore quota or disabled storage
  }
}

export function loadLibrary(): Library | null {
  try {
    let raw = localStorage.getItem(KEY_V2);
    if (raw) {
      const data = JSON.parse(raw) as PersistedLibrary;
      const lib = parseLibraryData(data);
      if (lib) return lib;
    }
    raw = localStorage.getItem(KEY_V1);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedLibrary;
    const lib = parseLibraryData(data);
    if (lib) {
      // migrate: ensure all songs have source field
      let curLib: Library | null = lib;
      // also save to v2 for next loads
      try { saveLibrary(lib); } catch {}
      return curLib;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLibraryStorage(): void {
  try {
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

import { DoublyLinkedList } from "./doublylinked.js";

export interface Song {
  id: string;
  title: string;
  url: string;
  duration?: number;
  fileName?: string;
  fileSize?: number;
  artist?: string;
  source: "local" | "remote" | "youtube";
  remoteId?: string;
  artworkUrl?: string;
  trackTimeMillis?: number;
  videoId?: string;
  license?: string;
  attribution?: string;
  noCors?: boolean;
}

/**
 * Pure helper for drag-and-drop reordering.
 * Maps a visual gap index (0..size) to an insertion index after removal.
 * Returns null when the drop is a no-op ( onto itself or adjacent gap ).
 */
export function moveTarget(from: number, gap: number): number | null {
  if (gap === from || gap === from + 1) return null;
  if (from < gap) return gap - 1;
  return gap;
}

/**
 * Library = collection of named playlists.
 * Each playlist is its own DoublyLinkedList<Song>.
 */
export class Library {
  private playlists: Map<string, DoublyLinkedList<Song>> = new Map();
  private activeName: string | null = null;

  /** constructor — preserves one playlist minimum */
  constructor(initialName = "Default") {
    const list = new DoublyLinkedList<Song>();
    this.playlists.set(initialName, list);
    this.activeName = initialName;
  }

  /** createPlaylist — preserves name uniqueness and map size */
  createPlaylist(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error("Playlist name cannot be empty");
    if (this.playlists.has(trimmed)) throw new Error(`Playlist "${trimmed}" already exists`);
    this.playlists.set(trimmed, new DoublyLinkedList<Song>());
    this.activeName = trimmed;
  }

  /** renamePlaylist — preserves referential identity of list */
  renamePlaylist(oldName: string, newName: string): void {
    const newTrimmed = newName.trim();
    if (newTrimmed.length === 0) throw new Error("New name cannot be empty");
    if (!this.playlists.has(oldName)) throw new Error(`Playlist "${oldName}" not found`);
    if (this.playlists.has(newTrimmed)) throw new Error(`Playlist "${newTrimmed}" already exists`);
    const list = this.playlists.get(oldName);
    if (list === undefined) throw new Error(`Playlist "${oldName}" not found`);
    this.playlists.delete(oldName);
    this.playlists.set(newTrimmed, list);
    if (this.activeName === oldName) this.activeName = newTrimmed;
  }

  /** deletePlaylist — preserves at least one playlist */
  deletePlaylist(name: string): void {
    if (!this.playlists.has(name)) throw new Error(`Playlist "${name}" not found`);
    if (this.playlists.size <= 1) throw new Error("Cannot delete the last playlist");
    this.playlists.delete(name);
    if (this.activeName === name) {
      const first = this.playlists.keys().next().value as string | undefined;
      this.activeName = first ?? null;
    }
  }

  /** switchTo — preserves activeName points to existing list */
  switchTo(name: string): void {
    if (!this.playlists.has(name)) throw new Error(`Playlist "${name}" not found`);
    this.activeName = name;
  }

  /** getActiveList — preserves null when no active */
  getActiveList(): DoublyLinkedList<Song> | null {
    if (this.activeName === null) return null;
    return this.playlists.get(this.activeName) ?? null;
  }

  /** getActiveName — preserves activeName */
  getActiveName(): string | null {
    return this.activeName;
  }

  /** getNames — preserves key order */
  getNames(): string[] {
    return [...this.playlists.keys()];
  }

  /** getPlaylist — preserves map lookup */
  getPlaylist(name: string): DoublyLinkedList<Song> | undefined {
    return this.playlists.get(name);
  }

  /** getPlaylistsMap — preserves direct map reference */
  getPlaylistsMap(): Map<string, DoublyLinkedList<Song>> {
    return this.playlists;
  }
}

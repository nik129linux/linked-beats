# Linked Beats — Doubly Linked Music Player

Browser music player where every playlist is a hand-written doubly linked list. No frameworks, no bundlers, no hardcoded songs.

Live: https://linked-beats-sooty.vercel.app

## What it is

- Each playlist is a `DoublyLinkedList<Song>` with nodes `{ value, prev, next }`.
- `Player` holds a pointer to the current node and moves with `node.next` / `node.prev` (shuffle uses a Fisher-Yates bag with history).
- Songs are loaded at runtime from the user's file system via file picker and folder picker; playback is via an HTML `<audio>` element with visualizer.
- Editorial light paper/ink UI with ink band, hairline rules, FLIP list animations and a live linked-list strip.

## Deploy

Vercel: framework preset Other, build `npm run build:site`, output `site`; local check `npm run build:site && npx serve site`. The iTunes preview feature needs network.



## How to run

```bash
npm install
npm run build
npm run serve
# open http://localhost:8000
```

## Project layout

```
index.html          editorial layout, hero ink band, linked strip, drawer, dock
styles/tokens.css   design tokens (paper/ink/accent, type, space, easing)
styles/base.css     reset, body, focus ring
styles/components.css all components (topbar, band, strip, rows, dock, dialogs)
styles/motion.css   signature masked reveal + FLIP + reduced motion
src/
  doublylinked.ts   generic DoublyLinkedList<T> + restore helper (no arrays for storage)
  player.ts         Player with bag shuffle, prevAction, playingList vs viewed
  library.ts        Library = named playlists + moveTarget
  state.ts          singleton + lastDeleted + pendingInsertIndex
  main.ts           entry (initLinkedView, dragdrop, controls)
  ui/
    dom.ts          central DOM refs
    cover.ts        hashHue, coverStyle, vinyl
    format.ts       formatTime / formatFileSize
    toast.ts        glass toasts
    dialog.ts       glass modals (replaces prompt/alert/confirm)
    visualizer.ts   canvas AnalyserNode (createMediaElementSource once)
    linkedview.ts   horizontal strip of real nodes [prev|song|next]
    persistence.ts  localStorage versioned key, re-link
    songRow.ts      row with cover, equalizer, SVG icons, popover, a11y
    render.ts       keyed patch + FLIP + gaps owned by patch (rows+1 gaps), hero + dock
    gaps.ts         pure gap reconcile (alternating gap/row invariant, reuse/remove gaps)
    actions.ts      createSongFromFile, play, delete+undo, duplicates, queue ops
    dragdrop.ts     top zone once, delegated gaps, full-window overlay
    controls.ts     audio handlers, keyboard, spotlight, seek tooltip
test/
  doublylinked.test.mjs
  player.test.mjs
  movetarget.test.mjs
  player2.test.mjs  shuffle bag, prevAction, restore, playingList
  gaps.test.mjs     gap invariant (alternating, 0-row one gap, leak fix, filtered no gaps)
  rowstate.test.mjs current-row helpers, gap spacing, visualizer bins
```

All `src` files are under ~300 lines; song list is patched by `song.id` (no `innerHTML` rebuild), `#songList` children are strictly `gap, row, gap, row, ..., gap` (rows+1 gaps, `data-index=k`) recomputed on every patch (reuse gap nodes, remove extras) — filtered lists render rows without gaps, 0 rows shows one gap as empty-state drop target — and drag handlers are attached once.

## Features

- **Load**: styled buttons for hidden `audio/*` + `webkitdirectory`; object URLs, duration probed with hidden `Audio`, re-link for persisted entries.
- **Playback**: play/pause, next/prev (pointer hops), seek with tooltip, volume, mute, visualizer (48 mirrored bars, hue gradient).
- **Add anywhere**: start/end, drop on gaps (gap 8px, first row ≤24px below toolbar, gaps glow on drag-over to 40px), Insert after button, full-window Drop to add overlay.
- **Reorder**: drag with lift + glowing gap (rows+1 gaps owned by patch), `move(from,to)` via `moveTarget` (0→last gives [B,C,D,A], last→0 gives [A,B,C,D]), plus Play next / Move to top/bottom.
- **Delete + Undo**: neighbour move via `node.next/prev`, ref-count URL revoke, 6s Undo toast (`restore`).
- **Playlists**: each a `DoublyLinkedList`; create/rename/delete/switch (glass pills), `Playing from <playlist>` chip, Add to… popover, no `prompt`.
- **Extras**: shuffle bag (every song once, no immediate repeat, history prev), repeat off/all/one, search, `prevAction` (>3s restart), persistence across reloads, queue ops, keyboard: Space, Arrows, Shift+Arrows, Up/Down, M/S/R, / and ? and Delete, Tab/Enter/Space rows.

## Operations → pointer writes (counted from `doublylinked.ts` and `player.ts`)

| Operation | # pointer writes (runtime) | Assignments in code |
|---|---|---|
| `addFirst(value)` empty | 2 | `head = node`, `tail = node` |
| `addFirst(value)` non-empty | 3 | `node.next = head` (1), `head.prev = node` (2), `head = node` (3) |
| `addLast(value)` empty | 2 | `head = node`, `tail = node` |
| `addLast(value)` non-empty | 3 | `node.prev = tail` (1), `tail.next = node` (2), `tail = node` (3) |
| `insertAt(index,value)` middle | 4 | `newNode.prev = prev` (1), `newNode.next = next` (2), `next.prev = newNode` (3), `prev.next = newNode` (4) |
| `insertAt(0/size)` | 2-3 | delegates to `addFirst`/`addLast` |
| `removeNode(node)` | 4 | `prev.next = next` or `head = next` (1), `next.prev = prev` or `tail = prev` (2), `node.prev = null` (3), `node.next = null` (4) |
| `removeAt(index)` | 4 | via `removeNode(nodeAt(index))` |
| `move(from,to)` | 7-8 | detach 4 (`prev.next/head`, `next.prev/tail`, `node.prev=null`, `node.next=null`) + re-insert 3 (head/tail edge: `node.next/head.prev/head` or `node.prev/tail.next/tail`) or 4 (middle as `insertAt`) — reuses node |
| `restore(index,value)` | 4 | alias `insertAt` for undo |
| `moveTarget(from,gap)` | 0 | pure: `gap===from\|\|gap===from+1→null` else `from<gap?gap-1:gap` |
| `nodeAt(index)` | 0 | walk from nearer end |
| `Player.next/prev` | 1 | `current = current.next` / `current = current.prev` (shuffle: `bagPos++/history pop`, repeat all wraps) |
| `prevAction(t)` | 0 | pure: `t>3?"restart":"prev"` |

`DoublyLinkedList` uses no arrays for storage; `toArray()` only for rendering/tests.

## IMPROVE.md/IMPROVE2.md choices

- **Persist** implemented: versioned `localStorage` key stores names + order + metadata; URLs are not persisted, restored songs show `re-link` and are matched by `fileName+fileSize` on drop. This is cheaper and more visible than only Move to top/bottom, but both are kept.
- **Move to top/bottom** also kept as row buttons (spec allowed picking cheaper one; we did both).

## Search online

Uses the **iTunes Search API** (`https://itunes.apple.com/search?term=<q>&media=music&entity=song&limit=25`) — no API key, CORS enabled (`access-control-allow-origin: *`). Each result provides a **30 s preview** (`previewUrl` AAC .m4a, `artworkUrl100` upgraded to `300x300bb`). The panel debounces 350 ms, cancels stale requests with `AbortController`, caches 20 queries for 5 min, filters queries <2 chars, dedupes by `trackId` and hides entries without `previewUrl`. Remote songs persist fully (preview URL is remote, no blob revoke) and show artwork/artist; hue still from title hash. Preview plays in the shared `<audio>` with `crossOrigin="anonymous"` so the Web Audio visualizer keeps working.

## Features (added in this round)

- **Search online**: glass panel opened via “Search online” pill or `Ctrl+K`, All/Artist/Song chips (`attribute=artistTerm`/`songTerm`), skeleton/empty/error+Retry, `aria-live="polite"` count, focus trap, Esc, keyboard nav (Up/Down, Enter preview, Shift+Enter add to end), draggable results onto gaps (gap drop reuses `moveTarget` path).
- **Remote songs**: `source:"local"|"remote"`, `remoteId`, `artworkUrl`, `artist`, `trackTimeMillis`; URL is `previewUrl` (never revoked), duplicate check by `remoteId`, rows/hero show artwork (lazy, async, gradient fallback) and `Artist · 0:30 · #n` with full-track tooltip, vinyl label uses artwork.

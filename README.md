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

## YouTube search

YouTube playback uses the official **IFrame Player API** (`https://www.youtube.com/iframe_api`) — the embedded player stays VISIBLE (>=200x200, never hidden/covered, no audio extraction). Search without a key uses a **Piped fallback chain** (`https://api.piped.private.coffee` → `https://pipedapi.kavin.rocks` → `https://pipedapi.adminforge.de` → `https://api.piped.privacydev.net`, 4s AbortController timeout per host, `filter=music_songs` then `filter=videos`, drop `isShort`/live/duplicates, thumbnail `https://i.ytimg.com/vi/<id>/mqdefault.jpg`, cleaned title, remember healthy host 10 min via sessionStorage). With a personal **YouTube Data API v3 key** (stored only in `localStorage lb.ytkey`, never committed, never shown in UI) it calls `search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true` + `videos?part=contentDetails` (ISO-8601 `PT#H#M#S`). Result rows show `FULL SONG` badge and add/play actions; debounced 350ms, cancel stale, cache 20×5 min, >=2 chars.

## Add by link

Single field at top of dialog + `Ctrl+V` anywhere + drag link onto gap. `classifyUrl` (trim, http/https only, reject `javascript:`, `data:`, `file:`, `blob:`, `ftp:`) kinds: `audio` (mp3/m4a/... or content-type probe), `youtube` (watch?v=, youtu.be/ID, /shorts/ID, /embed/ID, music/m.youtube, `&list=` ignored), `spotify` (track/album/playlist/episode, `/intl-xx/`, `?si=`, `spotify:track:ID`), `apple` (`?i=<id>` / `/song/.../<id>` / `id<id>`), `unsupported` (SoundCloud etc), `invalid`. YouTube → oEmbed/noembed → `source:"youtube"` + videoId; Spotify → oEmbed title then YouTube+iTunes search with honest message; Apple → iTunes lookup → 30s preview; Audio → probe `Audio` (8s) + `HEAD` CORS check (`crossOrigin="anonymous"` if ok, else separate `<audio>` with no Web Audio + idle visualizer), mixed-content upgrade, decoded filename, duration.

## Free Music (CC) + Downloads

**Internet Archive** `advancedsearch.php?q=mediatype:audio AND licenseurl:*creativecommons*` (CORS `*`) + `metadata/<id>` → `files[]` (`VBR MP3` > `MP3` > `Ogg Vorbis` via `pickAudioFile`), license badge `parseLicense` (`CC BY`/`SA`/`NC`/`CC0`), attribution `"<title> by <creator>, <license>, via Internet Archive"`. **Download** allowed ONLY for (a) local blobs, (b) direct audio links (`fetch`→Blob→`a[download]` else open tab), (c) CC items (`<title> - <creator>.<ext>` + `ATTRIBUTION.txt`). YouTube/iTunes show DISABLED with tooltip “Downloads aren't offered for YouTube or iTunes content (copyright and terms of service)”. No zip.

## Limitations

- Spotify is **link-to-search only** (not playable here).
- iTunes = **30s previews** only.
- Visualizer **N/A for YouTube** and non-CORS sources (idle breathing bars + label).
- YouTube embeds need referrer; `Referrer-Policy: strict-origin-when-cross-origin` + `Permissions-Policy: autoplay=(self "https://www.youtube.com"), fullscreen=(self)`.

## Downloads

Downloads are offered only for local files, direct audio links you pasted, and Free Music (CC) items. YouTube and iTunes/Spotify content is not downloadable (copyright and ToS). For CC items an `ATTRIBUTION.txt` with license is offered.

## Features (added in this round — round 17)

- **Circular scrubber**: hero 260px SVG ring (track `--rule` 2px, arc `--ink` 4px butt at 12 o'clock, 12px knob →16px on hover/drag/focus via transform) wrapping the record/Youtube slot and dock 72px ring around the 56px play button; both are `role=slider` (hero) with `aria-valuenow/text`, pointer capture `angleToProgress`, keyboard Left/Right ±5s Home/End PageUp/PageDown ±30s, indeterminate dash 1.2s when buffering/unknown; pure module `src/ui/ring.ts` (`ringGeometry`, `angleToProgress`, `clampSeek`); linear `#progressBar` removed, dock shows `0:42 / 3:40` under title, `MediaSession` seekto still works.
- **Logo that moves in circles**: 28px inline SVG two interlocked rings + orbiting dot (r14 6s linear, 3s while playing) next to wordmark (also 20px ink-on-paper inside fallback record label and favicon); record vinyl (non-YouTube) rotates 8s/turn with visible tick+dot and `transform-origin:center`, `animation-play-state` paused/resumed without snap; `prefers-reduced-motion` disables orbit/rotation.
- **Dock fixed (round 16 regression)**: explicit 3-column grid (`left: cover+title/time | center: back10/prev/play-ring/next/fwd10 | right: Up next toggle/speed/mute/volume`) 88px (96 mobile, ≥8px pad, no overflow) with right cluster collapsing into `…` on mobile; **Up next** is `aria-expanded` toggle opening a docked sheet above the dock (max-height 50vh, scroll, paper, hairline top, 4px radius, transform/opacity motion, close on Esc/outside/second click).

## Features (added in round 16)

- **YouTube playback synced**: `YouTubeEngine` polls every 250 ms (`getPlayerState`/`getCurrentTime`/`getDuration`) after `onReady`, emits `time`/`state`/`ended` even if `onStateChange` never fires; queued `playVideo()` and `seekTo()` if requested before ready; `ArrowRight`/+5 s and dock icons stay in sync and auto-advance on `ENDED`.
- **Undo/redo wired**: single `UndoManager` in `state.ts` (cap 50) for every mutation (`add`/`insert`/`delete`/`move`/`reverse`/`sort`/`shuffle-order`/`merge`/`split`/`playlist create/delete/rename`); `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`/`Ctrl+Y` at document level (ignored in inputs), toasts `Undone: <label>`/`Redone: <label>`, visible `UNDO`/`REDO` buttons with `aria-disabled`; delete toast’s Undo uses same manager and does not restart playback.
- **Local audio survives reload**: `storeBlob` with `canStore` (80 MB/file, 300 MB total) + `navigator.storage.persist()` once; on startup rehydrates each `source:"local"` from `getBlob` with fresh `blob:` URL; `STORED LOCALLY 42 MB / 300 MB` + “Remove stored audio” in drawer; deleting a song removes its blob, “Clear library” clears all; per-file failure keeps re-link state and toasts.
- **Up next queue**: `upNext(10)` walking `node.next` (or shuffle bag order) renders rows with title/duration/`#` offset, drag to reorder via `list.move` through `UndoManager`, “Play next” and click-to-play, refreshes on every list/current-node change; empty shows “Nothing up next”.
- **Search polish**: YouTube `ArrowDown` → `Shift+Enter` adds highlighted to end (`Enter` = Play now) with ink outline; Free Music rows use same layout as YouTube (cover letter, title, creator, license badge `CC`/`CC BY`/… never `UNKNOWN`, actions Play now/Add to end/…), request `fl[]` includes `licenseurl`+`creator` and handles `creator` array; `cleanYoutubeTitle` strips empty `()`/`[]`, trailing separators and splits `"<author> - "` into artist/title; Spotify link shows YouTube + iTunes matches in dialog (injected fetch test).
- **Dock layout**: explicit two-row grid (row 1 transport `back10/prev/play/next/fwd10`, row 2 seek line with times) and speed toggle moved to right cluster next to volume; all boxes inside 88 px dock with ≥8 px bottom padding at 1280×900 and 390×844 (mobile hides speed toggle behind `…`).
- **Extras still**: Export library JSON + playlist M3U, Import validated, playlist stats `1 song`/`12 songs` (`~` when partial), Sleep timer, visualizer N/A label, etc. all under ~300 lines per file, `textContent` only for remote strings, `transform`/`opacity` only, `prefers-reduced-motion` honored, no `any`/`@ts-ignore`.

## Requirement -> where it lives -> how to demo it (assignment checklist)

| Requirement | Where it lives | How to demo (10s) |
|---|---|---|
| Add at start | `src/doublylinked.ts:addFirst` + `src/ui/controls.ts:addFirstBtn` + `src/ui/actions.ts:handleFiles` | Click Add to start -> pick file -> row appears at top |
| Add at end | `src/doublylinked.ts:addLast` + `controls:addLastBtn` | Click Add to end -> pick file -> row at bottom |
| Add at any position without typing number (drag & drop gaps) | `src/doublylinked.ts:insertAt` + `src/ui/gaps.ts` + `src/ui/dragdrop.ts` + `src/ui/render.ts` | Drag row -> drop on glowing gap -> order changes |
| Insert after via button | `src/ui/songRow.ts:openRowMenu -> Insert after` + `state:pendingInsertIndex` | Row menu -> Insert after -> pick file -> inserted after |
| Delete | `src/doublylinked.ts:removeNode` + `src/ui/actions.ts:handleDelete` | Row Remove -> toast Undo |
| Advance (next) | `src/player.ts:next` (node.next O(1)) + `src/ui/controls.ts:handleNext` | Click Next or Shift+Right |
| Go back (prev) | `src/player.ts:prev` (node.prev O(1)) + `controls:handlePrev` | Click Prev or Shift+Left |
| Extra: shuffle, repeat, search, visualizer, keyboard J/L, -10s/+10s, speed, volume, Media Session | `src/player.ts` bag, repeat, `src/ui/controls.ts` | Press S/R/J/L, -10s/+10s buttons, 1x cycles, M mute |
| Load from file system (no hardcoded songs) | `src/ui/actions.ts:createSongFromFile` + file inputs `audio/*` + `webkitdirectory` | Click Add audio files -> OS picker -> local files only |
| Playlists each a list | `src/library.ts:Library` Map<string, DoublyLinkedList> | Create playlist -> Switch -> independent lists |
| Frontend | `index.html` + `styles/*.css` + `src/ui/*` editorial paper/ink | Open http://localhost:8000 |
| TypeScript | `src/**/*.ts` strict, `npm run build` | `npm run build` passes |

## Big-O table (every list operation)

| Operation | Time | Why |
|---|---|---|
| `addFirst` | O(1) | head pointer |
| `addLast` | O(1) | tail pointer |
| `nodeAt(i)` | O(n) O(min(i,n-i)) | walk from nearer end |
| `insertAt(i)` | O(n) | nodeAt + 4 pointer writes |
| `removeNode` | O(1) | bypass neighbours |
| `removeAt(i)` | O(n) | nodeAt + removeNode |
| `move(f,t)` | O(n) | two walks + detach+reinsert |
| `reverse` | O(n) | swap prev/next per node + head/tail |
| `swap(a,b)` | O(1) | relink 4 neighbours |
| `sortBy(cmp)` | O(n log n) | merge sort by relinking, stable |
| `concat(other)` | O(1) | splice tail.next / head.prev |
| `splitAt(i)` | O(n) walk + O(1) cut | walk nearest end then 2 cuts |
| `shuffleInPlace` | O(n log n) worst (swap via nodeAt) | Fisher-Yates via relinking |
| `Player.next/prev` | O(1) | pointer hop |
| `toArray` | O(n) | snapshot only |

## Where arrays are used and why (never as playlist storage)

| Location | Use | Why not a list |
|---|---|---|
| `src/ui/render.ts` snapshot | `toArray()` via traversal | rendering needs indexed snapshot |
| `src/player.ts:bag` + `history` | `ListNode[]` shuffle bag, history stack | random access & Fisher-Yates need array; playlist remains list |
| `src/search.ts:SearchCache` | `Map<string,SearchResult[]>` | cache of API results |
| `src/ui/persistence.ts` serialization | `PersistedSong[]` per playlist | JSON needs array, rebuilt as list on load |
| Undo snapshots in `src/ui/listActions.ts` | `ListNode[]` order capture | temporary snapshot restored by relinking |

No playlist is stored as an array.

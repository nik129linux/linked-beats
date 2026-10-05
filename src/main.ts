import { audioEl, linkedViewEl, linkedCaptionEl } from "./ui/dom.js";
import { renderAll } from "./ui/render.js";
import { initDragDrop } from "./ui/dragdrop.js";
import { initControls } from "./ui/controls.js";
import { initLinkedView } from "./ui/linkedview.js";
import { initSearchPanel } from "./ui/searchPanel.js";
import { library, player } from "./state.js";
import { initExtras } from "./ui/extras.js";
// Wiring hub: ensure every feature module is transitively imported from main.js
import "./engine.js";
import "./engines.js";
import "./archive.js";
import "./ytsearch.js";
import "./links.js";
import "./download.js";
import "./export.js";
import "./idb.js";
import "./queue.js";
import "./sleeptimer.js";
import "./stats.js";
import "./undo.js";
import "./ui/ring.js";

audioEl.crossOrigin = "anonymous";
audioEl.volume = 0.9;
if (linkedViewEl && linkedCaptionEl) initLinkedView(linkedViewEl, linkedCaptionEl);
initDragDrop();
initControls();
initSearchPanel();
renderAll();
(window as unknown as { __renderAll?: () => void }).__renderAll = renderAll;
document.addEventListener("row-move", () => renderAll());
initExtras();

declare global {
  interface Window {
    __library: typeof library;
    __player: typeof player;
  }
}
window.__library = library;
window.__player = player;

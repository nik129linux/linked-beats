import { audioEl, linkedViewEl, linkedCaptionEl } from "./ui/dom.js";
import { renderAll } from "./ui/render.js";
import { initDragDrop } from "./ui/dragdrop.js";
import { initControls } from "./ui/controls.js";
import { initLinkedView } from "./ui/linkedview.js";
import { initSearchPanel } from "./ui/searchPanel.js";
import { library, player } from "./state.js";

audioEl.crossOrigin = "anonymous";
audioEl.volume = 0.9;
if (linkedViewEl && linkedCaptionEl) initLinkedView(linkedViewEl, linkedCaptionEl);
initDragDrop();
initControls();
initSearchPanel();
renderAll();
(window as unknown as { __renderAll?: () => void }).__renderAll = renderAll;
document.addEventListener("row-move", () => renderAll());

declare global {
  interface Window {
    __library: typeof library;
    __player: typeof player;
  }
}
window.__library = library;
window.__player = player;

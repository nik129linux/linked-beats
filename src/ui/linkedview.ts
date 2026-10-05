import { player, getActiveList } from "../state.js";

// Horizontal strip showing real nodes with rectangles and arrow lines.

let container: HTMLElement | null = null;
let captionEl: HTMLElement | null = null;
let lastWrites = "";

export function initLinkedView(c: HTMLElement, caption: HTMLElement): void {
  container = c;
  captionEl = caption;
}

export function setCaption(op: string, writes: number): void {
  lastWrites = `${op}: ${writes} pointer writes`;
  if (captionEl) captionEl.textContent = lastWrites;
  captionEl?.classList.add("flash");
  setTimeout(() => captionEl?.classList.remove("flash"), 600);
}

export function renderLinkedView(): void {
  if (!container) return;
  const viewed = getActiveList();
  container.innerHTML = "";
  const strip = document.createElement("div");
  strip.className = "ll-strip";
  strip.setAttribute("role", "list");
  strip.setAttribute("aria-label", "Linked list nodes");

  const playingList = player.getPlayingList();
  const isViewingPlaying = viewed === playingList;

  let cur = viewed.head;
  let idx = 0;
  while (cur !== null) {
    const nodeEl = document.createElement("div");
    nodeEl.className = "ll-node";
    nodeEl.setAttribute("role", "listitem");
    if (player.current === cur && isViewingPlaying) nodeEl.classList.add("current");
    const prevTag = document.createElement("span");
    prevTag.className = "ll-prev";
    prevTag.textContent = cur.prev ? "prev" : "null";
    const mid = document.createElement("span");
    mid.className = "ll-mid";
    mid.textContent = cur.value.title.slice(0, 20) || `node ${idx}`;
    mid.title = cur.value.title;
    const nextTag = document.createElement("span");
    nextTag.className = "ll-next";
    nextTag.textContent = cur.next ? "next" : "null";
    nodeEl.append(prevTag, mid, nextTag);
    if (idx === 0) {
      const headTag = document.createElement("span");
      headTag.className = "ll-tag head";
      headTag.textContent = "head";
      nodeEl.prepend(headTag);
    }
    if (cur.next === null) {
      const tailTag = document.createElement("span");
      tailTag.className = "ll-tag tail";
      tailTag.textContent = "tail";
      nodeEl.appendChild(tailTag);
    }
    strip.appendChild(nodeEl);
    if (cur.next !== null) {
      const arrow = document.createElement("span");
      arrow.className = "ll-arrow";
      arrow.setAttribute("aria-hidden", "true");
      strip.appendChild(arrow);
    }
    cur = cur.next;
    idx++;
  }

  if (idx === 0) {
    const empty = document.createElement("span");
    empty.className = "muted small";
    empty.textContent = "empty list";
    strip.appendChild(empty);
  }

  container.appendChild(strip);
  // auto-center current with transform translateX (no scrollIntoView to avoid page scroll)
  requestAnimationFrame(() => {
    const curEl = strip.querySelector(".ll-node.current") as HTMLElement | null;
    if (curEl && container) {
      const cRect = container.getBoundingClientRect();
      const nRect = curEl.getBoundingClientRect();
      const stripRect = strip.getBoundingClientRect();
      const targetCenter = cRect.width / 2;
      const nodeCenter = nRect.left - stripRect.left + nRect.width / 2;
      const delta = nodeCenter - targetCenter;
      if (Math.abs(delta) > 2) {
        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!prefersReduced) {
          strip.style.transform = `translateX(${-delta}px)`;
          strip.classList.add("moving");
          const done = (): void => {
            strip.style.transform = "";
            strip.classList.remove("moving");
            // center via horizontal scroll on container only (no vertical scroll, no page scroll)
            if (!container) return;
            const newRect = curEl.getBoundingClientRect();
            const sRect = strip.getBoundingClientRect();
            const cR = container.getBoundingClientRect();
            const nc = newRect.left - sRect.left + newRect.width / 2;
            const tc = cR.width / 2;
            const d2 = nc - tc;
            if (Math.abs(d2) > 2) {
              container.scrollTo({ left: container.scrollLeft + d2, behavior: "smooth" });
            }
          };
          setTimeout(done, 700);
        } else {
          if (!container) return;
          const d = delta;
          container.scrollTo({ left: container.scrollLeft + d, behavior: "auto" });
        }
      } else {
        // already centered; ensure no scrollIntoView that would move page
        // maintain horizontal position only if needed via container.scrollLeft
      }
    }
  });
  highlightArrows();
}

function highlightArrows(): void {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) return;
  const arrows = container?.querySelectorAll(".ll-arrow");
  arrows?.forEach((a) => {
    a.classList.remove("flash");
    // force reflow
    void (a as HTMLElement).offsetWidth;
    a.classList.add("flash");
    setTimeout(() => a.classList.remove("flash"), 300);
  });
}

export function flashLinkedView(): void {
  highlightArrows();
}

export function getCaption(): string {
  return lastWrites;
}

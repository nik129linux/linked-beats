import { currentTitleEl } from "./dom.js";

function splitWords(title: string): string[] {
  return title.trim().split(/\s+/).filter(Boolean);
}

function buildMaskedTitle(title: string, animateIn: boolean): void {
  currentTitleEl.innerHTML = "";
  const words = splitWords(title);
  if (words.length === 0) {
    currentTitleEl.textContent = title;
    return;
  }
  words.forEach((w, i) => {
    const mask = document.createElement("span");
    mask.className = "word-mask";
    const inner = document.createElement("span");
    inner.className = "word-inner";
    inner.textContent = w;
    if (animateIn) {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!prefersReduced) {
        inner.style.animationDelay = `${i * 40}ms`;
        requestAnimationFrame(() => inner.classList.add("enter"));
      }
    }
    mask.appendChild(inner);
    currentTitleEl.appendChild(mask);
    if (i < words.length - 1) currentTitleEl.appendChild(document.createTextNode(" "));
  });
}

export function doMaskedReveal(newTitle: string): void {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    currentTitleEl.textContent = newTitle;
    return;
  }
  const oldWords = currentTitleEl.querySelectorAll(".word-mask");
  if (oldWords.length === 0) {
    const oldText = currentTitleEl.textContent ?? "";
    if (!oldText || oldText === "Nothing playing" || oldText === "No song selected") {
      buildMaskedTitle(newTitle, true);
      return;
    }
    buildMaskedTitle(oldText, false);
    const masks = currentTitleEl.querySelectorAll(".word-inner");
    masks.forEach((el, i) => {
      (el as HTMLElement).style.animationDelay = `${i * 30}ms`;
      el.classList.add("exit");
    });
    setTimeout(() => buildMaskedTitle(newTitle, true), 420 + oldWords.length * 30);
    return;
  }
  const oldInners = currentTitleEl.querySelectorAll(".word-inner");
  oldInners.forEach((el, i) => {
    (el as HTMLElement).style.animationDelay = `${i * 30}ms`;
    el.classList.remove("enter");
    el.classList.add("exit");
  });
  const delay = 420 + oldInners.length * 30;
  setTimeout(() => buildMaskedTitle(newTitle, true), delay);
}

export function buildInitialTitle(title: string): void {
  buildMaskedTitle(title, true);
}

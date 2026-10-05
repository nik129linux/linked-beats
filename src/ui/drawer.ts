import { playlistsToggleBtn, shortcutsToggleBtn, menuToggleBtn, menuSheetEl, closeMenuBtn, closeShortcutsBtn, shortcutsDialogEl } from "./dom.js";

function toggleShortcuts(): void {
  if (!shortcutsDialogEl) return;
  const hidden = shortcutsDialogEl.classList.contains("hidden");
  if (hidden) shortcutsDialogEl.classList.remove("hidden");
  else shortcutsDialogEl.classList.add("hidden");
}

export function initDrawerToggle(): void {
  const drawer = document.getElementById("playlistDrawer") as HTMLElement | null;
  const layout = document.getElementById("layoutRoot") as HTMLElement | null;
  if (!drawer || !playlistsToggleBtn) return;
  const toggle = playlistsToggleBtn;
  const dialog = shortcutsDialogEl;
  const mq = window.matchMedia("(max-width: 960px)");
  const applyMq = (): void => {
    if (mq.matches) {
      drawer.classList.add("hidden-drawer");
      layout?.classList.remove("drawer-open");
      toggle.setAttribute("aria-expanded", "false");
    } else {
      drawer.classList.remove("hidden-drawer");
      layout?.classList.add("drawer-open");
      toggle.setAttribute("aria-expanded", "true");
    }
  };
  applyMq();
  mq.addEventListener("change", applyMq);
  toggle.addEventListener("click", () => {
    const isHidden = drawer.classList.contains("hidden-drawer");
    drawer.classList.toggle("hidden-drawer", !isHidden ? true : false);
    if (isHidden) {
      drawer.classList.remove("hidden-drawer");
      layout?.classList.add("drawer-open");
      toggle.setAttribute("aria-expanded", "true");
    } else {
      drawer.classList.add("hidden-drawer");
      layout?.classList.remove("drawer-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
  shortcutsToggleBtn?.addEventListener("click", () => toggleShortcuts());
  closeShortcutsBtn?.addEventListener("click", () => dialog?.classList.add("hidden"));
  dialog?.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.classList.add("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dialog && !dialog.classList.contains("hidden")) {
      dialog.classList.add("hidden");
    }
  });
}

export function initMenuSheet(): void {
  if (!menuToggleBtn || !menuSheetEl) return;
  const toggle = menuToggleBtn;
  const sheet = menuSheetEl;
  // CSS handles visibility at 720px breakpoint; JS only ensures hidden on desktop resize
  const mq = window.matchMedia("(max-width: 720px)");
  const sync = (): void => {
    if (!mq.matches) sheet.classList.add("hidden");
  };
  sync();
  mq.addEventListener("change", sync);
  const getFocusable = (): HTMLElement[] =>
    Array.from(sheet.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')).filter(
      (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
    );
  const trap = (e: KeyboardEvent): void => {
    if (e.key !== "Tab" || sheet.classList.contains("hidden")) return;
    const focusable = getFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus({ preventScroll: true } as FocusOptions);
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus({ preventScroll: true } as FocusOptions);
    }
  };
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && !sheet.classList.contains("hidden")) {
      e.preventDefault();
      sheet.classList.add("hidden");
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus({ preventScroll: true } as FocusOptions);
    }
  };
  const open = (): void => {
    sheet.classList.remove("hidden");
    toggle.setAttribute("aria-expanded", "true");
    // focus first menu item without scrolling page
    const first = getFocusable()[0];
    first?.focus({ preventScroll: true } as FocusOptions);
    document.addEventListener("keydown", trap);
    document.addEventListener("keydown", onEsc);
  };
  const close = (): void => {
    sheet.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", trap);
    document.removeEventListener("keydown", onEsc);
    toggle.focus({ preventScroll: true } as FocusOptions);
  };
  toggle.addEventListener("click", () => {
    const hidden = sheet.classList.contains("hidden");
    if (hidden) open();
    else close();
  });
  closeMenuBtn?.addEventListener("click", () => {
    close();
  });
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) {
      close();
    }
  });
  for (const btn of Array.from(sheet.querySelectorAll("[data-menu]")) as HTMLElement[]) {
    btn.addEventListener("click", () => {
      const which = btn.dataset["menu"];
      sheet.classList.add("hidden");
      toggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("keydown", trap);
      document.removeEventListener("keydown", onEsc);
      if (which === "search") document.getElementById("openSearchBtn")?.click();
      if (which === "playlists") playlistsToggleBtn?.click();
      if (which === "shortcuts") toggleShortcuts();
    });
  }
}

export { toggleShortcuts };

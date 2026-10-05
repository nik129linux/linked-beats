// Glass modal dialogs replacing alert/prompt/confirm.

let overlay: HTMLElement | null = null;

function getOverlay(): HTMLElement {
  if (overlay && overlay.isConnected) return overlay;
  let el = document.getElementById("dialogOverlay") as HTMLElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "dialogOverlay";
    el.className = "dialog-overlay hidden";
    el.innerHTML = `<div class="dialog" role="dialog" aria-modal="true"><h3 class="dialog-title"></h3><p class="dialog-msg"></p><div class="dialog-input-wrap hidden"><input class="dialog-input" type="text" /></div><div class="dialog-actions"></div></div>`;
    document.body.appendChild(el);
  }
  overlay = el;
  return el;
}

interface DialogOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputValue?: string;
  placeholder?: string;
  showInput?: boolean;
}

let dialogOpener: HTMLElement | null = null;
function openDialog(opts: DialogOpts): Promise<string | boolean | null> {
  const o = getOverlay();
  dialogOpener = document.activeElement as HTMLElement | null;
  const titleEl = o.querySelector(".dialog-title") as HTMLElement;
  const msgEl = o.querySelector(".dialog-msg") as HTMLElement;
  const wrap = o.querySelector(".dialog-input-wrap") as HTMLElement;
  const input = o.querySelector(".dialog-input") as HTMLInputElement;
  const actions = o.querySelector(".dialog-actions") as HTMLElement;

  titleEl.textContent = opts.title;
  msgEl.textContent = opts.message ?? "";
  msgEl.style.display = opts.message ? "block" : "none";

  actions.innerHTML = "";
  wrap.classList.toggle("hidden", !opts.showInput);
  if (opts.showInput) {
    input.value = opts.inputValue ?? "";
    if (opts.placeholder) input.placeholder = opts.placeholder;
  }

  o.classList.remove("hidden");

  const focusEl = opts.showInput ? input : (actions.querySelector("button") as HTMLElement | null) ?? input;
  setTimeout(() => focusEl?.focus({ preventScroll: true } as FocusOptions), 30);

  return new Promise((resolve) => {
    const close = (val: string | boolean | null): void => {
      o.classList.add("hidden");
      document.removeEventListener("keydown", onKey);
      if (dialogOpener) { dialogOpener.focus({ preventScroll: true } as FocusOptions); dialogOpener = null; }
      resolve(val);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close(null);
      if (e.key === "Enter" && opts.showInput) {
        e.preventDefault();
        close(input.value);
      }
    };
    document.addEventListener("keydown", onKey);
    o.addEventListener(
      "click",
      (e) => {
        if (e.target === o) close(null);
      },
      { once: true },
    );

    if (opts.showInput) {
      const ok = document.createElement("button");
      ok.className = "btn primary";
      ok.textContent = opts.confirmLabel ?? "Confirm";
      ok.addEventListener("click", () => close(input.value));
      const cancel = document.createElement("button");
      cancel.className = "btn ghost";
      cancel.textContent = opts.cancelLabel ?? "Cancel";
      cancel.addEventListener("click", () => close(null));
      actions.appendChild(cancel);
      actions.appendChild(ok);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          close(input.value);
        }
      });
    } else {
      const cancel = document.createElement("button");
      cancel.className = "btn ghost";
      cancel.textContent = opts.cancelLabel ?? "Cancel";
      cancel.addEventListener("click", () => close(false));
      const ok = document.createElement("button");
      ok.className = "btn primary";
      ok.textContent = opts.confirmLabel ?? "Confirm";
      ok.addEventListener("click", () => close(true));
      // If it's an alert-like dialog with only confirm, hide cancel? Check caller
      if (opts.cancelLabel === "") {
        actions.appendChild(ok);
      } else {
        actions.appendChild(cancel);
        actions.appendChild(ok);
      }
    }
  });
}

export function confirmDialog(title: string, message?: string): Promise<boolean> {
  return openDialog({ title, message, confirmLabel: "Confirm", cancelLabel: "Cancel" }).then(
    (v) => v === true,
  );
}

export function promptDialog(
  title: string,
  defaultValue?: string,
  placeholder?: string,
): Promise<string | null> {
  return openDialog({
    title,
    message: "",
    showInput: true,
    inputValue: defaultValue ?? "",
    placeholder,
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
  }).then((v) => (typeof v === "string" ? v : null));
}

export function alertDialog(title: string, message?: string): Promise<void> {
  return openDialog({ title, message, confirmLabel: "OK", cancelLabel: "" }).then(() => undefined);
}

// Glass toasts with auto-dismiss and optional action button.

let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (container && container.isConnected) return container;
  let el = document.getElementById("toastContainer") as HTMLElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "toastContainer";
    el.className = "toast-container";
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  container = el;
  return el;
}

export interface ToastOpts {
  message: string;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export function showToast(opts: ToastOpts): void {
  const c = getContainer();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");

  const msg = document.createElement("span");
  msg.textContent = opts.message;
  msg.className = "toast-msg";
  toast.appendChild(msg);

  let timer: number | undefined;

  const dismiss = (): void => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 220);
    if (timer !== undefined) window.clearTimeout(timer);
  };

  if (opts.actionLabel && opts.onAction) {
    const btn = document.createElement("button");
    btn.className = "btn ghost small toast-action";
    btn.textContent = opts.actionLabel;
    btn.addEventListener("click", () => {
      opts.onAction?.();
      dismiss();
    });
    toast.appendChild(btn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", dismiss);
  toast.appendChild(closeBtn);

  c.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-in"));

  const dur = opts.duration ?? 2500;
  timer = window.setTimeout(dismiss, dur);

  toast.addEventListener("mouseenter", () => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
  toast.addEventListener("mouseleave", () => {
    timer = window.setTimeout(dismiss, 1500);
  });
}

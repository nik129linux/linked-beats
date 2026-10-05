/** Hash kept for potential use but not for hue */
export function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** No-op — aurora removed */
export function applyHue(_title: string | null): void {
}

export function coverStyle(_title: string): string {
  return "";
}

export function coverLetter(title: string): string {
  const t = title.trim();
  return t ? (t[0] ?? "?").toUpperCase() : "?";
}

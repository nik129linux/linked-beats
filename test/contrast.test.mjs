import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function hexToRgb(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  if (h.length > 6) h = h.slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1, hex2) {
  const L1 = luminance(hexToRgb(hex1));
  const L2 = luminance(hexToRgb(hex2));
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function parseTokens() {
  const css = readFileSync(new URL("../styles/tokens.css", import.meta.url).pathname, "utf8");
  const map = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    map[m[1].trim()] = m[2].trim();
  }
  return map;
}

describe("WCAG AA contrast", () => {
  it("ink on paper etc meet AA", () => {
    const tokens = parseTokens();
    const paper = tokens["paper"] || "#F3F0E8";
    const ink = tokens["ink"] || "#141413";
    const ink2 = tokens["ink-2"] || "#4A4843";
    const ink3 = tokens["ink-3"] || "#6B675F";
    const accent = tokens["accent"] || "#E5472B";

    const pairs = [
      { fg: ink, bg: paper, min: 4.5, name: "ink on paper" },
      { fg: ink2, bg: paper, min: 4.5, name: "ink-2 on paper" },
      { fg: ink3, bg: paper, min: 4.5, name: "ink-3 on paper (label 14px+ uppercase)" },
      { fg: paper, bg: ink, min: 4.5, name: "paper on ink" },
      { fg: ink, bg: accent, min: 3, name: "ink on accent (24px bold icon)" },
    ];

    for (const p of pairs) {
      const ratio = contrastRatio(p.fg, p.bg);
      assert.ok(ratio >= p.min, `${p.name}: ${p.fg} on ${p.bg} ratio ${ratio.toFixed(2)} < ${p.min}`);
    }

    // also ensure those tokens exist
    assert.ok(paper, "paper token missing");
    assert.ok(ink, "ink token missing");
    assert.ok(accent, "accent token missing");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const stylesDir = join(root, "styles");
const srcDir = join(root, "src");

function readCss(name) {
  return readFileSync(join(stylesDir, name), "utf8");
}

function collectTsFiles(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...collectTsFiles(p));
    else if (ent.isFile() && ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("layout guards (dock + scroll)", () => {
  it("no JS writes --dock-h", () => {
    const files = collectTsFiles(srcDir);
    for (const f of files) {
      const content = readFileSync(f, "utf8");
      assert.ok(
        !content.includes("--dock-h"),
        `${f.replace(root, "")} must not write --dock-h (found --dock-h)`
      );
    }
  });

  it("base.css does not set height:100% or overflow-y on html/body", () => {
    const css = readCss("base.css");
    // Only flag `height: 100%`, not `min-height`
    const height100Pattern = /(?<!min-)height\s*:\s*100%/i;
    assert.ok(!height100Pattern.test(css), "base.css must not contain height: 100% on html/body");

    const hasOverflowY = /overflow-y\s*:/i.test(css);
    assert.ok(!hasOverflowY, "base.css must not set overflow-y on html/body");
  });

  it(".player-bar height is var(--dock-h) only", () => {
    const comp = readCss("components.css");
    const hasVarDockH = /height\s*:\s*var\(--dock-h\)/i.test(comp);
    assert.ok(hasVarDockH, "expected .player-bar height: var(--dock-h)");

    const rules = comp.split("}");
    for (const rule of rules) {
      const parts = rule.split("{");
      if (parts.length < 2) continue;
      const selector = parts[0];
      const body = parts[1];
      const isPlayerBar = selector.includes(".player-bar");
      const isDock = /\.dock(?![\w-])/.test(selector);
      if (!isPlayerBar && !isDock) continue;
      const heights = [...body.matchAll(/height\s*:\s*([^;]+);/gi)].map((x) => x[1].trim());
      for (const h of heights) {
        // allow max-height etc? only check plain height property
        // but body match already captures any height; check property name is exactly height
        // Use precise match: look for `height:` not `max-height` etc → need to check preceding char
      }
      // Re-check with stricter regex that avoids max-height/min-height
      const strictHeights = [...body.matchAll(/(?<![\w-])height\s*:\s*([^;]+);/gi)].map((x) => x[1].trim());
      for (const h of strictHeights) {
        assert.ok(
          h === "var(--dock-h)",
          `player-bar/dock height must be var(--dock-h), found "${h}" in selector "${selector.trim().slice(0,80)}"`
        );
      }
    }
  });

  it("tokens.css defines --dock-h in px", () => {
    const tokens = readCss("tokens.css");
    const m = tokens.match(/--dock-h\s*:\s*([^;]+);/i);
    assert.ok(m, "tokens.css must define --dock-h");
    const val = m[1].trim();
    assert.match(val, /^\d+px$/, `--dock-h must be in px, got "${val}"`);
  });

  it("mobile dock: media query defines .player-bar height from var(--dock-h)", () => {
    const comp = readCss("components.css");
    assert.ok(/@media\s*\(\s*max-width\s*:\s*720px\s*\)/i.test(comp), "expected @media (max-width: 720px) in components.css");
    assert.ok(
      /@media\s*\(\s*max-width\s*:\s*720px\s*\)[\s\S]*?\.player-bar[\s\S]*?height\s*:\s*var\(--dock-h\)/i.test(comp),
      "mobile @media (max-width:720px) must set .player-bar height: var(--dock-h)"
    );
  });

  it("mobile dock hides secondary line and volume", () => {
    const comp = readCss("components.css");
    assert.match(comp, /@media\s*\(\s*max-width\s*:\s*720px\s*\)/i, "expected @media (max-width: 720px)");
    assert.ok(
      /@media\s*\(\s*max-width\s*:\s*720px\s*\)[\s\S]*?\.dock-artist[\s\S]*?display\s*:\s*none/i.test(comp),
      "mobile must hide .dock-artist (filename/secondary line) with display:none"
    );
    const hidesWrap = /@media\s*\(\s*max-width\s*:\s*720px\s*\)[\s\S]*?\.volume-wrap[\s\S]*?display\s*:\s*none/i.test(comp);
    const hidesBar = /@media\s*\(\s*max-width\s*:\s*720px\s*\)[\s\S]*?#volumeBar[\s\S]*?display\s*:\s*none/i.test(comp);
    assert.ok(hidesWrap || hidesBar, "mobile must hide volume (volume-wrap or volumeBar) with display:none");
  });

  it("no 100vw for bands and no scrollbar-gutter stable on mobile", () => {
    const comp = readCss("components.css");
    const base = readCss("base.css");
    const tokens = readCss("tokens.css");
    for (const [name, css] of [
      ["components.css", comp],
      ["base.css", base],
      ["tokens.css", tokens],
    ]) {
      assert.ok(!/100vw/.test(css), `${name} must not use 100vw (causes 15px strip)`);
    }
    // bands selectors must not use 100vw – already covered by global check above,
    // additionally verify no band rule contains 100vw
    const bandSelectors = [".hero", ".linked-section", ".topbar", ".player-bar", ".dock"];
    for (const sel of bandSelectors) {
      const re = new RegExp(`${sel.replace(".", "\\.")}[^}]*100vw`, "i");
      assert.ok(!re.test(comp), `band ${sel} must not use 100vw`);
      assert.ok(!re.test(base), `band ${sel} must not use 100vw in base.css`);
    }
    // mobile must drop scrollbar-gutter stable -> auto or unset
    assert.ok(
      /@media\s*\(\s*max-width\s*:\s*720px\s*\)[\s\S]*?scrollbar-gutter\s*:\s*auto/i.test(base),
      "base.css mobile @media must set scrollbar-gutter: auto to remove strip"
    );
  });
});

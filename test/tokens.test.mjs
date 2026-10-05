import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const stylesDir = new URL("../styles/", import.meta.url).pathname;

function readStyles() {
  if (!existsSync(stylesDir)) return [];
  const files = readdirSync(stylesDir).filter((f) => f.endsWith(".css"));
  return files.map((f) => ({ name: f, content: readFileSync(join(stylesDir, f), "utf8") }));
}

describe("token discipline", () => {
  it("no raw hex/rgb or banned properties outside tokens.css", () => {
    const files = readStyles();
    const bannedRe = /(backdrop-filter|box-shadow|filter:\s*blur|@media\s*\(\s*prefers-color-scheme:\s*dark\s*\))/i;
    const hexRe = /#[0-9a-fA-F]{3,8}\b/;
    const rgbRe = /\brgba?\(/;
    for (const { name, content } of files) {
      if (name === "tokens.css") continue;
      assert.ok(!hexRe.test(content), `${name} contains raw hex color`);
      assert.ok(!rgbRe.test(content), `${name} contains rgb()/rgba() literal`);
      assert.ok(!bannedRe.test(content), `${name} contains banned property: ${content.match(bannedRe)?.[0]}`);
    }
  });

  it("only allowed font families appear", () => {
    const files = readStyles();
    const indexHtml = readFileSync(new URL("../index.html", import.meta.url).pathname, "utf8");
    const all = files.map((f) => f.content).join("\n") + "\n" + indexHtml;
    // Find font-family declarations
    const re = /font-family\s*:\s*([^;{}]+)/gi;
    let m;
    const allowed = ["instrument serif", "inter", "times new roman", "serif", "system-ui", "sans-serif", "var("];
    while ((m = re.exec(all)) !== null) {
      const raw = m[1].toLowerCase();
      if (raw.includes("var(")) continue;
      if (raw.trim() === "inherit" || raw.trim() === "initial") continue;
      // split by comma
      const parts = raw.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
      for (const p of parts) {
        const clean = p.replace(/^["']|["']$/g, "").trim();
        if (!clean) continue;
        if (clean === "inherit" || clean === "var(--font-text)" || clean.startsWith("var(")) continue;
        // allow generic fallbacks and the two families
        const ok = allowed.some((a) => clean.includes(a));
        assert.ok(ok, `unexpected font family "${clean}" in "${m[0]}"`);
      }
    }
    // Also check Google Fonts link only has 2 families
    const links = [...indexHtml.matchAll(/<link[^>]+href="([^"]*fonts\.googleapis[^"]*)"/gi)].map((m) => m[1]).filter((h) => h.includes("family="));
    if (links.length > 0) {
      const href = links[0];
      const families = href.split("family=").slice(1).map((s) => s.split("&")[0].split(":")[0]);
      assert.ok(families.length <= 2, `Google Fonts link should have <=2 families, got ${families.length}: ${families.join(",")}`);
      const hasInstrument = families.some((f) => f.toLowerCase().includes("instrument"));
      const hasInter = families.some((f) => f.toLowerCase().includes("inter"));
      assert.ok(hasInstrument, "Google Fonts should include Instrument Serif");
      assert.ok(hasInter, "Google Fonts should include Inter");
    }
  });

  it("no JetBrains Mono", () => {
    const files = readStyles();
    const indexHtml = readFileSync(new URL("../index.html", import.meta.url).pathname, "utf8");
    const all = files.map((f) => f.content).join("\n") + indexHtml;
    assert.ok(!all.includes("JetBrains"), "JetBrains Mono should be removed");
  });

  it("color-scheme light meta present", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url).pathname, "utf8");
    assert.ok(html.includes('name="color-scheme"') && html.includes('content="light"'), "missing <meta name=\"color-scheme\" content=\"light\">");
    assert.ok(html.includes('name="theme-color"') && html.includes("#F3F0E8"), "missing theme-color #F3F0E8");
  });
});

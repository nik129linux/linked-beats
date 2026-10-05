import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

function collectJsFiles(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) collectJsFiles(p, out);
    else if (ent.isFile() && p.endsWith(".js")) out.push(p);
  }
  return out;
}

test("wiring: all dist modules reachable from main.js", () => {
  const root = join(dirname(new URL(import.meta.url).pathname), "..");
  const dist = join(root, "dist");
  const mainPath = join(dist, "main.js");
  assert.ok(existsSync(mainPath), "dist/main.js must exist (run tsc)");

  const allFiles = collectJsFiles(dist).map((p) => p.replace(dist + "/", ""));
  // whitelist: justify short list. Empty except we allow no unreachable; handlers for edge files already reachable
  // Explicit whitelist: none required - every .js should be imported. If a file is intentionally standalone, add here with comment.
  // Whitelist: only files that are test helpers or intentionally not part of runtime bundle.
  // ui/rowState.ts is a pure helper used only in tests (gap spacing / current-row helpers), not imported at runtime.
  const whitelist = [
    "ui/rowState.js",
  ];
  const isWhitelisted = (rel) => whitelist.includes(rel);

  // Build import graph via static import/export regex
  function parseImports(fileContent) {
    const out = [];
    const importFromRe = /import\s+[^;]*?from\s+["']([^"']+)["']/g;
    const exportFromRe = /export\s+[^;]*?from\s+["']([^"']+)["']/g;
    const sideRe = /import\s+["']([^"']+)["']/g;
    let m;
    while ((m = importFromRe.exec(fileContent)) !== null) out.push(m[1]);
    while ((m = exportFromRe.exec(fileContent)) !== null) out.push(m[1]);
    while ((m = sideRe.exec(fileContent)) !== null) out.push(m[1]);
    return out;
  }

  function resolveTarget(fromRel, importPath) {
    // only handle relative ./ or ../
    if (!importPath.startsWith(".")) return null; // external
    const fromDir = dirname(join(dist, fromRel));
    let target = importPath;
    // strip js extension keep as is
    // Join
    const joined = join(fromDir, target);
    // ensure .js
    let rel = joined.replace(dist + "/", "");
    // normalize
    if (!rel.endsWith(".js")) {
      // try with .js
      if (existsSync(join(dist, rel + ".js"))) rel = rel + ".js";
      else if (existsSync(join(dist, rel + "/index.js"))) rel = rel + "/index.js";
      else return null;
    }
    return rel;
  }

  const visited = new Set();
  const queue = ["main.js"];
  visited.add("main.js");
  while (queue.length) {
    const cur = queue.shift();
    const abs = join(dist, cur);
    if (!existsSync(abs)) continue;
    const content = readFileSync(abs, "utf8");
    const imps = parseImports(content);
    for (const imp of imps) {
      const target = resolveTarget(cur, imp);
      if (!target) continue;
      if (!visited.has(target) && existsSync(join(dist, target))) {
        visited.add(target);
        queue.push(target);
      }
    }
  }

  const unreachable = allFiles.filter((f) => !visited.has(f) && !isWhitelisted(f) && !f.endsWith(".d.ts"));
  // Filter out possible non-module helpers that are not imported but should be? Report
  const total = allFiles.length;
  const reachable = visited.size;
  console.log(`reachability: ${reachable}/${total} reachable, unreachable: ${unreachable.join(", ")}`);

  if (unreachable.length > 0) {
    assert.fail(`Unreachable modules from dist/main.js: ${unreachable.join(", ")}. Import them transitively from main.js.`);
  }
});

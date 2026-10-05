import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

const root = join(dirname(new URL(import.meta.url).pathname), "..");
const site = join(root, "site");

function clean() {
  if (existsSync(site)) rmSync(site, { recursive: true, force: true });
  mkdirSync(site, { recursive: true });
}

function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

function copyDirFiltered(srcDir, destDir, filter) {
  if (!existsSync(srcDir)) return;
  mkdirSync(destDir, { recursive: true });
  const entries = readdirSync(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const s = join(srcDir, ent.name);
    const d = join(destDir, ent.name);
    if (filter && !filter(s, ent)) continue;
    if (ent.isDirectory()) copyDirFiltered(s, d, filter);
    else copyFile(s, d);
  }
}

clean();

// index.html
copyFile(join(root, "index.html"), join(site, "index.html"));

// styles/
copyDirFiltered(join(root, "styles"), join(site, "styles"), (p, ent) => {
  if (ent.isDirectory()) return true;
  // copy only .css
  return p.endsWith(".css");
});

// dist/**/*.js without .map
copyDirFiltered(join(root, "dist"), join(site, "dist"), (p, ent) => {
  if (ent.isDirectory()) return true;
  if (p.endsWith(".map")) return false;
  return p.endsWith(".js");
});

console.log("pack: site ready");
if (existsSync(site)) {
  const list = [];
  function walk(dir, prefix = "") {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(join(dir, ent.name), rel);
      else list.push(rel);
    }
  }
  walk(site);
  console.log(list.join("\n"));
}

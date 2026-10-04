#!/usr/bin/env node
// A move commit only MOVES code: every line it removes from src/ must come
// back somewhere in src/, and nothing new appears — apart from import lines,
// `export` keywords, the generated e2e footer, devtools' namespace list and
// comment placement. Catches move.mjs's two known slips (a bogus same-file
// self-import; two statements joined onto one line), which check.mjs can't.
//   node tools/split/verbatim.mjs <rev>     (default HEAD) — compares rev~1..rev
import { execFileSync } from "node:child_process";

const rev = process.argv[2] || "HEAD";
const diff = execFileSync("git", ["diff", `${rev}~1`, rev, "--", "src/"], {encoding: "utf8", maxBuffer: 1 << 28});
const norm = l => l.trim().replace(/^export\s+/, "").replace(/\s+\/\/\s.*$/, "").trim();
const skip = l => !l || l.startsWith("import ") || l.startsWith("//") || l.includes("__nrExpose$") ||
  /^[\w$]+(,\s*[\w$]+)*,?\s*(\};)?$/.test(l); // devtools' namespace list lines
const rem = new Map(), add = new Map();
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
for (const l of diff.split("\n")) {
  if (l.startsWith("---") || l.startsWith("+++")) continue;
  if (l[0] === "-") bump(rem, norm(l.slice(1)));
  else if (l[0] === "+") bump(add, norm(l.slice(1)));
}
const only = (a, b) => [...a].filter(([k, n]) => !skip(k) && n > (b.get(k) || 0)).map(([k]) => k);
const lost = only(rem, add), extra = only(add, rem);
const selfImports = [];
for (const f of execFileSync("git", ["diff", "--name-only", `${rev}~1`, rev, "--", "src/"], {encoding: "utf8"}).split("\n").filter(Boolean)) {
  let src; try { src = execFileSync("git", ["show", `${rev}:${f}`], {encoding: "utf8"}); } catch { continue; }
  const base = f.split("/").pop();
  for (const m of src.matchAll(/^import .* from "\.\/([^"]+)";/gm)) if (m[1] === base) selfImports.push(`${f}: ${m[0]}`);
}
for (const k of lost) console.log("lost:  " + k.slice(0, 160));
for (const k of extra) console.log("extra: " + k.slice(0, 160));
for (const s of selfImports) console.log("self-import: " + s);
if (lost.length || extra.length || selfImports.length) { console.log(`✖ ${rev} is not a pure move`); process.exit(1); }
console.log(`✔ ${rev}: every moved line arrived intact`);

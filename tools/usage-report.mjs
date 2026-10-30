#!/usr/bin/env node
// Merge usage JSON files (web "Copy usage" paste and/or the native usage.json
// from tools/pull-usage.sh) into one ranked table. Facts only.
//   node tools/usage-report.mjs web.json native.json [--top N]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
let top = Infinity;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--top") top = +args[++i] || Infinity; else files.push(args[i]);
}
if (!files.length) { console.error("usage: usage-report.mjs <usage.json>... [--top N]"); process.exit(2); }

const rows = new Map(); // id -> {web, native, first, last}
for (const f of files) {
  const doc = JSON.parse(readFileSync(f, "utf8"));
  const app = doc.app === "native" ? "native" : "web";
  for (const [id, v] of Object.entries(doc.counts || {})) {
    const r = rows.get(id) || {web: 0, native: 0, first: Infinity, last: 0};
    r[app] += v.n | 0;
    if (v.first) r.first = Math.min(r.first, v.first);
    r.last = Math.max(r.last, v.last || 0);
    rows.set(id, r);
  }
}
const day = t => (isFinite(t) && t ? new Date(t * 1000).toISOString().slice(0, 10) : "-");
const list = [...rows].map(([id, r]) => ({id, ...r, total: r.web + r.native})).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id)).slice(0, top);
const w = Math.max(6, ...list.map(r => r.id.length));
console.log("action".padEnd(w), "total".padStart(7), "web".padStart(7), "native".padStart(7), " first       last");
for (const r of list) console.log(r.id.padEnd(w), String(r.total).padStart(7), String(r.web).padStart(7), String(r.native).padStart(7), "", day(r.first), "", day(r.last));

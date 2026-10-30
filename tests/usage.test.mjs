// tests/usage.test.mjs — the on-device usage counter (src/platform/usage.js, Josh #1083).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "./harness.mjs";

test("countUsage increments, keeps first/last, persists debounced to nr.usage", async () => {
  const app = await createApp();
  app.run(`countUsage("note.add"); countUsage("note.add"); countUsage("edit.paste")`);
  assert.equal(app.run(`S.usage["note.add"].n`), 2);
  assert.equal(app.run(`S.usage["edit.paste"].n`), 1);
  assert.ok(app.run(`S.usage["note.add"].first`) <= app.run(`S.usage["note.add"].last`));
  assert.equal(app.store.get("nr.usage"), undefined, "debounced: not written yet");
  app.tick(2500);
  const doc = JSON.parse(app.store.get("nr.usage"));
  assert.equal(doc.app, "web");
  assert.equal(doc.counts["note.add"].n, 2);
});

test("a reload reads the stored counts back and keeps counting", async () => {
  const stored = JSON.stringify({app: "web", v: 1, counts: {"note.add": {n: 5, first: 100, last: 200}}});
  const app = await createApp({storage: {"nr.usage": stored}});
  app.run(`countUsage("note.add")`);
  assert.equal(app.run(`S.usage["note.add"].n`), 6);
  assert.equal(app.run(`S.usage["note.add"].first`), 100);
});

test("no content: ids must be dotted lower-case names, pushUndo maps kinds, stored doc has only n/first/last", async () => {
  const app = await createApp();
  app.run(`countUsage("My Song Title"); countUsage("Verse: A minor"); countUsage("a.b.c.d.e"); countUsage("x".repeat(500)); countUsage(42); countUsage(null)`);
  assert.equal(app.run(`Object.keys(S.usage || {}).length`), 0);
  app.run(`countUndoKind("erase"); countUndoKind("whatever")`);
  assert.equal(app.run(`Object.keys(S.usage).join()`), "note.delete");
  app.run(`usageFlush()`);
  const doc = JSON.parse(app.store.get("nr.usage"));
  assert.deepEqual(Object.keys(doc).sort(), ["app", "counts", "v"]);
  for (const v of Object.values(doc.counts)) assert.deepEqual(Object.keys(v).sort(), ["first", "last", "n"]);
});

test("Export everything leaves the counter out; the module is wired (modulepreload, APP_MODULES)", () => {
  assert.match(readFileSync("src/session/export-all.js", "utf8"), /k !== USAGE_KEY/);
  assert.match(readFileSync("index.html", "utf8"), /modulepreload" href="src\/platform\/usage\.js"/);
  assert.match(readFileSync("sw.js", "utf8"), /"src\/platform\/usage\.js"/);
});

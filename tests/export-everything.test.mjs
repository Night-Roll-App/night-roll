// tests/export-everything.test.mjs — File → "Export everything…" (docs/plans/2026-10-21-native-ipad.md P0).
// The engine (src/platform/export-core.js) is driven with fakes; the real wiring
// (src/session/export-all.js) runs in the vm harness against a spied localStorage + a fake IndexedDB
// to prove the export never writes, renames or deletes anything it reads.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createApp } from "./harness.mjs";
import { encodeName, decodeName, fileNameFor, SECRET_KEYS, runExport, buildManifest, sha256Hex, idbEntry, exportFolderName } from "../src/platform/export-core.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const sha = b => createHash("sha256").update(b).digest("hex");
const bytesOf = d => typeof d === "string" ? Buffer.from(d) : Buffer.from(d);

test("key encoding: / and | (and %) are escaped, reversibly; a too-long name keeps a hash of the whole key", () => {
  const k = "albums/snes/chrono-trigger/frog.mid|take 1.wav";
  assert.equal(encodeName(k), "albums%2Fsnes%2Fchrono-trigger%2Ffrog.mid%7Ctake 1.wav");
  assert.equal(decodeName(encodeName(k)), k);
  for (const odd of ["a%2Fb", "100%|x/y", "%7C", "plain"]) assert.equal(decodeName(encodeName(odd)), odd, odd);
  assert.doesNotMatch(encodeName(k), /[/|]/);
  const long = "albums/" + "x".repeat(400) + ".mid";
  assert.ok(fileNameFor(long).length < 200);
  assert.notEqual(fileNameFor(long), fileNameFor(long + "y"), "different keys keep different names");
  assert.equal(exportFolderName(new Date("2026-10-21T12:00:00Z")), "NightRoll-Export-2026-10-21");
});

test("sha256Hex matches node's, with and without crypto.subtle", async () => {
  const b = new Uint8Array(1000).map((_, i) => i * 7);
  assert.equal(await sha256Hex(b), sha(b));
  const real = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {value: undefined, configurable: true});
  try { assert.equal(await sha256Hex(b), sha(b), "pure-JS fallback"); assert.equal(await sha256Hex(new Uint8Array(0)), sha(new Uint8Array(0))); }
  finally { Object.defineProperty(globalThis, "crypto", {value: real, configurable: true}); }
});

function fakeDeps(over) {
  const written = new Map(), order = [];
  const ls = new Map(Object.entries({
    "ff1roll-ghtoken": "ghp_SECRET", "ff1roll-aikey": "sk-SECRET", "ff1roll-ai-hosts": '["h"]',
    "ff1roll-cfg": '{"owner":"x"}', "ff1roll-mode": "learning", "other-site": "nope",
    "ff1roll-draft-albums/compositions/nightroll/a.mid": JSON.stringify({ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}], tracks: [{name: "m", notes: [{t: 0, d: 480, p: 60, v: 80}, {t: 480, d: 480, p: 62, v: 80}]}]}),
    "ff1roll-notes-albums/compositions/nightroll/a.mid": JSON.stringify([{b1: 1, q1: 1, text: "section: A"}]),
  }));
  const deps = {
    ls: {keys: () => [...ls.keys()], get: k => ls.has(k) ? ls.get(k) : null},
    idb: null,
    draftRead: async key => JSON.parse(ls.get("ff1roll-draft-" + key)),
    writeMidi: doc => Uint8Array.from([0x4d, 0x54, 0x68, 0x64, doc.tracks.length]),
    serializeNotesList: (list, beats, base) => JSON.stringify({song: base, beats, notes: list}),
    beatsFor: () => 4, nsfUrl: f => "https://archive.example/" + f,
    sink: {write: async (p, d) => { order.push(p); written.set(p, bytesOf(d)); }},
    now: new Date("2026-10-21T00:00:00Z"),
    ...over,
  };
  return {deps, written, order, ls};
}

test("secret redaction: ghtoken / aikey / ai-hosts never reach the sink, are listed as redacted; ff1roll-cfg and other keys are exported; foreign keys ignored", async () => {
  const {deps, written} = fakeDeps();
  const m = await runExport(deps);
  assert.deepEqual(m.redacted, ["ff1roll-ai-hosts", "ff1roll-aikey", "ff1roll-ghtoken"]);
  assert.deepEqual([...SECRET_KEYS].sort(), m.redacted);
  for (const [p, b] of written) { assert.ok(!b.toString().includes("SECRET"), p); assert.ok(!/ghtoken|aikey|ai-hosts/.test(p), p); }
  assert.ok(written.has("raw/localStorage/ff1roll-cfg.json"));
  assert.ok(written.has("raw/localStorage/ff1roll-mode.json"));
  assert.ok(![...written.keys()].some(p => p.includes("other-site")));
  assert.ok(!JSON.stringify(m).includes("SECRET"));
});

test("manifest: per-file size + sha256 match what was written; per-song note and rollnotes counts; manifest.json is last", async () => {
  const {deps, written, order} = fakeDeps();
  const m = await runExport(deps);
  assert.equal(order[order.length - 1], "manifest.json");
  for (const f of m.files) { const b = written.get(f.path); assert.equal(f.size, b.length, f.path); assert.equal(f.sha256, sha(b), f.path); }
  assert.deepEqual(JSON.parse(written.get("manifest.json").toString()), m);
  const s = m.songs.find(x => x.key === "albums/compositions/nightroll/a.mid");
  assert.equal(s.mid.notes, 2); assert.equal(s.mid.tracks, 1);
  assert.deepEqual(s.rollnotes, {path: s.rollnotes.path, stored: 1, unique: 1, items: 1});
  assert.equal(s.rollnotes.path, "songs/albums%2Fcompositions%2Fnightroll%2Fa/a.rollnotes.json");
  assert.equal(s.mid.path, "songs/albums%2Fcompositions%2Fnightroll%2Fa/a.mid");
  assert.equal(m.totals.songs, 1); assert.equal(m.totals.files, m.files.length);
  assert.equal(m.totals.bytes, m.files.reduce((a, f) => a + f.size, 0));
  assert.equal(m.folder, "NightRoll-Export-2026-10-21");
  const mm = buildManifest({created: "t", folder: "f", files: [{size: 3}, {size: 4}], songs: [], redacted: [], redownloadable: [], skipped: [], errors: []});
  assert.equal(mm.totals.bytes, 7);
});

test("IndexedDB records: bare blobs as-is, records as JSON with nested bytes; vault-fetched nsf tracks are marked re-downloadable (URL recorded, bytes not copied); folder handles skipped; sequential writes", async () => {
  const bytes = new Uint8Array([1, 2, 3, 250]);
  const recs = {
    audio: {"a/b.mid|take|1": bytes.buffer},
    nsf: {slug: {bytes: new Uint8Array([9, 9]), chip: "nsf", tracks: {t1: {n: 1, vault: "nsf/x.nsf", bytes: new Uint8Array([7, 7, 7])}, t2: {n: 2, secs: 5}}}},
    fs: {folder: {kind: "directory", queryPermission() {}}},
    repo: {"songs:a.mid": {bytes: new Uint8Array([1]), t: 1}},
    drafts: {"albums/imports/x/y.mid": {seq: 2, tracks: [{name: "p", notes: []}]}},
  };
  let inFlight = 0, maxInFlight = 0;
  const {deps, written} = fakeDeps({
    idb: {stores: async () => Object.keys(recs), keys: async s => Object.keys(recs[s]), get: async (s, k) => recs[s][k]},
    sink: null,
  });
  const store = new Map();
  deps.sink = {write: async (p, d) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise(r => setTimeout(r, 1)); store.set(p, bytesOf(d)); inFlight--; }};
  const m = await runExport(deps);
  assert.equal(maxInFlight, 1, "one entry at a time");
  assert.deepEqual([...store.get("raw/idb/audio/a%2Fb.mid%7Ctake%7C1")], [1, 2, 3, 250], "blob as-is, / and | encoded");
  const nsf = JSON.parse(store.get("raw/idb/nsf/slug").toString());
  assert.equal(nsf.tracks.t1.redownload, "https://archive.example/nsf/x.nsf");
  assert.equal(nsf.tracks.t1.bytes, undefined, "vault bytes not copied");
  assert.deepEqual(nsf.tracks.t2, {n: 2, secs: 5});
  assert.equal(nsf.bytes["$bytes"], Buffer.from([9, 9]).toString("base64"), "record-level bytes kept");
  assert.deepEqual(m.redownloadable, [{store: "nsf", key: "slug", track: "t1", url: "https://archive.example/nsf/x.nsf"}]);
  assert.equal(m.skipped.length, 2); assert.equal(m.skipped[0].store, "fs");
  assert.deepEqual(m.skipped[1], {store: "repo", key: "*", reason: "re-downloadable cache"});
  assert.ok(![...store.keys()].some(p => p.startsWith("raw/idb/repo/")));
  assert.ok(store.has("raw/idb/drafts/albums%2Fimports%2Fx%2Fy.mid"));
  assert.equal(m.errors.length, 0);
  assert.equal((await idbEntry("audio", "k", new Blob([bytes]), deps.nsfUrl, [])).kind, "bytes");
});

test("a failing entry is recorded in manifest.errors and the export carries on", async () => {
  const {deps} = fakeDeps({idb: {stores: async () => ["audio"], keys: async () => ["bad", "good"], get: async (s, k) => { if (k === "bad") throw new Error("boom"); return new Uint8Array([1]); }}});
  const m = await runExport(deps);
  assert.equal(m.errors.length, 1); assert.match(m.errors[0].where, /bad/);
  assert.ok(m.files.some(f => f.path === "raw/idb/audio/good"));
});

// ---- the real wiring, in the vm: spies prove nothing is written -------------------------------------
async function realExport() {
  const song = {savedStamp: 0, dirty: true, ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}], tracks: [{name: "melody", notes: [{t: 0, d: 480, p: 60, v: 80}, {t: 480, d: 480, p: 64, v: 80}, {t: 960, d: 480, p: 67, v: 80}]}, {name: "bass", notes: [{t: 0, d: 960, p: 36, v: 90}]}]};
  const stub = {savedStamp: 0, dirty: true, ppq: 480, timesig: [4, 4], tempos: [{tick: 0, usq: 500000}], tracksRef: 1};
  const app = await createApp({storage: {
    "ff1roll-ghtoken": "ghp_SECRET", "ff1roll-aikey": "sk-SECRET", "ff1roll-cfg": "{}",
    "ff1roll-draft-albums/compositions/nightroll/whole.mid": JSON.stringify(song),
    "ff1roll-notes-albums/compositions/nightroll/whole.mid": JSON.stringify([{b1: 1, q1: 1, b2: 2, q2: 1, text: "section: Verse"}]),
    "ff1roll-draft-albums/imports/x/big.mid": JSON.stringify(stub),
  }});
  app.run(`globalThis.__writes = []; globalThis.__idbRecs = {drafts: {"albums/imports/x/big.mid": {seq: 1, tracks: ${JSON.stringify(song.tracks)}}}, audio: {"k|1": new Uint8Array([5, 6])}};
    const mkReq = v => { const r = {}; Promise.resolve().then(() => { r.result = v; r.onsuccess && r.onsuccess(); }); return r; };
    globalThis.indexedDB = {
      open: (name, ver) => { __writes.push(ver === undefined ? "open-readonly-current" : "open-versioned"); return mkReq({
        objectStoreNames: Object.keys(__idbRecs), close() {},
        transaction: (store, mode) => { if (mode !== "readonly") __writes.push("tx-" + mode); return { objectStore: () => ({
          getAllKeys: () => mkReq(Object.keys(__idbRecs[store])), get: k => mkReq(__idbRecs[store][k]),
          put: () => { __writes.push("put"); return mkReq(); }, delete: () => { __writes.push("delete"); return mkReq(); }, clear: () => { __writes.push("clear"); return mkReq(); },
        }) }; } }); } };
    const __ls = localStorage, __realSet = __ls.setItem, __realRm = __ls.removeItem;
    __ls.setItem = (k, v) => { __writes.push("ls.setItem " + k); return __realSet(k, v); };
    __ls.removeItem = k => { __writes.push("ls.removeItem " + k); return __realRm(k); };
    __ls.clear = () => __writes.push("ls.clear");`);
  const before = JSON.stringify([...app.store.entries()]);
  app.run(`globalThis.__sinkFiles = new Map(); __out = null; __err = null; const __songBefore = S.song, __keyBefore = S.songKey;
    exportEverythingRun({write: async (p, d) => { __sinkFiles.set(p, d); }}, null, new Date("2026-10-21T00:00:00Z")).then(m => { __out = m; __same = (S.song === __songBefore && S.songKey === __keyBefore); }, e => { __err = String(e); });`);
  for (let i = 0; i < 200 && !app.run("__out || __err"); i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(app.run("__err"), null);
  const files = new Map(JSON.parse(app.run("JSON.stringify([...__sinkFiles.entries()].map(([p, d]) => [p, typeof d === 'string' ? d : {u8: Array.from(d)}]))")).map(([p, d]) => [p, typeof d === "string" ? d : Uint8Array.from(d.u8)]));
  return {app, files, before, m: JSON.parse(app.run("JSON.stringify(__out)")), same: app.run("__same")};
}

test("the real export never writes: no localStorage set/remove/clear, no IndexedDB put/delete/clear/readwrite/versioned open, stored data byte-identical, open song untouched", async () => {
  const {app, before, same} = await realExport();
  assert.deepEqual(app.run("JSON.parse(JSON.stringify(__writes))"), ["open-readonly-current"], "the only IDB call is a no-upgrade open");
  assert.equal(JSON.stringify([...app.store.entries()]), before, "localStorage unchanged");
  assert.equal(same, true, "global song state S untouched");
});

test("the real export: whole + IndexedDB-stub drafts become .mid files, rollnotes written from the stored list, secrets redacted, idb records dumped", async () => {
  const {files, m} = await realExport();
  assert.deepEqual(m.redacted, ["ff1roll-aikey", "ff1roll-ghtoken"]);
  assert.ok(![...files.values()].some(d => Buffer.from(typeof d === "string" ? d : d).toString().includes("SECRET")));
  const whole = m.songs.find(s => s.key.endsWith("whole.mid")), big = m.songs.find(s => s.key.endsWith("big.mid"));
  assert.equal(whole.mid.notes, 4); assert.equal(big.mid.notes, 4, "tracksRef stub inflated from IDB drafts");
  assert.deepEqual([whole.rollnotes.stored, whole.rollnotes.unique, whole.rollnotes.items], [1, 1, 1]);
  assert.deepEqual(m.problems, undefined);
  assert.ok(files.has("raw/idb/drafts/albums%2Fimports%2Fx%2Fbig.mid"));
  assert.deepEqual([...files.get("raw/idb/audio/k%7C1")], [5, 6]);
  assert.ok(files.has("raw/localStorage/ff1roll-draft-albums%2Fimports%2Fx%2Fbig.mid.json"));
  // tools/verify-export.mjs on the same output: PASS
  const dir = mkdtempSync(join(tmpdir(), "nr-export-"));
  try {
    for (const [p, d] of files) { mkdirSync(dirname(join(dir, p)), {recursive: true}); writeFileSync(join(dir, p), typeof d === "string" ? d : Buffer.from(d)); }
    const r = spawnSync(process.execPath, [join(ROOT, "tools/verify-export.mjs"), dir], {encoding: "utf8"});
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /PASS albums\/compositions\/nightroll\/whole\.mid \(4 notes\)/);
    assert.match(r.stdout, /PASS total: 2\/2 songs ok/);
    // corrupt a file: FAIL
    writeFileSync(join(dir, whole.mid.path), Buffer.from([1, 2, 3]));
    const r2 = spawnSync(process.execPath, [join(ROOT, "tools/verify-export.mjs"), dir], {encoding: "utf8"});
    assert.equal(r2.status, 1);
    assert.match(r2.stdout, /FAIL albums\/compositions\/nightroll\/whole\.mid/);
    assert.match(r2.stdout, /FAIL total/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("the zip fallback writes a valid store-only archive (unzip -t reads every entry)", async () => {
  globalThis.localStorage ??= {getItem: () => null, setItem() {}, removeItem() {}};
  const { zipSink } = await import("../src/session/export-all.js");
  let blob = null;
  const a = {click() {}};
  const real = {document: globalThis.document, URL: globalThis.URL.createObjectURL, setTimeout: globalThis.setTimeout};
  globalThis.setTimeout = () => 0; // finish() schedules a 60 s revoke: don't hold the process
  globalThis.document = {createElement: () => a};
  globalThis.URL.createObjectURL = b => { blob = b; return "blob:x"; };
  try {
    const z = zipSink("NightRoll-Export-2026-10-21");
    await z.write("manifest.json", '{"a":1}');
    await z.write("raw/idb/audio/k%7C1", new Uint8Array([1, 2, 3, 4, 5]));
    z.finish();
  } finally { globalThis.document = real.document; globalThis.URL.createObjectURL = real.URL; globalThis.setTimeout = real.setTimeout; }
  assert.equal(a.download, "NightRoll-Export-2026-10-21.zip");
  const dir = mkdtempSync(join(tmpdir(), "nr-zip-"));
  try {
    const f = join(dir, "x.zip");
    writeFileSync(f, Buffer.from(await blob.arrayBuffer()));
    const r = spawnSync("unzip", ["-t", f], {encoding: "utf8"});
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /No errors detected/);
    const r2 = spawnSync("unzip", ["-p", f, "NightRoll-Export-2026-10-21/manifest.json"], {encoding: "utf8"});
    assert.equal(r2.stdout, '{"a":1}');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("verify-export is dedupe-aware: items == unique passes even when stored > unique; a missing unique entry fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nr-dd-"));
  try {
    const mk = (items, unique) => {
      const rn = JSON.stringify({notes: Array(items).fill({})});
      mkdirSync(join(dir, "songs/s"), {recursive: true});
      writeFileSync(join(dir, "songs/s/s.rollnotes.json"), rn);
      writeFileSync(join(dir, "manifest.json"), JSON.stringify({files: [{path: "songs/s/s.rollnotes.json", size: Buffer.byteLength(rn), sha256: sha(Buffer.from(rn))}],
        songs: [{key: "s.mid", mid: null, problems: [], rollnotes: {path: "songs/s/s.rollnotes.json", stored: 5, unique, items: 3}}], redacted: [], redownloadable: [], skipped: [], errors: []}));
      return spawnSync(process.execPath, [join(ROOT, "tools/verify-export.mjs"), dir], {encoding: "utf8"});
    };
    assert.equal(mk(3, 3).status, 0);
    const r = mk(3, 4);
    assert.equal(r.status, 1); assert.match(r.stdout, /an entry is missing/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

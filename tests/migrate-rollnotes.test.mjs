// tools/migrate-rollnotes-v2.mjs — P5 batch migration (docs/provenance-plan.md).
// Synthetic fixtures only; never touches albums/. The tool itself is
// harness-backed (no second implementation of the .rollnotes format), so
// these tests exercise it through migrateText() the same way the CLI does.
import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./harness.mjs";
import { migrateText } from "../tools/migrate-rollnotes-v2.mjs";

const app = await createApp();

test("migrate v1 -> v2: plain file with no provenance note gets a bare origin.kind, notes untouched, saved -> stamp", () => {
  const v1 = JSON.stringify({
    version: 1, song: "demo", saved: 1700000000000,
    notes: [
      { at: [1, 1], type: "timesig", timesig: "4/4" },
      { at: [1, 1], type: "key", key: "C" },
    ],
  });
  const res = migrateText(app, v1, "albums/compositions/demo.mid");
  assert.equal(res.status, "convert");
  assert.deepEqual(res.origin, { kind: "composition" }); // own folder, no draft, no provenance note — originOf's default
  const doc = JSON.parse(res.newText);
  assert.equal(doc.format, "night-roll-annotations");
  assert.equal(doc.version, 2);
  assert.equal(doc.song, "demo");
  assert.equal(doc.stamp, 1700000000000);
  assert.equal(doc.notes.length, 2);
  assert.deepEqual(doc.origin, { kind: "composition" });
});

test("migrate: a 'forked from <path>' note becomes origin.from and leaves the notes list", () => {
  const v1 = JSON.stringify({
    version: 1, song: "demo2", saved: 1700000001000,
    notes: [
      { at: [1, 1], type: "timesig", timesig: "3/4" },
      { at: [1, 1], text: "forked from albums/compositions/nightroll/demo-src.mid" },
    ],
  });
  const res = migrateText(app, v1, "albums/compositions/nightroll/demo2.mid");
  assert.equal(res.status, "convert");
  assert.deepEqual(res.origin, { kind: "copy", from: "albums/compositions/nightroll/demo-src.mid" });
  const doc = JSON.parse(res.newText);
  assert.equal(doc.notes.length, 1, "the provenance note is gone from the list");
  assert.ok(doc.notes.every((n) => !/forked from/.test(JSON.stringify(n))));
  assert.deepEqual(doc.origin, { kind: "copy", from: "albums/compositions/nightroll/demo-src.mid" });
});

test("migrate: a 'moved from <path>' note becomes origin.movedFrom, and both from+movedFrom land together when a file carries one of each", () => {
  const movedOnly = JSON.stringify({
    version: 1, song: "demo2b", saved: 1700000001500,
    notes: [{ at: [1, 1], text: "moved from albums/compositions/nightroll/old-folder.mid" }],
  });
  const r1 = migrateText(app, movedOnly, "albums/compositions/demo2b.mid");
  assert.equal(r1.status, "convert");
  assert.deepEqual(r1.origin, { kind: "copy", movedFrom: "albums/compositions/nightroll/old-folder.mid" });

  const both = JSON.stringify({
    version: 1, song: "demo2c", saved: 1700000001600,
    notes: [
      { at: [1, 1], text: "moved from albums/compositions/nightroll/old-folder.mid" },
      { at: [1, 1], text: "forked from albums/compositions/source-song.mid" },
    ],
  });
  const r2 = migrateText(app, both, "albums/compositions/nightroll/demo2c.mid");
  assert.equal(r2.status, "convert");
  assert.deepEqual(r2.origin, {
    kind: "copy",
    from: "albums/compositions/source-song.mid",
    movedFrom: "albums/compositions/nightroll/old-folder.mid",
  });
  assert.equal(JSON.parse(r2.newText).notes.length, 0, "both provenance notes are gone");
});

test("migrate: refuses (does not guess) when two 'forked from' notes conflict — the real graveyard-3.rollnotes.json shape", () => {
  const v1 = JSON.stringify({
    version: 1, song: "demo3", saved: 1700000002000,
    notes: [
      { at: [1, 1], text: "forked from a.mid" },
      { at: [1, 1], text: "forked from b.mid" },
    ],
  });
  const res = migrateText(app, v1, "albums/compositions/nightroll/demo3.mid");
  assert.equal(res.status, "refused");
  assert.match(res.reason, /ambiguous provenance/);
  assert.match(res.reason, /2 'forked from'/);
});

test("migrate: refuses on a generic round-trip loss unrelated to provenance (duplicate track: directive the app's own writer dedupes)", () => {
  const v1 = JSON.stringify({
    version: 1, song: "demo4", saved: 1700000003000,
    notes: [
      { at: [1, 1], type: "track", track: "lead", voice: "sf-piano" },
      { at: [1, 1], type: "track", track: "lead", voice: "sf-organ" }, // same name: serializeNotesList's dedupedNotesWithIndex keeps only the last
    ],
  });
  const res = migrateText(app, v1, "albums/compositions/demo4.mid");
  assert.equal(res.status, "refused");
  assert.match(res.reason, /round-trip mismatch/);
});

test("migrate: an already-v2 file is skipped untouched", () => {
  const v2 = JSON.stringify({
    format: "night-roll-annotations", version: 2, song: "demo5",
    notes: [{ at: [1, 1], type: "key", key: "D" }],
  });
  const res = migrateText(app, v2, "albums/compositions/demo5.mid");
  assert.equal(res.status, "already-v2");
  assert.equal(res.version, 2);
});

test("migrate: a capture-kind song (album.json nsf block) resolves origin.kind via the app's own originOf, not a guess", () => {
  app.context.__meta = { nsf: { vault: "nes/fake-game.nsf", tracks: { "boss-theme": { n: 1, secs: 10 } } } };
  app.run("albumMetaCache['albums/nes/fake-game'] = __meta;");
  const v1 = JSON.stringify({ version: 1, song: "boss-theme", saved: 1700000004000, notes: [] });
  const res = migrateText(app, v1, "albums/nes/fake-game/boss-theme.mid");
  assert.equal(res.status, "convert");
  assert.deepEqual(res.origin, { kind: "capture" });
});

test("migrate: a starters-path song resolves origin.kind=starter", () => {
  const v1 = JSON.stringify({ version: 1, song: "etude", saved: 1700000005000, notes: [] });
  const res = migrateText(app, v1, "albums/starters/etude.mid");
  assert.equal(res.status, "convert");
  assert.deepEqual(res.origin, { kind: "starter" });
});

test("migrate: invalid JSON is refused, not thrown", () => {
  const res = migrateText(app, "{ not json", "albums/compositions/broken.mid");
  assert.equal(res.status, "refused");
  assert.match(res.reason, /invalid JSON/);
});

// SPC NON-voice misclassification fix, batch 1 (open-items.md "QUEUED, READY
// TO APPLY: SPC NON-voice misclassification fix", 2026-10-01): 12 published
// SNES captures carry a merged "drums" track for a noise-generator voice
// that commit 3199d068's classifyNoiseVoices() (tools/spc/notes.mjs) would
// no longer classify as a drum kit — it's a real melodic/texture voice that
// got folded onto channel 10 before the fix existed. This tool un-does that
// folding IN THE PUBLISHED FILE, using a real re-capture (made through the
// app's own import flow, not this session's CLI approximation — see
// scratch/snes-drum-audit/) only to answer two narrow questions per song:
// (1) which voiceN did the "drums" track's notes actually come from, and
// (2) what non-drum MIDI channel does that voice use. Everything else —
// every tick, every duration, every other track's bytes — comes from the
// PUBLISHED file, read with the app's own parseMidi (tests/harness.mjs) and
// written back with the shared writer (tools/nsf/midi-write.mjs
// writeSongMidi), so source metas/pan/etc. on untouched tracks survive.
//
// Generic, not per-game (CLAUDE.md "no one-time hacks in capture engines"):
// the voice match is by note-count arithmetic (a candidate recapture voice
// whose note count exceeds its published counterpart by exactly the
// published drums track's note count), never by song name. The one thing
// that IS a fixed list is which 12 songs to look at — that's the audit's
// output (open-items.md), not a classification rule.
//
// Usage:
//   node tools/spc-undrum.mjs              # dry run (default): plan + gate
//   node tools/spc-undrum.mjs --write      # write songs that pass the gate
//
// SAFETY: per song, after writing, the new bytes are re-parsed (same
// parseMidi) and checked against the pre-write parse: total note count
// unchanged; every track other than the one touched is byte-for-byte
// identical in note content (t, d, p, v, ch, duty, ve); the touched voice
// track's final note set is exactly {its own original notes} ∪ {the
// drums track's notes, on the voice's channel, pitch adjusted only if the
// re-capture disagrees}; no "drums" track and no note on channel 9 (MIDI
// channel 10) survive. Any mismatch REFUSES that song — nothing is written
// for it, and the reason is reported. Songs are otherwise independent.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing (docs/split-plan.md §3.5)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../tests/harness.mjs";
import { writeSongMidi } from "./nsf/midi-write.mjs";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// The 12 songs from the 2026-10-01 audit (open-items.md). Each has a real
// re-capture at scratch/snes-drum-audit/final/<album>--<slug>.mid.
export const SONGS = [
  { album: "chrono-trigger", slug: "blackbird-outside" },
  { album: "chrono-trigger", slug: "earthquake" },
  { album: "chrono-trigger", slug: "last-battle" },
  { album: "chrono-trigger", slug: "ocean-waves" },
  { album: "chrono-trigger", slug: "quiet-beach" },
  { album: "chrono-trigger", slug: "tsunami" },
  { album: "chrono-trigger", slug: "voice-of-lavos" },
  { album: "final-fantasy-4", slug: "main-theme-ocean" },
  { album: "final-fantasy-4", slug: "the-package-opens" },
  { album: "final-fantasy-4", slug: "tranquil-beach" },
  { album: "final-fantasy-6", slug: "blazing-fire" },
  { album: "final-fantasy-6", slug: "quiet-beach" },
];

export function publishedPath(song) { return path.join(ROOT, "albums/snes", song.album, song.slug + ".mid"); }
export function recapturePath(song) { return path.join(ROOT, "scratch/snes-drum-audit/final", song.album + "--" + song.slug + ".mid"); }
export function notesTxtPath(song) { return path.join(ROOT, "albums/snes", song.album, song.slug + ".notes.txt"); }
export function rollnotesPath(song) { return path.join(ROOT, "albums/snes", song.album, song.slug + ".rollnotes.json"); }

// ---------------------------------------------------------------- minimal, self-contained reader for the re-capture file
// Deliberately NOT the app's parser: the re-capture is scratch output, only
// consulted for (a) which voice a note set belongs to and (b) its channel —
// never written back verbatim, so a tiny independent reader is enough and
// keeps this tool from depending on scratch/, which may not stick around.
export function readRecapture(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let i = 0;
  const u32 = () => { const v = buf.readUInt32BE(i); i += 4; return v; };
  const u16 = () => { const v = buf.readUInt16BE(i); i += 2; return v; };
  i = 4; const hlen = u32(); u16(); const ntrks = u16(); u16();
  i = 8 + hlen;
  const tracks = [];
  for (let t = 0; t < ntrks; t++) {
    i += 4; // "MTrk"
    const len = u32(); const end = i + len;
    let name = null, lastStatus = 0;
    const open = {}, notes = [];
    while (i < end) {
      let b; do { b = buf[i++]; } while (b & 0x80); // skip delta VLQ (notes only need pitch/ch/presence, not timing)
      let status = buf[i];
      if (status === 0xFF) {
        i++; const type = buf[i++];
        let vlen = 0, vb; do { vb = buf[i++]; vlen = (vlen << 7) | (vb & 0x7f); } while (vb & 0x80);
        const data = buf.subarray(i, i + vlen); i += vlen;
        if (type === 0x03 && name === null) name = data.toString("utf8");
        if (type === 0x2F) { i = end; break; }
      } else if (status === 0xF0 || status === 0xF7) {
        i++; let vlen = 0, vb; do { vb = buf[i++]; vlen = (vlen << 7) | (vb & 0x7f); } while (vb & 0x80); i += vlen;
      } else {
        if (status & 0x80) i++; else status = lastStatus;
        lastStatus = status;
        const hi = status & 0xF0, ch = status & 0x0F;
        let d1, d2;
        if (hi === 0xC0 || hi === 0xD0) { d1 = buf[i]; i += 1; }
        else { d1 = buf[i]; d2 = buf[i + 1]; i += 2; }
        if (hi === 0x90 && d2 > 0) (open[ch + ":" + d1] ||= []).push({ pitch: d1, ch });
        else if ((hi === 0x90 && d2 === 0) || hi === 0x80) {
          const stack = open[ch + ":" + d1];
          if (stack && stack.length) { stack.shift(); notes.push({ pitch: d1, ch }); }
        }
      }
    }
    tracks.push({ name, notes });
    i = end;
  }
  return { tracks };
}

// ---------------------------------------------------------------- app-parsed published song
// Exported for tests/spc-undrum.test.mjs: the real app parser (tests/harness.mjs),
// not a second implementation — same requirement as the live tool.
export async function parseBytes(bytes) {
  const app = await createApp();
  app.context.midiBytes = [...bytes];
  const json = app.run("JSON.stringify(parseMidi(new Uint8Array(midiBytes).buffer, {trust: true}))") /* trust: a capture's own timing, as the app reads it — untrusted parsing trims an unterminated note (FF6 blazing-fire voice1) */;
  return JSON.parse(json);
}
async function readPublished(absPath) { return await parseBytes(readFileSync(absPath)); }

// ---------------------------------------------------------------- matching
// Which recapture voice is the published "drums" track's real source, and
// what channel does it belong on. Generic: works from note-count arithmetic
// alone, never a song/game name.
export function matchDrumVoice(pubTracks, recTracks, drumsCount) {
  const names = [...new Set(recTracks.map(t => t.name).filter(n => n && n !== "drums"))];
  const candidates = [];
  for (const name of names) {
    const recCount = recTracks.find(t => t.name === name).notes.length;
    const pubTrack = pubTracks.find(t => t.name === name);
    const pubCount = pubTrack ? pubTrack.notes.length : 0;
    if (recCount > pubCount && recCount - pubCount === drumsCount) candidates.push({ name, pubTrack, recCount, pubCount });
  }
  if (candidates.length !== 1) return { ok: false, reason: candidates.length === 0 ? "no recapture voice's note-count surplus matches the drums track" : "ambiguous: " + candidates.length + " recapture voices match (" + candidates.map(c => c.name).join(", ") + ")" };
  const c = candidates[0];
  const recTrack = recTracks.find(t => t.name === c.name);
  // channel: the already-established channel. Merge case (voice already
  // published) — its OWN channel, so the merged notes don't jump channels
  // mid-track. Rename case (voice absent from published) — the recapture's
  // channel, the only place that channel is recorded.
  const source = c.pubTrack ? c.pubTrack.notes : recTrack.notes;
  const chans = [...new Set(source.map(n => n.ch))];
  if (chans.length !== 1) return { ok: false, reason: "voice " + c.name + " uses more than one channel (" + chans.join(",") + ") — refusing to guess" };
  return { ok: true, voice: c.name, channel: chans[0], merge: !!c.pubTrack, recTrack };
}

// Greedy nearest-onset-tick pairing of the published drums notes against the
// candidate recapture voice's notes (a superset in the merge case). Ticks
// can differ by a handful of frames between the published capture and this
// session's CLI re-capture (open-items.md: historical snap settings), so
// exact-tick matching is too strict; nearest-tick is robust at this scale
// (onsets that close are never ambiguous with a neighbor a beat away).
export function pairByNearestTick(drumsNotes, recNotes) {
  const used = new Set();
  return drumsNotes.map(dn => {
    let best = -1, bestDist = Infinity;
    recNotes.forEach((rn, idx) => {
      if (used.has(idx)) return;
      const dist = Math.abs(rn.onTick - dn.t);
      if (dist < bestDist) { bestDist = dist; best = idx; }
    });
    used.add(best);
    return { pub: dn, rec: best >= 0 ? recNotes[best] : null };
  });
}

// ---------------------------------------------------------------- plan + apply
// pub: JSON-parsed app song (readPublished). recBytes: raw re-capture bytes.
// Returns {ok, reason} or {ok:true, song, report} where `song` is ready for
// writeSongMidi and `report` describes what moved for the dry-run printout
// and for the caller's write-time checks (annotations, notes.txt).
export function planSong(pub, recBuf) {
  const drumsIdx = pub.tracks.findIndex(t => t.name === "drums");
  if (drumsIdx < 0) return { ok: false, reason: "no 'drums' track in the published file" };
  const drumsTrack = pub.tracks[drumsIdx];
  const rec = readRecapture(recBuf);
  const m = matchDrumVoice(pub.tracks, rec.tracks, drumsTrack.notes.length);
  if (!m.ok) return m;

  // readRecapture (above) only tracks pitch/channel, enough for candidate
  // matching — re-scan with onset ticks kept for this one voice, to pair
  // each published drums note with its real recapture note for a pitch check.
  const recTicked = readRecaptureTicked(recBuf, m.voice);
  const pairs = pairByNearestTick(drumsTrack.notes, recTicked);

  const pitchDiffs = [];
  const newDrumNotes = drumsTrack.notes.map((n, i) => {
    const recNote = pairs[i].rec;
    const note = { ...n, ch: m.channel };
    if (recNote && recNote.pitch !== n.p) {
      pitchDiffs.push({ tick: n.t, published: n.p, recapture: recNote.pitch });
      note.p = recNote.pitch;
    }
    return note;
  });

  const newTracks = pub.tracks.map(t => t);
  if (m.merge) {
    const vIdx = newTracks.findIndex(t => t.name === m.voice);
    newTracks[vIdx] = { ...newTracks[vIdx], notes: [...newTracks[vIdx].notes, ...newDrumNotes] };
    newTracks.splice(drumsIdx, 1);
  } else {
    newTracks[drumsIdx] = { ...drumsTrack, name: m.voice, notes: newDrumNotes };
  }
  const song = { ...pub, tracks: newTracks };
  return { ok: true, song, report: { voice: m.voice, channel: m.channel, merge: m.merge, drumNotes: drumsTrack.notes.length, pitchDiffs } };
}

// Same byte scan as readRecapture, but keeps absolute tick for one named
// track only (used for the pitch/onset pairing pass).
function readRecaptureTicked(bytes, wantName) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let i = 0;
  const u32 = () => { const v = buf.readUInt32BE(i); i += 4; return v; };
  const u16 = () => { const v = buf.readUInt16BE(i); i += 2; return v; };
  i = 4; const hlen = u32(); u16(); const ntrks = u16(); u16();
  i = 8 + hlen;
  for (let t = 0; t < ntrks; t++) {
    i += 4;
    const len = u32(); const end = i + len;
    let name = null, lastStatus = 0, absTick = 0;
    const open = {}, notes = [];
    while (i < end) {
      let delta = 0, b;
      do { b = buf[i++]; delta = (delta << 7) | (b & 0x7f); } while (b & 0x80);
      absTick += delta;
      let status = buf[i];
      if (status === 0xFF) {
        i++; const type = buf[i++];
        let vlen = 0, vb; do { vb = buf[i++]; vlen = (vlen << 7) | (vb & 0x7f); } while (vb & 0x80);
        const data = buf.subarray(i, i + vlen); i += vlen;
        if (type === 0x03 && name === null) name = data.toString("utf8");
        if (type === 0x2F) { i = end; break; }
      } else if (status === 0xF0 || status === 0xF7) {
        i++; let vlen = 0, vb; do { vb = buf[i++]; vlen = (vlen << 7) | (vb & 0x7f); } while (vb & 0x80); i += vlen;
      } else {
        if (status & 0x80) i++; else status = lastStatus;
        lastStatus = status;
        const hi = status & 0xF0, ch = status & 0x0F;
        let d1, d2;
        if (hi === 0xC0 || hi === 0xD0) { d1 = buf[i]; i += 1; }
        else { d1 = buf[i]; d2 = buf[i + 1]; i += 2; }
        if (hi === 0x90 && d2 > 0) (open[ch + ":" + d1] ||= []).push({ onTick: absTick, pitch: d1, ch });
        else if ((hi === 0x90 && d2 === 0) || hi === 0x80) {
          const stack = open[ch + ":" + d1];
          if (stack && stack.length) notes.push(stack.shift());
        }
      }
    }
    if (name === wantName) return notes;
    i = end;
  }
  return [];
}

// ---------------------------------------------------------------- gate
function sig(n) { return [n.t, n.d, n.p, n.v, n.ch, n.duty ?? "", n.ve ?? ""].join(","); }
function multiset(notes) { return notes.map(sig).sort(); }

export function gateCheck(origPub, newParsed, plan) {
  const reasons = [];
  const origTotal = origPub.tracks.reduce((s, t) => s + t.notes.length, 0);
  const newTotal = newParsed.tracks.reduce((s, t) => s + t.notes.length, 0);
  if (origTotal !== newTotal) reasons.push("note count changed: " + origTotal + " -> " + newTotal);

  if (newParsed.tracks.some(t => t.name === "drums")) reasons.push("a 'drums' track still exists in the output");
  if (newParsed.tracks.some(t => t.notes.some(n => n.ch === 9))) reasons.push("a note on channel 9 (MIDI channel 10) survives in the output");

  const touched = new Set(["drums", plan.report.voice]);
  for (const ot of origPub.tracks) {
    if (touched.has(ot.name)) continue;
    const nt = newParsed.tracks.find(t => t.name === ot.name);
    if (!nt) { reasons.push("track '" + ot.name + "' is missing from the output"); continue; }
    const a = multiset(ot.notes), b = multiset(nt.notes);
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) reasons.push("track '" + ot.name + "' note content changed");
  }

  const expectedV = multiset([...(origPub.tracks.find(t => t.name === plan.report.voice)?.notes || []),
    ...plan.song.tracks.find(t => t.name === plan.report.voice).notes.slice(-plan.report.drumNotes)]);
  const actualV = multiset(newParsed.tracks.find(t => t.name === plan.report.voice)?.notes || []);
  if (expectedV.length !== actualV.length || expectedV.some((v, i) => v !== actualV[i])) reasons.push("voice '" + plan.report.voice + "' note content doesn't match the plan");

  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------- CLI
async function main() {
  const write = process.argv.includes("--write");
  const lines = [];
  const results = [];
  for (const song of SONGS) {
    const label = song.album + "/" + song.slug;
    const pubPath = publishedPath(song), recPath = recapturePath(song);
    if (!existsSync(pubPath)) { lines.push(label + ": REFUSED (published file missing: " + pubPath + ")"); results.push({ song, ok: false }); continue; }
    if (!existsSync(recPath)) { lines.push(label + ": REFUSED (no re-capture at " + recPath + ")"); results.push({ song, ok: false }); continue; }

    const origPub = await readPublished(pubPath);
    const recBuf = readFileSync(recPath);
    const plan = planSong(origPub, recBuf);
    if (!plan.ok) { lines.push(label + ": REFUSED (" + plan.reason + ")"); results.push({ song, ok: false }); continue; }

    const newBytes = writeSongMidi(plan.song);
    const newParsed = await parseBytes(newBytes);
    const gate = gateCheck(origPub, newParsed, plan);

    lines.push(label + ": " + (gate.ok ? "GATE PASS" : "GATE FAIL") +
      " — drums(" + plan.report.drumNotes + " notes) -> " + plan.report.voice +
      " ch" + plan.report.channel + (plan.report.merge ? " (merged into existing track)" : " (renamed in place)") +
      (plan.report.pitchDiffs.length ? "; PITCH DIFFS: " + plan.report.pitchDiffs.map(d => "t" + d.tick + " " + d.published + "->" + d.recapture).join(", ") : "; no pitch diffs"));
    if (!gate.ok) gate.reasons.forEach(r => lines.push("    - " + r));

    // annotations check (report only, never edit)
    const rnPath = rollnotesPath(song);
    if (existsSync(rnPath)) {
      const text = readFileSync(rnPath, "utf8");
      if (/\b(track|lane):[^\n]*drums/i.test(text) || /drums/i.test(text)) lines.push("    ! " + rnPath + " references 'drums' — NOT edited, check by hand");
    }
    // notes.txt regeneration note (only if one already exists and names the track)
    const ntPath = notesTxtPath(song);
    if (existsSync(ntPath)) {
      const text = readFileSync(ntPath, "utf8");
      if (/\(drums\)/.test(text)) lines.push("    ! " + ntPath + " names the drums track — regenerate after writing (tools/dump_notes.mjs)");
    }

    results.push({ song, ok: gate.ok, newBytes, pubPath });
  }

  console.log(lines.join("\n"));
  console.log("");
  console.log(results.filter(r => r.ok).length + "/" + results.length + " songs pass the gate.");

  if (write) {
    for (const r of results) {
      if (!r.ok) continue;
      writeFileSync(r.pubPath, r.newBytes);
      console.log("wrote " + r.pubPath);
    }
  } else {
    console.log("(dry run — pass --write to apply)");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

// tools/capture-diff.mjs <old.mid> <new.mid> [--json] [--old-loop A>T] [--new-loop A>T]
//
// The re-capture gate (docs/plans/2026-10-06-capture-fidelity-audit.md §5):
// is a fresh capture of a song safe to publish over the old one? Josh's
// annotations are anchored to bar.beat and to track numbers, so a capture
// may add expression but never move a note. One verdict per pair:
//   SAME         every event identical (notes, velocities, CCs, metas)
//   VELOCITY     the notes are identical by (track, start, pitch, length);
//                only velocity, in-note aftertouch (ve/shape), CCs, bends,
//                programs, channels or text metas differ
//   ADDED-TRACK  as above for every old track, plus new tracks AFTER them
//                (a DPCM track) — no existing track number moves
//   MOVED        anything else: a note's start/length/pitch, a track
//                removed/renamed/reordered, ppq, the tempo map, the meter
//                or the loop point differs
// Each verdict carries short reasons, the first differing bar (by the OLD
// file's meter), and what the new file gained or lost per event kind.
//
// Reads the raw SMF itself (no harness): tracks are numbered as the app
// numbers them — only MTrk chunks with notes, in file order — and notes pair
// as parseMidi pairs them (per pitch, first-on first-off). Loop points come
// from the sibling .rollnotes.json's loop annotation unless given.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pitchName = p => PC[p % 12] + (Math.floor(p / 12) - 1);

export function readSmf(bytes) {
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const u32 = p => (d[p] << 24 | d[p + 1] << 16 | d[p + 2] << 8 | d[p + 3]) >>> 0;
  let h = -1;
  for (let k = 0; k + 4 <= d.length; k++) if (d[k] === 0x4D && d[k + 1] === 0x54 && d[k + 2] === 0x68 && d[k + 3] === 0x64) { h = k; break; }
  if (h < 0) throw new Error("not a MIDI file");
  const ppq = d[h + 12] << 8 | d[h + 13];
  const tempos = [], timesigs = [], keysigs = [], tracks = [];
  let emptyTracks = 0;
  const magics = [];
  for (let k = h + 8 + u32(h + 4); k + 4 <= d.length; k++) if (d[k] === 0x4D && d[k + 1] === 0x54 && d[k + 2] === 0x72 && d[k + 3] === 0x6B) magics.push(k);
  for (let tn = 0; tn < magics.length; tn++) {
    const i = magics[tn];
    const end = Math.min(i + 8 + u32(i + 4), tn + 1 < magics.length ? magics[tn + 1] : d.length);
    let j = i + 8, t = 0, running = null, name = null;
    const open = {}, notes = [], other = [];
    const varlen = () => { let v = 0, b; do { b = d[j++]; v = (v << 7) | (b & 0x7F); } while (b & 0x80 && j < end); return v; };
    try {
      while (j < end) {
        t += varlen();
        const b = d[j];
        if (b === 0xFF) {
          const mt = d[j + 1]; j += 2;
          const len = varlen(); const data = d.subarray(j, j + len); j += len;
          if (mt === 0x2F) break;
          if (mt === 0x03 && name === null) name = Buffer.from(data).toString("utf8");
          else if (mt === 0x51) tempos.push({tick: t, usq: data[0] << 16 | data[1] << 8 | data[2]});
          else if (mt === 0x58) timesigs.push({tick: t, num: data[0], den: 1 << data[1]});
          else if (mt === 0x59) keysigs.push({tick: t, sf: data[0] > 127 ? data[0] - 256 : data[0], minor: data[1]});
          else other.push({t, kind: "meta" + mt.toString(16).padStart(2, "0"), key: Buffer.from(data).toString("latin1")});
        } else if (b === 0xF0 || b === 0xF7) {
          j++; const len = varlen(); other.push({t, kind: "sysex", key: Array.from(d.subarray(j, j + len)).join(",")}); j += len;
        } else {
          if (b & 0x80) { running = b; j++; }
          if (running === null) break;
          const st = running & 0xF0, ch = running & 0x0F;
          if (st === 0x90 || st === 0x80) {
            const p = d[j], v = d[j + 1]; j += 2;
            if (st === 0x90 && v > 0) (open[p] = open[p] || []).push({t, v, ch});
            else if (open[p] && open[p].length) { const o = open[p].shift(); notes.push({t: o.t, d: t - o.t, p, v: o.v, ch: o.ch}); }
          } else if (st === 0xA0) {
            const p = d[j], v = d[j + 1]; j += 2;
            const on = open[p] && open[p].length ? open[p][open[p].length - 1] : null;
            other.push({t, kind: on && on.t === t ? "ve" : on ? "shape" : "aftertouch", key: ch + ":" + p + ":" + v});
          } else if (st === 0xB0) { const c = d[j], v = d[j + 1]; j += 2; other.push({t, kind: "cc" + c, key: ch + ":" + v}); }
          else if (st === 0xE0) { const v = d[j] | d[j + 1] << 7; j += 2; other.push({t, kind: "bend", key: ch + ":" + v}); }
          else if (st === 0xC0) { other.push({t, kind: "program", key: ch + ":" + d[j]}); j += 1; }
          else if (st === 0xD0) { other.push({t, kind: "pressure", key: ch + ":" + d[j]}); j += 1; }
          else break;
        }
      }
    } catch (err) { /* truncated track: keep what parsed, as parseMidi does */ }
    notes.sort((a, b) => a.t - b.t || a.p - b.p || a.d - b.d);
    if (notes.length) tracks.push({name: name || "", notes, other});
    else emptyTracks++;
  }
  tempos.sort((a, b) => a.tick - b.tick);
  timesigs.sort((a, b) => a.tick - b.tick);
  return {ppq, tempos, timesigs, keysigs, tracks, emptyTracks};
}

// tick → bar number (1-based) under a file's meter map (4/4 when it has none)
export function barOf(smf, tick) {
  const ts = smf.timesigs.length ? smf.timesigs : [{tick: 0, num: 4, den: 4}];
  let bar = 1, at = 0, cur = {num: 4, den: 4};
  for (const s of ts) {
    if (s.tick > tick) break;
    const len = cur.num * 4 / cur.den * smf.ppq;
    bar += Math.round((s.tick - at) / len); at = s.tick; cur = s;
  }
  return bar + Math.floor((tick - at) / (cur.num * 4 / cur.den * smf.ppq));
}

export function barCount(smf) {
  let end = 0;
  for (const tr of smf.tracks) for (const n of tr.notes) end = Math.max(end, n.t + n.d);
  return end ? barOf(smf, Math.max(0, end - 1)) : 0;
}

// a loop annotation as "anchor>target" ("14.3>2.3"), read from a
// .rollnotes.json (v2 JSON or the legacy text grammar); null when none
export function loopOfRollnotes(text) {
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    const l = (j.notes || []).find(n => n.type === "loop");
    return l ? l.at[0] + "." + l.at[1] + ">" + l.loop : null;
  } catch (err) {
    const m = /\[(\d+\.\d+(?:\.\d+)?)\][^[]*?\bloop:\s*(\S+)/.exec(text);
    return m ? m[1] + ">" + m[2] : null;
  }
}

const noteKey = n => n.t + ":" + n.p + ":" + n.d;
const evKey = e => e.t + "|" + e.kind + "|" + e.key;

function multisetDiff(a, b, key) { // [onlyA, onlyB, pairs] — pairs in order of appearance
  const m = new Map();
  for (const x of a) { const k = key(x); (m.get(k) || m.set(k, []).get(k)).push(x); }
  const onlyB = [], pairs = [];
  for (const y of b) { const q = m.get(key(y)); if (q && q.length) pairs.push([q.shift(), y]); else onlyB.push(y); }
  const onlyA = [];
  for (const q of m.values()) onlyA.push(...q);
  return [onlyA, onlyB, pairs];
}

const countKinds = evs => { const c = {}; for (const e of evs) c[e.kind] = (c[e.kind] || 0) + 1; return c; };

// opts: {oldLoop, newLoop} — "anchor>target" strings or null
export function captureDiff(oldSmf, newSmf, opts = {}) {
  const reasons = [], moved = [], soft = [];
  let firstBar = null;
  const at = tick => { const b = barOf(oldSmf, tick); if (firstBar === null || b < firstBar) firstBar = b; return b; };
  const MAX = 4; // examples listed per reason
  if (oldSmf.ppq !== newSmf.ppq) moved.push("ppq " + oldSmf.ppq + " → " + newSmf.ppq);
  const tKey = x => x.tick + ":" + x.usq, sKey = x => x.tick + ":" + x.num + "/" + x.den;
  // compared as the player reads them: a meta that restates what is already
  // in force (a 4/4 with none before it, a tempo equal to the last) moves nothing
  const effective = (list, same, dflt) => { const out = []; let cur = dflt; for (const x of list) { if (!same(x, cur)) out.push(x); cur = x; } return out; };
  const tempos = s => effective(s.tempos, (x, c) => x.usq === c.usq, {usq: 500000});
  const meters = s => effective(s.timesigs, (x, c) => x.num === c.num && x.den === c.den, {num: 4, den: 4});
  {
    const [a, b] = multisetDiff(tempos(oldSmf), tempos(newSmf), tKey);
    if (a.length || b.length) {
      const t = Math.min(...[...a, ...b].map(x => x.tick)); const bar = at(t);
      moved.push("tempo map differs from bar " + bar + " (" + a.length + " old / " + b.length + " new changes; first bpm " +
        (oldSmf.tempos[0] ? +(6e7 / oldSmf.tempos[0].usq).toFixed(2) : "—") + " → " + (newSmf.tempos[0] ? +(6e7 / newSmf.tempos[0].usq).toFixed(2) : "—") + ")");
    }
  }
  {
    const [a, b] = multisetDiff(meters(oldSmf), meters(newSmf), sKey);
    if (a.length || b.length) { const t = Math.min(...[...a, ...b].map(x => x.tick)); moved.push("meter differs from bar " + at(t) + " (" + oldSmf.timesigs.map(sKey).join(" ") + " → " + newSmf.timesigs.map(sKey).join(" ") + ")"); }
  }
  if ((opts.oldLoop || null) !== (opts.newLoop || null) && (opts.oldLoop !== undefined || opts.newLoop !== undefined))
    moved.push("loop point " + (opts.oldLoop || "none") + " → " + (opts.newLoop || "none"));
  {
    const kk = x => x.tick + ":" + x.sf + ":" + x.minor;
    const [a, b] = multisetDiff(oldSmf.keysigs, newSmf.keysigs, kk);
    if (a.length || b.length) soft.push("key-signature metas differ (" + a.length + " old / " + b.length + " new)");
  }
  const tracks = [];
  const nOld = oldSmf.tracks.length, nNew = newSmf.tracks.length;
  if (nNew < nOld) moved.push("track count " + nOld + " → " + nNew + " (a track is gone; track numbers are annotation anchors)");
  for (let i = 0; i < Math.max(nOld, nNew); i++) {
    const A = oldSmf.tracks[i], B = newSmf.tracks[i];
    if (!A) { tracks.push({track: i + 1, name: B.name, status: "added", notes: B.notes.length}); continue; }
    if (!B) { tracks.push({track: i + 1, name: A.name, status: "removed", notes: A.notes.length}); continue; }
    const t = {track: i + 1, name: A.name, status: "same"};
    if (A.name !== B.name) { t.renamed = B.name; moved.push("tr" + (i + 1) + " renamed \"" + A.name + "\" → \"" + B.name + "\""); }
    const [rm, add, pairs] = multisetDiff(A.notes, B.notes, noteKey);
    if (rm.length || add.length) {
      t.status = "moved"; t.removed = rm.length; t.added = add.length;
      const first = Math.min(...[...rm, ...add].map(n => n.t));
      const fmt = n => pitchName(n.p) + "@bar" + barOf(oldSmf, n.t) + "(t" + n.t + " d" + n.d + ")";
      t.examples = [...rm.slice(0, MAX).map(n => "- " + fmt(n)), ...add.slice(0, MAX).map(n => "+ " + fmt(n))];
      moved.push("tr" + (i + 1) + " " + (A.name || "") + ": " + rm.length + " old notes / " + add.length + " new notes don't match, from bar " + at(first));
    }
    const vel = pairs.filter(([x, y]) => x.v !== y.v), chs = pairs.filter(([x, y]) => x.ch !== y.ch);
    if (vel.length) { t.velocity = vel.length; if (t.status === "same") t.status = "velocity"; soft.push("tr" + (i + 1) + ": " + vel.length + " velocities differ, from bar " + at(Math.min(...vel.map(([x]) => x.t)))); }
    if (chs.length) { t.channel = chs.length; if (t.status === "same") t.status = "velocity"; soft.push("tr" + (i + 1) + ": " + chs.length + " notes changed MIDI channel, from bar " + at(Math.min(...chs.map(([x]) => x.t)))); }
    const [eo, en] = multisetDiff(A.other, B.other, evKey);
    if (eo.length || en.length) {
      const ko = countKinds(eo), kn = countKinds(en);
      t.events = {old: ko, new: kn}; if (t.status === "same") t.status = "velocity";
      soft.push("tr" + (i + 1) + ": other events differ (" + [...new Set([...Object.keys(ko), ...Object.keys(kn)])].map(k => k + " " + (ko[k] || 0) + "→" + (kn[k] || 0)).join(", ") + "), from bar " + at(Math.min(...[...eo, ...en].map(e => e.t))));
    }
    tracks.push(t);
  }
  // gained / lost per event kind over the shared tracks + the new ones
  const tally = smf => { const c = {notes: 0}; for (const tr of smf.tracks) { c.notes += tr.notes.length; for (const e of tr.other) c[e.kind] = (c[e.kind] || 0) + 1; } return c; };
  const to = tally(oldSmf), tn = tally(newSmf), gained = {}, lost = {};
  for (const k of new Set([...Object.keys(to), ...Object.keys(tn)])) { const dlt = (tn[k] || 0) - (to[k] || 0); if (dlt > 0) gained[k] = dlt; else if (dlt < 0) lost[k] = -dlt; }
  const addedTracks = tracks.filter(t => t.status === "added");
  let verdict;
  if (moved.length) verdict = "MOVED";
  else if (addedTracks.length) verdict = "ADDED-TRACK";
  else if (soft.length) verdict = "VELOCITY";
  else verdict = "SAME";
  if (verdict === "ADDED-TRACK") reasons.push(addedTracks.length + " track(s) appended: " + addedTracks.map(t => "tr" + t.track + " " + t.name + " (" + t.notes + " notes)").join(", "));
  reasons.push(...moved, ...soft);
  if (verdict === "ADDED-TRACK" && firstBar === null) firstBar = barOf(newSmf, Math.min(...addedTracks.map(t => newSmf.tracks[t.track - 1].notes[0].t)));
  // loopOnly: every note, track, tempo and meter matches — only the loop point differs
  const loopOnly = moved.length > 0 && moved.every(m => m.startsWith("loop point"));
  return {verdict, reasons, loopOnly, firstBar, bars: {old: barCount(oldSmf), new: barCount(newSmf)}, tracks, gained, lost};
}

export function diffFiles(oldPath, newPath, opts = {}) {
  const sib = p => { const r = p.replace(/\.mid$/, ".rollnotes.json"); return existsSync(r) ? loopOfRollnotes(readFileSync(r, "utf8")) : null; };
  const oldLoop = "oldLoop" in opts ? opts.oldLoop : sib(oldPath);
  const newLoop = "newLoop" in opts ? opts.newLoop : sib(newPath);
  const res = captureDiff(readSmf(readFileSync(oldPath)), readSmf(readFileSync(newPath)), {oldLoop, newLoop});
  return {old: oldPath, new: newPath, oldLoop, newLoop, ...res};
}

export function formatDiff(r) {
  let s = r.verdict.padEnd(12) + (r.firstBar ? "bar " + r.firstBar + "  " : "") + r.old + " → " + r.new + "\n";
  for (const x of r.reasons) s += "  " + x + "\n";
  for (const t of r.tracks) if (t.examples) for (const e of t.examples) s += "    tr" + t.track + " " + e + "\n";
  const g = Object.entries(r.gained).map(([k, v]) => k + " +" + v), l = Object.entries(r.lost).map(([k, v]) => k + " −" + v);
  if (g.length || l.length) s += "  events: " + [...g, ...l].join(", ") + "\n";
  return s;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), files = [], opts = {};
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") json = true;
    else if (args[i] === "--old-loop") opts.oldLoop = args[++i] === "none" ? null : args[i];
    else if (args[i] === "--new-loop") opts.newLoop = args[++i] === "none" ? null : args[i];
    else files.push(args[i]);
  }
  if (files.length !== 2) { console.error("usage: capture-diff.mjs <old.mid> <new.mid> [--json] [--old-loop A>T|none] [--new-loop A>T|none]"); process.exit(1); }
  const r = diffFiles(files[0], files[1], opts);
  process.stdout.write(json ? JSON.stringify(r, null, 1) + "\n" : formatDiff(r));
}

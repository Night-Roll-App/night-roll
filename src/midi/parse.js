import { S, prof } from "../state.js";

// ---------------------------------------------------------------- midi parse
export function parseMidi(buf, opts = {}) {
  const d = new Uint8Array(buf);
  let i = 0;
  const u32 = p => (d[p]<<24 | d[p+1]<<16 | d[p+2]<<8 | d[p+3]) >>> 0;
  const u16 = p => d[p]<<8 | d[p+1];
  // writeMidi now writes text metas (track name, sounding offset) as UTF-8
  // (open-items.md "FORMATS AUDIT" #2 — non-Latin-1 names were mangled by the
  // old &255 masking); decode UTF-8 first and fall back to latin1 only when
  // the bytes aren't valid UTF-8, so every already-published .mid (all ASCII
  // in this catalog — verified against every albums/**/*.mid track name)
  // keeps reading exactly as before.
  const decodeMetaText = bytes => {
    try { return new TextDecoder("utf-8", {fatal: true}).decode(bytes); }
    catch (err) { return new TextDecoder("latin1").decode(bytes); }
  };
  // find MThd wherever it sits — .rmi wraps SMF in a RIFF header, and some
  // exports carry junk prefixes; requiring byte 0 rejected real MIDI files
  let h = -1;
  for (let k = 0; k + 4 <= d.length; k++) {
    if (d[k] === 0x4D && d[k+1] === 0x54 && d[k+2] === 0x68 && d[k+3] === 0x64) { h = k; break; }
  }
  if (h < 0) throw new Error("not a MIDI file");
  const hlen = u32(h + 4), ntrk = u16(h + 10), ppq = u16(h + 12);
  i = h + 8 + hlen;
  const tracks = [];
  const tempos = []; // {tick, usq}
  let timesig = [4, 4];
  let timesigSeen = false; // docs/declared-vs-learner-spec.md C1: the SINGULAR timesig is the FIRST 0x58 now (was the last — a file that changes meter used to keep only its final one)
  let keysig = null; // {sf, minor}
  // The file's own labels, kept verbatim regardless of what the app's
  // annotations later say (docs/declared-vs-learner-spec.md, "declared vs
  // learner"): every 0x58/0x59 in file order. `source` is built at the end,
  // populated when the caller says this file is foreign (opts.foreign) OR
  // the file already carries this app's own "source:file" marker (a round
  // trip — see sawSourceMarker below) — never for a plain in-house capture.
  const srcTimesigs = [];
  const srcKeysigs = [];
  let sawSourceMarker = false;
  // Phase 2 (docs/declared-vs-learner-spec.md "B"): everything a foreign
  // file carries that Night Roll doesn't model — text/copyright/instrument/
  // lyric/marker/cue metas, extra track-name metas, program changes,
  // channel pressure, pitch bend, every CC but 10/70, SysEx — collected per
  // ORIGINAL track index (tn, the MTrk scan order) always, cheaply; bundled
  // into source.metas only when this parse turns out foreign (same
  // collect-always/bundle-conditionally shape as srcTimesigs/srcKeysigs
  // above). trackSrcIndex/trackRaw are parallel arrays to `tracks` (one
  // entry per PUSH to tracks, i.e. per track with notes); emptyTrackMetas
  // holds original tracks with NO notes (e.g. a conductor's own name/text)
  // — these never became a Night Roll track, so track deletion can't apply
  // to them: they always survive, merged into the written meta track.
  // Tracks WITH notes match back up by srcIndex, not name (a rename must
  // not orphan them); a deleted track's raw events are dropped with it.
  const trackSrcIndex = [];
  const trackRaw = [];
  const emptyTrackMetas = [];
  // Track boundaries by MTrk magic scan — some files (ff1battle) have corrupt
  // track-length headers, so the declared length can't be trusted alone.
  const magics = [];
  for (let k = h + 8 + hlen; k + 4 <= d.length; k++) {
    if (d[k] === 0x4D && d[k+1] === 0x54 && d[k+2] === 0x72 && d[k+3] === 0x6B) magics.push(k);
  }
  for (let tn = 0; tn < magics.length; tn++) {
    i = magics[tn];
    const declaredEnd = i + 8 + u32(i+4);
    const nextMagic = tn + 1 < magics.length ? magics[tn+1] : d.length;
    const end = Math.min(declaredEnd, nextMagic);
    let j = i + 8, t = 0, running = null, name = "", curDuty, curPan = null; // CC10: where the game put this channel (−1 left … +1 right)
    let offset = 0; // tools/sounding.mjs: the roll shows the sounding pitch, shifted from the written key by this many semitones (a Text meta, "sounding:-12")
    const open = {}, notes = [];
    const raw = []; // phase 2: this track's unmodeled events, [{t, bytes}] — bundled into source.metas only when this parse turns out foreign
    const varlen = () => { let v = 0, b; do { b = d[j++]; v = (v<<7) | (b & 0x7F); } while (b & 0x80); return v; };
    try {
      while (j < end) {
        t += varlen();
        const evStart = j; // phase 2: raw events are captured status-byte-to-end, sliced straight from the file — truly verbatim
        const b = d[j];
        if (b === 0xFF) {
          const mtype = d[j+1]; j += 2;
          const mlen = varlen();
          const data = d.subarray(j, j+mlen); j += mlen;
          if (mtype === 0x03 && !name) name = decodeMetaText(data);
          else if (mtype === 0x01) {
            const text = decodeMetaText(data);
            const m = /^sounding:(-?\d+)$/.exec(text);
            if (m) offset = +m[1];
            else if (text === "source:file") sawSourceMarker = true; // writeMidi/writeSongMidi's own round-trip marker (conductor track, tick 0)
            else raw.push({t, bytes: Array.from(d.subarray(evStart, j))}); // the composer's own text — not ours to read, phase 2 just keeps it
          }
          else if (mtype === 0x51) tempos.push({tick: t, usq: data[0]<<16 | data[1]<<8 | data[2]});
          else if (mtype === 0x58) {
            srcTimesigs.push({tick: t, num: data[0], den: 1 << data[1]});
            if (!timesigSeen) { timesig = [data[0], 1 << data[1]]; timesigSeen = true; } // FIRST 0x58 wins now, not last
          }
          else if (mtype === 0x59) {
            const ks = {tick: t, sf: data[0] > 127 ? data[0] - 256 : data[0], minor: !!data[1]};
            srcKeysigs.push(ks);
            if (keysig === null) keysig = {sf: ks.sf, minor: ks.minor};
          }
          else if (mtype === 0x2F) break; // end of track — anything after is junk (corrupt files)
          else raw.push({t, bytes: Array.from(d.subarray(evStart, j))}); // copyright/instrument/lyric/marker/cue, an extra track-name meta, or anything else Night Roll doesn't model (phase 2)
        } else if (b === 0xF0 || b === 0xF7) {
          j++; const mlen = varlen(); j += mlen;
          raw.push({t, bytes: Array.from(d.subarray(evStart, j))}); // SysEx, verbatim (phase 2)
        } else {
          if (b & 0x80) { running = b; j++; }
          if (running === null) break; // data byte before any status: corrupt
          const st = running & 0xF0, ch = running & 0x0F;
          if (st === 0x90 || st === 0x80) {
            const p = d[j], v = d[j+1]; j += 2;
            if (st === 0x90 && v > 0) {
              (open[p] = open[p] || []).push({t, v, duty: curDuty});
            } else if (open[p] && open[p].length) {
              const o = open[p].shift();
              const n = {t: o.t, d: t - o.t, p, v: o.v, ch};
              if (o.duty !== undefined) n.duty = o.duty; // chip timbre (CC70, our own capture files)
              if (o.ve !== undefined) n.ve = o.ve; // software-envelope decay target
              notes.push(n);
            }
          } else if (st === 0xB0) {
            // CC70/poly aftertouch are chip data (duty/envelope) ONLY for a
            // non-foreign parse — a foreign file's CC70 is just some DAW's
            // controller change, not pulse duty (docs/declared-vs-learner-spec.md
            // phase 2); kept verbatim as a raw event instead, like any other CC
            const foreignNow = opts.foreign || sawSourceMarker;
            const ctrl = d[j], val = d[j + 1]; j += 2;
            if (ctrl === 10) curPan = Math.max(-1, Math.min(1, (val - 64) / 63)); // CC10 pan: always owned, foreign or not
            else if (ctrl === 70 && !foreignNow) curDuty = val & 3; // CC70 = pulse duty from the NSF capture
            else raw.push({t, bytes: [0xB0 | ch, ctrl, val]}); // every other CC (phase 2)
          } else if (st === 0xA0) {
            // polyphonic aftertouch = the capture's decay target (end volume) —
            // foreign: raw only, never read as ve (same reasoning as CC70 above)
            const foreignNow = opts.foreign || sawSourceMarker;
            const p = d[j], val = d[j + 1]; j += 2;
            if (!foreignNow && open[p] && open[p].length) open[p][open[p].length - 1].ve = val;
            else raw.push({t, bytes: [0xA0 | ch, p, val]});
          } else if (st === 0xE0) { const lsb = d[j], msb = d[j + 1]; j += 2; raw.push({t, bytes: [0xE0 | ch, lsb, msb]}); } // pitch bend (phase 2)
          else if (st === 0xC0) { const pgm = d[j]; j += 1; raw.push({t, bytes: [0xC0 | ch, pgm]}); } // program change (phase 2)
          else if (st === 0xD0) { const pr = d[j]; j += 1; raw.push({t, bytes: [0xD0 | ch, pr]}); } // channel pressure (phase 2)
        }
      }
    } catch (err) { /* truncated track (e.g. ff1ship.mid) — keep what parsed */ }
    i = end;
    if (!opts.trust) for (const n of notes) n.d = Math.min(n.d, 32 * ppq); // corrupt-file guard: no note longer than 8 bars
    notes.sort((a,b) => a.t - b.t || a.p - b.p);
    // corrupt-file guard: an internal silence beyond 32 bars means desynced
    // junk follows (real tacets in this catalog top out at 24 bars) — truncate
    if (!opts.trust) for (let k = 1; k < notes.length; k++) { // FF7's Main Theme voice 2 rests 41 bars — imports are trusted
      if (notes[k].t - notes[k-1].t > 32 * 4 * ppq) { notes.length = k; break; }
    }
    if (notes.length) {
      const tr = curPan === null ? {name, notes} : {name, notes, midiPan: curPan};
      if (offset) tr.offset = offset;
      tracks.push(tr);
      trackSrcIndex.push(tn);
      trackRaw.push(raw);
    } else if (raw.length || name) { // an empty original track (e.g. the conductor's own name/text) — no notes, so never a Night Roll track, but not nothing (phase 2)
      emptyTrackMetas.push({index: tn, name, events: raw});
    }
  }
  tempos.sort((a,b) => a.tick - b.tick);
  if (!tempos.length || tempos[0].tick > 0) tempos.unshift({tick: 0, usq: 500000});
  // tempo map: cumulative seconds at each tempo change
  let sec = 0;
  for (let k = 0; k < tempos.length; k++) {
    if (k > 0) sec += (tempos[k].tick - tempos[k-1].tick) / ppq * tempos[k-1].usq / 1e6;
    tempos[k].sec = sec;
  }
  // source: the file's own 0x58/0x59 history, kept only when this parse is
  // known-foreign (an import) or the file round-trips our own marker — never
  // for a plain capture, so writeMidi/writeSongMidi stay byte-identical for
  // everything already in the catalog (docs/declared-vs-learner-spec.md C1).
  // Phase 2 ("B"): source.metas — every track's raw leftovers, matched back
  // to a surviving Night Roll track by srcIndex (never name, so a rename
  // doesn't orphan them; a DELETED track's events are simply not written —
  // {index, events} with no `empty` flag needs a live match). An originally
  // empty track (no notes — never modeled, so never "deleted") is `empty:
  // true` and always survives, merged into the written meta/conductor track.
  let source = null;
  if (opts.foreign || sawSourceMarker) {
    const metas = [];
    tracks.forEach((tr, k) => {
      tr.srcIndex = trackSrcIndex[k]; // phase 2: how writeMidi/writeSongMidi reattach this track's raw events after edits
      if (trackRaw[k].length) metas.push({index: trackSrcIndex[k], events: trackRaw[k]});
    });
    for (const et of emptyTrackMetas) metas.push({index: et.index, empty: true, ...(et.name ? {name: et.name} : {}), events: et.events});
    metas.sort((a, b) => a.index - b.index); // original file order
    // omit metas entirely when there's nothing in it — keeps source's shape
    // exactly what phase 1 shipped (docs/declared-vs-learner-spec.md) for
    // every file with no phase-2 leftovers, not {..., metas: []} everywhere
    source = {timesigs: srcTimesigs, keysigs: srcKeysigs, ...(metas.length ? {metas} : {})};
  }
  return {ppq, tracks, tempos, timesig, keysig, source};
}
// practice-tempo multiplier (chosen bpm / native); 1 = native
export function tickToSec(song, tick) {
  const ts = song.tempos;
  let lo = 0, hi = ts.length - 1;
  while (lo < hi) { const m = (lo+hi+1) >> 1; if (ts[m].tick <= tick) lo = m; else hi = m-1; }
  return (ts[lo].sec + (tick - ts[lo].tick) / song.ppq * ts[lo].usq / 1e6) / S.playRate;
}
export function secToTick(song, sec) {
  sec *= S.playRate; // tempo map stores native-rate seconds
  const ts = song.tempos;
  let lo = 0, hi = ts.length - 1;
  while (lo < hi) { const m = (lo+hi+1) >> 1; if (ts[m].sec <= sec) lo = m; else hi = m-1; }
  return ts[lo].tick + (sec - ts[lo].sec) * 1e6 / ts[lo].usq * song.ppq;
}
secToTick = prof("secToTick", secToTick); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()

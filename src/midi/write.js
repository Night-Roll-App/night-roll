import { ctlBytes } from "./parse.js";

export function writeMidi(s) { // format-1 SMF: meta track (tempo + meter + key) + one track per voice.
  // ONE writer, in two forms (open-items.md "FORMATS AUDIT" #1-2): this hand
  // port and tools/nsf/midi-write.mjs's writeSongMidi (the pipeline's own
  // writer, already shared by every chip capture — trackBytes/fileBytes).
  // writeMidi must stay SYNCHRONOUS — it runs inside plain click handlers and
  // inside the vm test harness (tests/harness.mjs), which has no
  // importModuleDynamically callback, so `import()` throws there — so it
  // can't dynamic-import that module, and there's no build step to bundle it
  // in. tests/night-roll.test.mjs ("writeMidi / writeSongMidi agree
  // byte-for-byte") pins the two together; touching one without the other
  // (and that test) reintroduces the drift the audit found: commitImports
  // silently dropped CC10 pan, CC70 duty, the aftertouch envelope and
  // per-note channel from every published capture.
  const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
  const u16 = n => [n >>> 8 & 255, n & 255];
  const vlq = n => { const b = [n & 0x7F]; while ((n >>= 7) > 0) b.unshift((n & 0x7F) | 0x80); return b; };
  const utf8 = t => Array.from(new TextEncoder().encode(t)); // text events are bytes; UTF-8 is the de-facto choice
  const str = t => utf8(t); // ASCII-only structural strings ("MThd"/"MTrk") — same bytes either way
  const textMeta = (type, text) => { const b = utf8(text); return [0xFF, type, ...vlq(b.length), ...b]; }; // VLQ length: a >127-byte name no longer corrupts the file
  const track = body => [...str("MTrk"), ...u32(body.length), ...body];
  const NON_DRUM_CH = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]; // 15 melodic channels; 9 stays drums-only whatever the track count (the old ti<9?ti:(ti+1)&15 formula collided past 16 tracks)
  const isKit = name => /drum|percussion|kit|noise|dpcm/i.test(name || ""); // dpcm: the NES sample channel's hits (capture v2)
  const trackCh = (ti, kit) => kit ? 9 : NON_DRUM_CH[ti % NON_DRUM_CH.length];

  // phase 2 (docs/declared-vs-learner-spec.md "B"): a foreign file's raw
  // leftovers — matched back to the CURRENT track holding the same original
  // srcIndex (never by name, so a rename doesn't orphan them; a track the
  // catalog no longer has — deleted — simply gets no match, so its events
  // are dropped with it). An `empty: true` entry never had a Night Roll
  // track to delete (e.g. the conductor's own name/text) — it always
  // survives, merged into the meta track below.
  const bySrcIndex = new Map();
  s.tracks.forEach((tr, ti) => { if (tr.srcIndex !== undefined) bySrcIndex.set(tr.srcIndex, ti); });
  const extraByTrack = new Map(); // current track index -> [{t, o, d}]
  const metaEvs = [];
  for (const tp of s.tempos || []) metaEvs.push({t: tp.tick, o: 0, d: [0xFF, 0x51, 0x03, ...u32(tp.usq).slice(1)]});
  // s.source (docs/declared-vs-learner-spec.md C4): a foreign file's OWN
  // 0x58/0x59 history, kept verbatim at their original ticks — none if it had
  // none — with a "source:file" marker so a re-parse of this output round-
  // trips the distinction; s.timesig/s.keysig are ignored entirely in this
  // branch. No source: byte-identical to before (every capture, every
  // composition made here — nothing invented, Learning mode is the law).
  // s.timesigs (plural, docs/provenance-plan.md Q9): publishSong's own baked
  // meter — present only on an import (source present) whose origin bakes
  // meter, i.e. only when HE declared one. It overrides s.source.timesigs
  // (the file's own verbatim history) for what's actually WRITTEN, same as
  // a tempo: annotation already overrides an import's own tempo map above;
  // absent (no declaration), s.source.timesigs is written verbatim — Q6.
  if (s.source) {
    const timesigs = s.timesigs && s.timesigs.length ? s.timesigs : (s.source.timesigs || []);
    for (const ts of timesigs) metaEvs.push({t: ts.tick, o: 1, d: [0xFF, 0x58, 0x04, ts.num, Math.round(Math.log2(ts.den)), 24, 8]});
    for (const ks of s.source.keysigs || []) metaEvs.push({t: ks.tick, o: 2, d: [0xFF, 0x59, 0x02, ks.sf & 255, ks.minor ? 1 : 0]});
    metaEvs.push({t: 0, o: -1, d: textMeta(0x01, "source:file")});
    for (const mt of s.source.metas || []) {
      if (mt.empty) {
        if (mt.name) metaEvs.push({t: 0, o: 3, d: textMeta(0x03, mt.name)});
        for (const ev of mt.events) metaEvs.push({t: ev.t, o: 3, d: ev.bytes});
      } else {
        const ti = bySrcIndex.get(mt.index);
        if (ti === undefined) continue; // the track was deleted — its raw events go with it
        const list = extraByTrack.get(ti) || []; extraByTrack.set(ti, list);
        for (const ev of mt.events) list.push({t: ev.t, o: 0.75, d: ev.bytes});
      }
    }
  } else {
    const timesigs = s.timesigs && s.timesigs.length ? s.timesigs
      : [{tick: 0, num: (s.timesig || [4, 4])[0], den: (s.timesig || [4, 4])[1]}];
    for (const ts of timesigs) metaEvs.push({t: ts.tick, o: 1, d: [0xFF, 0x58, 0x04, ts.num, Math.round(Math.log2(ts.den)), 24, 8]});
    // key signature: ONLY when the song already declared one (parseMidi read it
    // back from a file that already had it, e.g. via tools/fix_keysigs.py) —
    // never invented here. Learning mode is the law: keys are Josh's discoveries.
    if (s.keysig) metaEvs.push({t: 0, o: 2, d: [0xFF, 0x59, 0x02, s.keysig.sf & 255, s.keysig.minor ? 1 : 0]});
  }
  metaEvs.sort((a, b) => a.t - b.t || a.o - b.o);
  const t0 = [];
  let lastT = 0;
  for (const e of metaEvs) { t0.push(...vlq(Math.max(0, e.t - lastT)), ...e.d); lastT = Math.max(lastT, e.t); }
  t0.push(...vlq(0), 0xFF, 0x2F, 0x00);
  const out = [track(t0)];
  s.tracks.forEach((tr, ti) => {
    const kit = isKit(tr.name);
    const ch0 = trackCh(ti, kit);
    const evs = [{t: 0, o: -3, d: textMeta(0x03, tr.name || "track" + (ti + 1))}];
    // tools/sounding.mjs: the roll shows the sounding pitch, shifted from the
    // written key by tr.offset semitones — round-trips through every save
    // (parseMidi reads it back into track.offset) so a tap keeps sounding right
    if (tr.offset) evs.push({t: 0, o: -2, d: textMeta(0x01, "sounding:" + tr.offset)});
    // CC10 = the .mid's OWN pan (a chip capture's channel); the "track:"
    // annotation's pan (tr.pan) overrides it at playback (trackPan()) but
    // lives in rollnotes, never here — this is only what survives with no
    // annotation set
    if (tr.midiPan !== undefined) evs.push({t: 0, o: -1, d: [0xB0 | ch0, 10, Math.max(0, Math.min(127, Math.round(tr.midiPan * 63 + 64)))]});
    for (const ev of (extraByTrack.get(ti) || [])) evs.push(ev); // phase 2: this track's raw leftovers, verbatim
    // channel controllers (bend, volume, expression, sustain, mod, reverb,
    // pan events, program, RPN), verbatim at their ticks; the drum-channel
    // rule is the notes' own
    for (const e of tr.ctl || []) evs.push({t: e.t, o: 0.75, d: ctlBytes(e, e.ch !== undefined && ((e.ch & 15) !== 9 || kit) ? (e.ch & 15) : ch0)});
    let lastDuty = null;
    for (const n of tr.notes) {
      if (n.gone) continue;
      // per-note channel (captures: noise/drums) else the track's own — but
      // channel 10 is the DRUM channel: a console's voice number that lands
      // there on a melodic track made FFX and the PS1 albums play parts as
      // drums (2026-09-30); only a kit track may use it
      const ch = n.ch !== undefined && ((n.ch & 15) !== 9 || kit) ? (n.ch & 15) : ch0;
      // duty (chip timbre) rides as CC70 ahead of the note it changes on —
      // parseMidi reads it back; other DAWs just see a sound controller
      if (n.duty !== undefined && n.duty !== lastDuty) { evs.push({t: n.t, o: 0.5, d: [0xB0 | ch, 70, n.duty]}); lastDuty = n.duty; }
      // …and at each duty change while the note is held (n.duties [{t, v}], NES capture v2)
      if (n.duties) for (const q of n.duties) if (q.t > 0 && q.t < n.d) { evs.push({t: n.t + q.t, o: 0.5, d: [0xB0 | ch, 70, q.v & 3]}); lastDuty = q.v & 3; }
      evs.push({t: n.t, o: 1, d: [0x90 | ch, n.p & 127, (n.v || 80) & 127]});
      // decay target as polyphonic aftertouch right after the on — parseMidi
      // reads it back as the note's end volume; DAWs see key pressure
      if (n.ve !== undefined) evs.push({t: n.t, o: 1.5, d: [0xA0 | ch, n.p & 127, n.ve & 127]});
      // volume shape: more aftertouch at ticks INSIDE the note, level =
      // r × velocity (parseMidi divides back); points past a shortened end drop
      if (n.env) for (const q of n.env) if (q.t > 0 && q.t < n.d) evs.push({t: n.t + q.t, o: 1.5, d: [0xA0 | ch, n.p & 127, Math.max(0, Math.min(127, Math.round(q.r * ((n.v || 80) & 127))))]});
      evs.push({t: n.t + n.d, o: 0, d: [0x80 | ch, n.p & 127, 64]});
    }
    evs.sort((a, b) => a.t - b.t || a.o - b.o); // offs (o=0) before duty (0.5) before ons (1) before aftertouch (1.5) at the same tick
    const body = [];
    let last = 0;
    for (const e of evs) { body.push(...vlq(Math.max(0, e.t - last)), ...e.d); last = Math.max(last, e.t); }
    body.push(...vlq(0), 0xFF, 0x2F, 0x00);
    out.push(track(body));
  });
  const head = [...str("MThd"), ...u32(6), ...u16(1), ...u16(out.length), ...u16(s.ppq)];
  return new Uint8Array([...head, ...out.flat()]);
}

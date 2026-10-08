// Parsed N64 sequence -> the repo's .notes.txt and a type-1 MIDI.
// Ticks are exact 48ths of a beat, so nothing is quantized here (the NSF
// path snaps because frame counts drift; sequence data has no drift).
// Meter is the caller's assumption: the format carries none.
import { pitchName } from "../nsf/notes.mjs";
import { makeMidiTracks, PPQ, bendRangeMetas, shapeFromSeries } from "../nsf/midi-write.mjs";
import { TICKS_PER_BEAT } from "./constants.mjs";
import { tickSeconds } from "./seq-libultra.mjs";
import { Vibrato, OotVibrato, Portamento, OotPortamento, UPDATES_PER_SECOND, OOT_UPDATES_PER_SECOND } from "./render.mjs";
import { guessKit } from "../kit-guess.mjs";

const label = n => n.drum ? "D" + n.semitone : pitchName(n.midi);

// A note with pitch bends inside it (n.slide, from the Rare driver: [{t, to}]
// — t ticks after the note-on, `to` semitones from the note-on pitch) becomes
// one note per landed pitch, so the roll shows where the bend went. The
// PS1 path's splitSlides (tools/psx/notes.mjs) does the same on its own
// note shape (endTick/pitch, whole-semitone targets); this one rounds the
// wheel's fractional targets to the nearest semitone and merges runs that
// land on the same one, on the N64 shape (tick/dur, midi/semitone/key).
// Each piece keeps `whole` (the note it came from) and `off` (its semitones
// from it), as the PS1 path's pieces do: the .mid writes the pieces after
// the first as glide links along the whole note's one pitch path.
export function splitSlides(notes) {
  const out = [];
  for (const n of notes) {
    if (!n.slide || !n.slide.length || n.drum) { out.push(n); continue; }
    const end = n.tick + n.dur;
    let at = n.tick, off = 0;
    for (const sl of n.slide) {
      const r = Math.round(sl.to);
      if (r === off) continue;
      const t = n.tick + sl.t;
      if (t > at) out.push({...n, tick: at, dur: t - at, midi: n.midi + off, semitone: n.semitone + off, key: n.key != null ? n.key + off : undefined, slide: undefined, slid: true, env: pieceEnv(n, at, t), whole: n, off});
      at = t; off = r;
    }
    if (end > at) out.push({...n, tick: at, dur: end - at, midi: n.midi + off, semitone: n.semitone + off, key: n.key != null ? n.key + off : undefined, slide: undefined, slid: true, env: pieceEnv(n, at, end), whole: n, off});
  }
  return out;
}
// a piece's share of the note's volume shape (rare.mjs attachOneShotShapes), from the piece's own start
function pieceEnv(n, from, to) {
  if (!n.env) return undefined;
  const e = n.env.filter(q => n.tick + q.t > from && n.tick + q.t < to).map(q => ({t: n.tick + q.t - from, r: q.r}));
  return e.length ? e : undefined;
}

export function toNotesTxt(res, {title = "n64", tsNum = 4, tsDen = 4} = {}) {
  const beatsPerBar = tsNum * 4 / tsDen;
  const ticksPerBar = beatsPerBar * TICKS_PER_BEAT;
  const bars = Math.ceil(res.endTick / ticksPerBar);
  const tempo = res.tempos.map(t => t.bpm).join("→");
  const L = [];
  L.push(`# ${title} — ${tsNum}/${tsDen} (assumed; the sequence carries no meter), ${tempo}bpm, ${bars} bars (from N64 sequence, ${res.abi} ABI)`);
  L.push("# Format: bar N: beat pitch duration-in-quarter-notes vN [velocity 0-127 from the note command]. Drums are D<index> (bank not read; index is not a pitch).");
  L.push("# Channel identity is sequence fact. Pitches use sharp spelling and the +21 root convention (bank tuning not applied); no key is stated.");
  if (res.loop) L.push(`# loop: returns to tick ${res.loop.tick} (beat ${(res.loop.tick / TICKS_PER_BEAT + 1).toFixed(2)}) after tick ${res.loop.at}`);
  const split = splitSlides(res.notes);
  if (split.length !== res.notes.length) L.push("# pitch bends inside notes: each landed pitch is written as its own note");
  const byCh = new Map();
  for (const n of split) { if (!byCh.has(n.ch)) byCh.set(n.ch, []); byCh.get(n.ch).push(n); }
  for (const ch of [...byCh.keys()].sort((a, b) => a - b)) {
    const evs = byCh.get(ch);
    const insts = [...new Set(evs.map(n => n.inst))].map(i => i === 0x7F ? "drums" : i == null ? "none" : i).join(",");
    L.push("");
    L.push(`## channel ${ch} (instrument ${insts})`);
    const rows = {};
    for (const n of evs) {
      const bar = Math.floor(n.tick / ticksPerBar) + 1;
      const beat = (n.tick - (bar - 1) * ticksPerBar) / TICKS_PER_BEAT + 1;
      (rows[bar] = rows[bar] || []).push(`${+beat.toFixed(2)} ${label(n)} ${+(n.dur / TICKS_PER_BEAT).toFixed(2)} v${n.vel}`);
    }
    for (const bar of Object.keys(rows).map(Number).sort((a, b) => a - b)) L.push("bar " + bar + ": " + rows[bar].join(", "));
  }
  return L.join("\n") + "\n";
}

// The tracks a capture has, shared by the MIDI writer and the console
// renderer (render.mjs) so both name them identically: one per N64
// channel, melodic and kit apart. Percussion is drum notes plus any
// instrument that only ever plays ONE pitch, many times (a percussion
// sample on a melodic channel — the PS1 path's rule). Drum indexes name a
// slot in a bank the MIDI cannot carry, so their GM keys are guessed from
// rhythm (tools/kit-guess.mjs) — before this they sat at 35 + index, an
// arbitrary offset that played toms and cymbals for every hit (Josh, Mario
// 64's Title Theme, 2026-09-27: "a disaster"). The guess lands on each note
// as `gm`, on res.kitGuess, and once in res.warnings so the capture row can
// say so. Returns [{name, ch, kit, notes, first}] with the original note
// objects; a note the MIDI cannot hold (a pitch outside 0..127) is left out.
export function channelGroups(res, {tsNum = 4, tsDen = 4} = {}) {
  const notes = res.notes.filter(n => n.drum ? n.semitone >= 0 : n.midi >= 0 && n.midi <= 127);
  const byInst = new Map();
  for (const n of notes) if (!n.drum && n.inst != null) (byInst.get(n.inst) || byInst.set(n.inst, []).get(n.inst)).push(n);
  const percInst = new Set();
  for (const [inst, evs] of byInst) if (evs.length >= 12 && new Set(evs.map(n => n.midi)).size === 1) percInst.add(inst);
  const isPerc = n => n.drum || percInst.has(n.inst);
  // voices for the guess: a drum index, or a promoted instrument's one pitch
  const voices = new Map();
  for (const n of notes) {
    if (!isPerc(n)) continue;
    const k = n.drum ? "D" + n.semitone : "I" + n.inst;
    (voices.get(k) || voices.set(k, {id: k, key: n.drum ? n.semitone : n.midi, drum: !!n.drum, inst: n.inst, notes: []}).get(k)).notes.push(n);
  }
  const guess = [];
  if (voices.size) {
    const list = guessKit([...voices.values()], {beatTicks: TICKS_PER_BEAT * 4 / tsDen, barBeats: tsNum});
    for (const v of list) { for (const n of v.notes) n.gm = v.gm; guess.push({id: v.id, key: v.key, gm: v.gm, label: v.label, notes: v.count}); }
    guess.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
    const w = "kit guessed from rhythm: " + guess.map(g => g.id + " → " + g.label).join(", ");
    if (!(res.warnings || (res.warnings = [])).includes(w)) res.warnings.push(w);
  }
  res.kitGuess = guess;
  const groups = new Map(); // "<ch>" melodic, "<ch>k" kit
  for (const n of notes) {
    const g = n.ch + (isPerc(n) ? "k" : "");
    if (!groups.has(g)) groups.set(g, {ch: n.ch, kit: isPerc(n), notes: [], first: n});
    groups.get(g).notes.push(n);
  }
  return [...groups.values()].sort((a, b) => a.ch - b.ch || (a.kit ? 1 : 0) - (b.kit ? 1 : 0)).map(g => {
    const first = g.first;
    const inst = first.drum ? "drums" : first.inst == null ? "" : "inst " + first.inst + (g.kit ? " kit" : "");
    return {name: `ch ${g.ch}${inst ? " " + inst : ""}`, ch: g.ch, kit: g.kit, notes: g.notes, first};
  });
}

// One MIDI track per group, MIDI channel = N64 channel (identity over GM
// conventions), with percussion the one exception: the player treats MIDI
// channel 9 as the kit, so every kit group lands there and a melodic N64
// channel 9 moves to a free channel.
// offsets: {[group.name]: {offset, ...}} from tools/sounding.mjs, already
// APPLIED to res.notes' `midi` by applySoundingOffsets — toMidi only needs
// it here to write the per-track meta event that says by how much
// (offsetMetaEvent, tools/nsf/midi-write.mjs), for the tap preview to read back.
export function toMidi(res, {tsNum = 4, tsDen = 4, offsets, envelopes} = {}) {
  const scale = PPQ / TICKS_PER_BEAT;
  // slid notes become one note per landed pitch here (the render keeps the one voice); warnings/kitGuess land on `res`
  const view = {...res, notes: splitSlides(res.notes)};
  const groups = channelGroups(view, {tsNum, tsDen});
  res.kitGuess = view.kitGuess;
  const melodicChs = new Set(groups.filter(g => !g.kit).map(g => g.ch));
  let spare = null; // where a melodic N64 channel 9 goes: the first MIDI channel no melodic track uses
  for (let c = 0; c < 16 && spare === null; c++) if (c !== 9 && !melodicChs.has(c)) spare = c;
  const rare = res.driver === "rare";
  const oot = res.gen ? res.gen === "oot" : res.abi === "oot" || res.abi === "mm";
  // the track's pan as CC10 (0..127, 64 centre): the first note's at tick 0, then one at each change.
  // EAD: what the sequence set (channel pan × weight + layer pan × the rest); a drum's own bank pan is not
  // known here, so a kit with DC 0 shows the layer default (centre) — the render pans it from the bank.
  // Rare: the channel's cc10 as written, 0..127 (until capture v2 it was read as 0..1, so every Rare
  // track sat hard right).
  const panOf = rare ? n => Math.max(0, Math.min(127, Math.round(n.pan != null ? n.pan : 64)))
    : n => { const w = n.panWeight != null ? n.panWeight : 1, c = n.pan != null ? n.pan : 0.5, l = n.lyPan != null ? n.lyPan : 0.5; return Math.max(0, Math.min(127, Math.round((c * w + l * (1 - w)) * 127))); };
  const pitch = pitchPaths(res, {rare, oot});
  const rv = r => Math.max(0, Math.min(127, (r || 0) & 0x7F)); // the oot generation's send bit 7 swaps the wet sides; it is not level
  const tracks = groups.map(g => {
    const ch = g.kit ? 9 : g.ch === 9 ? (spare === null ? 9 : spare) : g.ch;
    const cc = [], metas = [];
    // the whole notes the pieces came from, in time order: the channel's timelines are read from them
    const wholes = [], seen = new Set();
    for (const n of g.notes) { const w = n.whole || n; if (!seen.has(w)) { seen.add(w); wholes.push(w); } }
    // pan: at each note-on (as before) and, capture v2, each change of the channel's while a note holds
    const panPts = [];
    for (const w of wholes) {
      panPts.push({t: w.tick, v: panOf(w)});
      for (const c of w.panChanges || []) panPts.push({t: w.tick + c.t, v: panOf({...w, ...c})});
    }
    panPts.sort((a, b) => a.t - b.t);
    let lastPan = null;
    for (const q of panPts) if (q.v !== lastPan) { if (lastPan !== null) cc.push({t: q.t * scale, cc: 10, v: q.v}); lastPan = q.v; }
    // CC7 (capture v2) = the channel's level, what the console mixes the voice by: EAD volume × scale × the
    // player's (DF/E0/DB/DA; the oot generation squares it), Rare cc7/127. Written at tick 0, then at every
    // change — at a note-on or under a held note (n.gain) — so every held voice follows it, as in the game.
    // Velocity stays the note command's.
    const lvAt = new Map();
    for (const w of wholes) for (const q of w.gain || []) if (q.t > 0 && !lvAt.has(w.tick + q.t)) lvAt.set(w.tick + q.t, q.l);
    for (const w of wholes) if (w.vol != null) lvAt.set(w.tick, w.vol);
    let lastLv = null;
    for (const t of [...lvAt.keys()].sort((a, b) => a - b)) {
      const l = lvAt.get(t), v = Math.max(0, Math.min(127, Math.round(127 * (oot ? l * l : l))));
      if (v !== lastLv) { metas.push({t: lastLv === null ? 0 : t * scale, o: -0.4, d: [0xB0 | (ch & 15), 7, v]}); lastLv = v; }
    }
    let most = 0;
    const notes = g.notes.map(n => {
      const o = {t: n.tick * scale, d: Math.max(1, n.dur * scale), p: g.kit ? n.gm : n.midi, v: Math.max(1, Math.min(127, n.vel))};
      const w = n.whole || n, rel = n.tick - w.tick;
      // reverb send (CC91): the channel's at the note-on (EAD D4/E8/E7), Rare's cc91 and its changes under the note
      let rev = rv(w.rev);
      for (const c of w.revChanges || []) if (c.t <= rel) rev = rv(c.rev);
      o.rev = [{t: 0, v: rev}];
      for (const c of w.revChanges || []) if (c.t > rel && c.t < rel + n.dur) o.rev.push({t: (w.tick + c.t) * scale - o.t, v: rv(c.rev)});
      if (!g.kit) {
        // program = the instrument the note plays, at each change (a synth waveform, 0x80 and up, has no number)
        if (w.inst != null && w.inst < 0x80) o.prog = w.inst;
        // glide link: a piece after the first of a wheel- or glide-split note, or an EAD continuous (C4)
        // note-on — the driver carrying the one voice on, never inferred from notes that merely touch
        if (rel > 0 || w.lg) o.lg = 1;
        const b = pitch.bendOf(n, o.t);
        if (b) { o.bend = b; for (const q of b) most = Math.max(most, Math.abs(q.c)); }
        // the envelope the voice is held under (noteEnvelopes): the volume shape, falls included, from the
        // WHOLE note's key-on — a continuation does not restart it, so its velocity is the level it has
        // ONE source per note, never both: the capture's own n.env when it has one (Rare: attachVoiceShapes,
        // the bank envelope × a one-shot sample's fade — the envelope is already in it), else the bank
        // envelope noteEnvelopes read (EAD). A whole note writes its shape as is; a piece after the first
        // samples the whole's shape from its own start (r(rel) becomes its velocity, the rest relative to it).
        const e = envelopes && envelopes.get(w);
        const r = w.env ? shapeAt(w.env) : e ? k => e.amp[Math.min(e.amp.length - 1, k)] / e.peak : null;
        if (w.env && n === w) o.env = w.env.map(q => ({t: q.t * scale, r: q.r}));
        else if (r) {
          if (rel > 0) o.v = Math.max(1, Math.min(127, Math.round(w.vel * r(rel))));
          const series = [];
          for (let k = 0; k < n.dur; k++) series.push([k, w.vel * r(rel + k)]);
          const env = shapeFromSeries({volSeries: series, startFrame: 0, endFrame: n.dur, vol: o.v}, o.v, o.d, scale, 127, {falls: true, tol: 2, floor: 0, attack: true});
          if (env) o.env = env;
        }
      }
      return o;
    });
    // bend points in cents → 14-bit against the track's range: ±2 (GM default, nothing written) unless it
    // bends further, then RPN 0 at tick 0 (capped at ±24, beyond it clamps) — tools/psx/notes.mjs's rule
    const semis = most > 200 ? Math.min(24, Math.ceil(most / 100)) : 2;
    for (const o of notes) if (o.bend) o.bend = o.bend.map(q => ({t: q.t, v: Math.max(-8192, Math.min(8191, Math.round(q.c / (semis * 100) * 8192)))}));
    if (semis > 2) metas.push(...bendRangeMetas(ch & 15, semis));
    return {
      name: g.name, ch, notes, metas,
      pan: g.notes.length ? panOf(g.notes[0].whole || g.notes[0]) : undefined, cc,
      offset: !g.kit && offsets && offsets[g.name] ? offsets[g.name].offset : 0,
    };
  });
  return makeMidiTracks(tracks, {tempos: res.tempos.map(t => ({t: t.tick * scale, bpm: t.bpm})), tsNum, tsDen});
}

// The sounding pitch of each note over time, in cents from its written key (N64 capture v2), and the bend
// a .mid note (a splitSlides piece) needs to follow it: the value at the piece's start, then each change
// inside it, measured from the piece's OWN key — so at a glide link the synth's step to the next key and
// the bend's jump cancel out (NIGHT-ROLL.md "Glide (CC84)"'s chain-relative rule; the pieces share one
// continuous path, so chainBends would have nothing to shift). Read from the driver's state, nothing per game:
//   EAD   the channel bend at the note-on and under it (D3/DE/EC: n.freq, n.freqChanges) and, per audio
//         update with the render's own Vibrato/Portamento classes (sm64 240/s, oot 180/s), vibrato (n.vib,
//         n.vibChanges) and portamento (n.porta: the voice starts on porta.start) — thinned to corners
//         (RDP, 3 cents);
//   Rare  the wheel at the note-on (n.bendC0) and each wheel event under it (n.slide), steps, as the SDK
//         player steps the voice.
function pitchPaths(res, {rare, oot}) {
  const tempos = res.tempos;
  const ups = oot ? OOT_UPDATES_PER_SECOND : UPDATES_PER_SECOND;
  const scale = PPQ / TICKS_PER_BEAT;
  const secTick = sec => { // seconds → sequence ticks under the tempo map (tickSeconds' inverse)
    let acc = 0;
    for (let i = 0; i < tempos.length; i++) {
      const per = 60 / (tempos[i].bpm * TICKS_PER_BEAT), next = i + 1 < tempos.length ? tempos[i + 1].tick : Infinity;
      const span = (next - tempos[i].tick) * per;
      if (sec <= acc + span) return tempos[i].tick + (sec - acc) / per;
      acc += span;
    }
    return 0;
  };
  const cents = f => 1200 * Math.log2(f > 0 ? f : 1);
  const cache = new Map();
  const pathOf = w => { // {pts: [{tick, c}] in sequence ticks, sorted, each held until the next; smooth: dense samples}
    if (cache.has(w)) return cache.get(w);
    const pts = [];
    let smooth = false;
    if (rare) {
      const c0 = w.bendC0 || 0;
      pts.push({tick: w.tick, c: c0});
      for (const sl of w.slide || []) pts.push({tick: w.tick + sl.t, c: c0 + 100 * sl.to});
    } else if (!w.vib && !w.porta) {
      pts.push({tick: w.tick, c: cents(w.freq != null ? w.freq : 1)});
      for (const fc of w.freqChanges || []) pts.push({tick: w.tick + fc.t, c: cents(fc.f)});
    } else {
      smooth = true;
      const t0 = tickSeconds(tempos, w.tick), t1 = tickSeconds(tempos, w.tick + w.dur);
      const at = list => (list || []).map(c => ({...c, s: tickSeconds(tempos, w.tick + c.t)}));
      const fcs = at(w.freqChanges), vcs = at(w.vibChanges);
      const vib = w.vib ? new (oot ? OotVibrato : Vibrato)(w.vib, vcs) : null;
      const porta = w.porta ? (oot ? new OotPortamento(w.porta) : new Portamento(w.porta)) : null;
      const base = w.porta ? 100 * (w.porta.start - w.semitone) : 0;
      let f = w.freq != null ? w.freq : 1, fi = 0;
      for (let k = 0; k < 200000; k++) {
        const s = t0 + k / ups;
        if (s >= t1) break;
        while (fi < fcs.length && fcs[fi].s <= s) f = fcs[fi++].f;
        let m = 1;
        if (vib) { while (vib.ci < vcs.length && vcs[vib.ci].s <= s) vib.retarget(vcs[vib.ci++]); m *= vib.update(); }
        if (porta) m *= porta.update();
        pts.push({tick: k ? secTick(s) : w.tick, c: base + cents(f * m)});
      }
    }
    const out = {pts: pts.map(q => ({tick: q.tick, c: Math.round(q.c)})), smooth};
    cache.set(w, out);
    return out;
  };
  return {
    // n: a splitSlides piece (or a whole note), t: its MIDI tick → [{t: MIDI ticks from its start, c}] or undefined
    bendOf(n, t) {
      const {pts, smooth} = pathOf(n.whole || n);
      const off = 100 * (n.off || 0), from = n.tick, to = n.tick + n.dur;
      let start = pts.length ? pts[0].c : 0;
      for (const q of pts) if (q.tick <= from) start = q.c;
      let line = [{t: 0, c: start - off}];
      for (const q of pts) if (q.tick > from && q.tick < to) {
        const qt = Math.max(1, Math.round(q.tick * scale) - t), last = line[line.length - 1];
        if (last.t === qt) last.c = q.c - off; else line.push({t: qt, c: q.c - off});
      }
      if (smooth) line = rdpCents(line, 3);
      const kept = [];
      for (const q of line) if (q.c !== (kept.length ? kept[kept.length - 1].c : 0)) kept.push(q);
      return kept.length ? kept : undefined;
    },
  };
}
// a volume shape [{t ticks, r}] as a function of the tick: 1 at the note-on, straight lines between its
// points, the last held — how the synth plays it (src/audio/voices.js noteShapeRamp)
function shapeAt(env) {
  return k => {
    let pt = 0, pr = 1;
    for (const q of env) { if (k <= q.t) return q.t <= pt ? q.r : pr + (q.r - pr) * (k - pt) / (q.t - pt); pt = q.t; pr = q.r; }
    return pr;
  };
}
// bend points [{t, c}] thinned to their corners (Ramer–Douglas–Peucker within tol cents; first and last kept)
function rdpCents(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Set([0, pts.length - 1]);
  const rdp = (a, b) => {
    let best = -1, bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const dv = Math.abs(pts[i].c - (pts[a].c + (pts[b].c - pts[a].c) * (pts[i].t - pts[a].t) / (pts[b].t - pts[a].t || 1)));
      if (dv > bestD) { best = i; bestD = dv; }
    }
    if (best < 0) return;
    keep.add(best); rdp(a, best); rdp(best, b);
  };
  rdp(0, pts.length - 1);
  return pts.filter((_, i) => keep.has(i));
}

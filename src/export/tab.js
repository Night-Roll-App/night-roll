// Guitar tab for Export score / tab (docs/plans/2026-11-27-score-tab-export.md
// §6, review blocker 5): string/fret assignment over the score model's events,
// and the ASCII tab text. Pure — imports nothing, so render/instrument.js
// (layer 3) takes its fretboard numbers from here rather than the other way
// round (tools/split/check.mjs: export is layer 2).
//
// Learning mode: the text carries frets, bar lines where the ruler puts them,
// the track name and the file's own tempo — a meter line only when declared,
// never a key or a chord name.

// high e first — tab convention (the top line of a tab is the high string)
export const TAB_TUNING = [64, 59, 55, 50, 45, 40];
export const TAB_STRING_NAMES = ["e", "B", "G", "D", "A", "E"];
export const TAB_FRETS = 24;
export const TAB_WINDOW = 5; // frets either side of the hand's last position

// Octave-fold a pitch into the neck's range; shift = octaves moved (0 = on
// the neck as written). The fold is what lets an NES line two octaves above
// the neck still print; the `*` in the text says it was moved.
export function tabFold(p, tuning = TAB_TUNING, frets = TAB_FRETS) {
  const lo = tuning[tuning.length - 1], hi = tuning[0] + frets;
  let shift = 0;
  while (p > hi) { p -= 12; shift--; }
  while (p < lo) { p += 12; shift++; }
  return {p, shift};
}

// Every string/fret where a (folded) pitch lies on the neck; string is
// 1-based from the high e (MusicXML's numbering, and the tab's top line).
export function tabCandidates(p, tuning = TAB_TUNING, frets = TAB_FRETS) {
  const out = [];
  tuning.forEach((open, i) => { const f = p - open; if (f >= 0 && f <= frets) out.push({string: i + 1, fret: f}); });
  return out;
}

// The window rule: prefer the lowest fret within TAB_WINDOW of the hand's
// last fretted position (open strings always qualify), a tie goes to the
// higher string; nothing in reach → the lowest fret on the neck. `last` is
// null before the first fretted note.
function pickOne(cands, last, window) {
  const near = last === null ? cands : cands.filter(c => c.fret === 0 || Math.abs(c.fret - last) <= window);
  const pool = near.length ? near : cands;
  return pool.slice().sort((a, b) => a.fret - b.fret || a.string - b.string)[0];
}

// A chord: distinct strings, the set with the lowest fret sum (then the
// smallest span); pitches that cannot all fit lose their position (null) —
// the text skips them and the footnote counts them.
function pickChord(candLists, last, window) {
  const n = candLists.length;
  let best = null;
  const used = new Set();
  const pick = new Array(n).fill(null);
  const dfs = (i, sum, lo, hi) => {
    if (i === n) {
      const inReach = last === null || pick.every(c => c.fret === 0 || Math.abs(c.fret - last) <= window);
      const score = [inReach ? 0 : 1, sum, hi - lo];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2]))))
        best = {score, pick: pick.slice()};
      return;
    }
    for (const c of candLists[i]) {
      if (used.has(c.string)) continue;
      used.add(c.string); pick[i] = c;
      dfs(i + 1, sum + c.fret, c.fret > 0 ? Math.min(lo, c.fret) : lo, c.fret > 0 ? Math.max(hi, c.fret) : hi);
      used.delete(c.string);
    }
  };
  dfs(0, 0, Infinity, -Infinity);
  if (best) return best.pick;
  // more notes than strings can hold: place what fits, in pitch order, the rest unplaced
  const out = [];
  const taken = new Set();
  for (const cands of candLists) {
    const c = cands.filter(x => !taken.has(x.string)).sort((a, b) => a.fret - b.fret || a.string - b.string)[0] || null;
    if (c) taken.add(c.string);
    out.push(c);
  }
  return out;
}

// Positions for one staff: `measures` is the model's (score.js
// buildScoreModelFor), events in time order, melodic only. Returns a Map
// event → [{string, fret, folded}|null] aligned with e.pitches. A tied
// continuation (e.tieFrom) keeps the position of the note it continues.
export function tabAssign(measures, opts = {}) {
  const tuning = opts.tuning || TAB_TUNING, frets = opts.frets === undefined ? TAB_FRETS : opts.frets;
  const window = opts.window === undefined ? TAB_WINDOW : opts.window;
  const out = new Map();
  let last = null;
  for (const bar of measures) for (const e of bar) {
    if (e.rest) continue;
    if (e.tieFrom && out.has(e.tieFrom)) { out.set(e, out.get(e.tieFrom)); continue; }
    const folds = e.pitches.map(p => tabFold(p, tuning, frets));
    const candLists = folds.map(f => tabCandidates(f.p, tuning, frets));
    let picks;
    if (e.pitches.length === 1) picks = [candLists[0].length ? pickOne(candLists[0], last, window) : null];
    else picks = pickChord(candLists, last, window);
    const pos = picks.map((c, i) => c ? {string: c.string, fret: c.fret, folded: folds[i].shift !== 0} : null);
    const fretted = pos.filter(c => c && c.fret > 0).map(c => c.fret);
    if (fretted.length) last = Math.round(fretted.reduce((a, b) => a + b, 0) / fretted.length);
    out.set(e, pos);
  }
  return out;
}

// Bars per system: meter-aware so a line never passes ~64 columns of 16ths
// (a 7/4 bar is 28 columns wide — two to a line; 4/4 → four; 3/4 → five).
export function tabBarsPerSystem(sixteenthsPerBar) { return Math.max(1, Math.floor(64 / Math.max(1, sixteenthsPerBar))); }

// The text. One column per 16th of the grid; a cell wider than one character
// (a two-digit fret, a `*` fold mark) or a note followed by a note on the
// next 16th widens that column on EVERY string, so the six rows stay aligned. `|` at bar lines; bar numbers above each system;
// the header is the track name (and the song's), the meter only when declared,
// the tempo from the file's own map; a legend line only when something folded.
export function asciiTab({title, track, measures, bt, ppq, positions, tempoBpm, declaredTs, tuning, names} = {}) {
  const tun = tuning || TAB_TUNING, nm = names || TAB_STRING_NAMES;
  const grid = ppq / 4;
  const perBar = Math.max(1, Math.round(bt / grid));
  const pos = positions || tabAssign(measures, {tuning: tun});
  let folded = 0, dropped = 0;
  const bars = measures.map((bar, mi) => {
    const cells = Array.from({length: perBar}, () => tun.map(() => ""));
    for (const e of bar) {
      if (e.rest || e.tieFrom) continue; // a tied continuation is not re-struck
      const k = Math.round((e.start - mi * bt) / grid);
      if (k < 0 || k >= perBar) continue;
      const ps = pos.get(e) || [];
      e.pitches.forEach((p, i) => {
        const c = ps[i];
        if (!c) { dropped++; return; }
        if (c.folded) folded++;
        cells[k][c.string - 1] = String(c.fret) + (c.folded ? "*" : "");
      });
    }
    // a note on the very next 16th gets a dash between them ("8-8", never "88" — a reader would see fret 88); the extra column
    // pushes every row together, like a two-digit fret does
    const struck = cells.map(col => col.some(s => s));
    const widths = cells.map((col, k) => Math.max(1, ...col.map(s => s.length)) + (struck[k] && struck[k + 1] ? 1 : 0));
    return tun.map((_, si) => cells.map((col, k) => col[si].padEnd(widths[k], "-")).join(""));
  });
  const perSystem = tabBarsPerSystem(perBar);
  const lines = [];
  lines.push((title ? title + " — " : "") + (track || "track"));
  const meta = [];
  if (declaredTs) meta.push(declaredTs[0] + "/" + declaredTs[1]);
  if (tempoBpm) meta.push("♩ = " + tempoBpm);
  meta.push("standard tuning (" + nm.slice().reverse().join(" ") + "), " + TAB_FRETS + " frets");
  lines.push(meta.join(" · "));
  for (let b0 = 0; b0 < bars.length; b0 += perSystem) {
    const sys = bars.slice(b0, b0 + perSystem);
    lines.push("");
    // bar numbers: each at its bar's first column (rows are "e|" + bar + "|" + bar …)
    let numLine = "  ";
    sys.forEach((rows, j) => {
      const label = String(b0 + j + 1);
      numLine = numLine.padEnd(2 + sys.slice(0, j).reduce((a, r) => a + r[0].length + 1, 0), " ") + label;
    });
    lines.push(numLine);
    tun.forEach((_, si) => lines.push(nm[si] + "|" + sys.map(rows => rows[si]).join("|") + "|"));
  }
  if (folded || dropped) {
    lines.push("");
    if (folded) lines.push("* " + folded + (folded === 1 ? " note" : " notes") + " moved by an octave to fit the neck");
    if (dropped) lines.push("(" + dropped + (dropped === 1 ? " note" : " notes") + " of a chord had no free string and " + (dropped === 1 ? "is" : "are") + " left out)");
  }
  return lines.join("\n") + "\n";
}

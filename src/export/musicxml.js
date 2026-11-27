// MusicXML 4.0 (partwise) for Export score / tab (docs/plans/2026-11-27-
// score-tab-export.md §6, review blockers 2-3 + the divisions note). A pure
// text writer over the score model's events (render/score.js
// buildScoreModelFor): one <part> per staff, the kit as two voices of
// <unpitched> notes, an optional TAB staff under a melodic part. Validated
// against the W3C XSD by tools/musicxml-check.sh (tests/fixtures/musicxml-xsd).
//
// Learning mode is the law: <key> only where keyAt (sfDeclaredAtRaw — never
// an estimate, never the key dial's preview) says he declared one; <time> is
// always present so readers cut bars where our ruler does, but hidden
// (print-object="no") unless he declared the meter; never <harmony>, never
// <rehearsal>. Tempo is the file's own.
import { tabAssign, TAB_TUNING, TAB_FRETS } from "./tab.js";

// Divisions per quarter. The model is a 16th grid with dotted pieces, so 8
// (16th = 2, dotted 16th = 3, whole = 32) is integral for ANY ppq; ppq
// itself would make a dotted 16th 0.375·ppq — fractional unless ppq % 8 = 0.
export const MXL_DIVISIONS = 8;
export const MXL_TYPE_DIV = {w: 32, h: 16, q: 8, "8": 4, "16": 2};
export const MXL_TYPE_NAME = {w: "whole", h: "half", q: "quarter", "8": "eighth", "16": "16th"};
export const MXL_SOFTWARE = "Night Roll";

export function xmlEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function mxlPieceDivisions(dur, dots) { return MXL_TYPE_DIV[dur] * (dots ? 1.5 : 1); }
// Greedy rest pieces for a gap of `divs` divisions (the bar's tail, review
// blocker 2); a remainder under a 16th (never on the grid) is dropped.
export function mxlRestPieces(divs) {
  const table = [[32, "w", 0], [24, "h", 1], [16, "h", 0], [12, "q", 1], [8, "q", 0], [6, "8", 1], [4, "8", 0], [3, "16", 1], [2, "16", 0]];
  const out = [];
  let rem = divs;
  while (rem >= 2) {
    const hit = table.find(([d]) => d <= rem);
    out.push({dur: hit[1], dots: hit[2], divs: hit[0]});
    rem -= hit[0];
  }
  return out;
}
// <pitch> from the same spelling the score view engraves with (vexKey's
// inputs): the octave is the LETTER's, so Cb4 and B#3 land where a reader
// expects.
export function mxlPitch(p, spell) {
  const s = spell[((p % 12) + 12) % 12];
  const alter = s.acc === "#" ? 1 : s.acc === "b" ? -1 : s.acc === "##" ? 2 : s.acc === "bb" ? -2 : 0;
  return {step: s.letter.toUpperCase(), alter, octave: Math.floor((p - alter) / 12) - 1};
}
// A kit event's key string ("c/5", "g/5/x2": DRUM_SCORE roles) → display step/octave + x head.
export function mxlDrumKey(key) {
  const [step, oct, head] = key.split("/");
  return {step: step.toUpperCase(), octave: +oct, x: head === "x2"};
}
const CLEF = {treble: "<sign>G</sign><line>2</line>", bass: "<sign>F</sign><line>4</line>", percussion: "<sign>percussion</sign><line>2</line>"};
const NOTE_NAMES = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
const NOTE_ALTER = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

// {title, album, ppq, bt, ts, declaredTs, staves, trackNames, tempos, keyAt,
//  spellAt, tab} → the document. ts = the ruler's meter (effTs), declaredTs
// null unless his; keyAt(tick) → declared sf or null; spellAt(tick) → the
// spelling table; tab = {tracks: Set<ti>, tuning?, frets?} or null.
export function musicXmlDocument(o) {
  const {ppq, bt, staves} = o;
  const ts = o.ts || [4, 4];
  const btDiv = Math.round(bt / ppq * MXL_DIVISIONS);
  const nMeasures = staves.length ? staves[0].measures.length : 0;
  const tuning = (o.tab && o.tab.tuning) || TAB_TUNING, frets = o.tab && o.tab.frets !== undefined ? o.tab.frets : TAB_FRETS;
  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  L.push('<score-partwise version="4.0">');
  L.push("  <work><work-title>" + xmlEsc(o.title || "Untitled") + "</work-title></work>");
  L.push("  <identification><encoding><software>" + MXL_SOFTWARE + "</software></encoding>" + (o.album ? "<source>" + xmlEsc(o.album) + "</source>" : "") + "</identification>");
  L.push("  <part-list>");
  staves.forEach((st, si) => {
    L.push('    <score-part id="P' + (si + 1) + '"><part-name>' + xmlEsc((o.trackNames && o.trackNames[si]) || "Track " + (st.ti + 1)) + "</part-name></score-part>");
  });
  L.push("  </part-list>");
  staves.forEach((st, si) => {
    const isTab = !!(o.tab && !st.drums && o.tab.tracks && o.tab.tracks.has(st.ti));
    const positions = isTab ? tabAssign(st.measures, {tuning, frets}) : null;
    const tieNext = new Set();
    for (const bar of st.measures) for (const e of bar) if (e.tieFrom) tieNext.add(e.tieFrom);
    L.push('  <part id="P' + (si + 1) + '">');
    for (let mi = 0; mi < nMeasures; mi++) {
      const tick0 = mi * bt;
      const sfNow = o.keyAt(tick0), sfPrev = mi > 0 ? o.keyAt(tick0 - bt) : undefined;
      const spell = o.spellAt(tick0);
      L.push('    <measure number="' + (mi + 1) + '">');
      if (mi === 0) {
        const a = ["<divisions>" + MXL_DIVISIONS + "</divisions>"];
        if (sfNow !== null && sfNow !== undefined) a.push("<key><fifths>" + sfNow + "</fifths></key>");
        a.push("<time" + (o.declaredTs ? "" : ' print-object="no"') + "><beats>" + ts[0] + "</beats><beat-type>" + ts[1] + "</beat-type></time>");
        if (isTab) a.push("<staves>2</staves>");
        a.push(isTab ? '<clef number="1">' + CLEF[st.clef] + "</clef>" : "<clef>" + (CLEF[st.clef] || CLEF.treble) + "</clef>");
        if (isTab) {
          a.push('<clef number="2"><sign>TAB</sign><line>5</line></clef>');
          const lines = tuning.slice().reverse().map((p, i) => {
            const pc = ((p % 12) + 12) % 12;
            return '<staff-tuning line="' + (i + 1) + '"><tuning-step>' + NOTE_NAMES[pc] + "</tuning-step>" + (NOTE_ALTER[pc] ? "<tuning-alter>" + NOTE_ALTER[pc] + "</tuning-alter>" : "") + "<tuning-octave>" + (Math.floor(p / 12) - 1) + "</tuning-octave></staff-tuning>";
          });
          a.push('<staff-details number="2"><staff-lines>' + tuning.length + "</staff-lines>" + lines.join("") + "</staff-details>");
        }
        L.push("      <attributes>" + a.join("") + "</attributes>");
      } else if (sfNow !== null && sfNow !== undefined && sfNow !== sfPrev) {
        L.push("      <attributes><key><fifths>" + sfNow + "</fifths></key></attributes>");
      }
      if (si === 0 && o.tempos) { // the file's own tempo map, in the first part (a direction is score-wide to readers)
        const byTick = new Map();
        for (const tp of o.tempos) if (tp.tick >= tick0 && tp.tick < tick0 + bt) byTick.set(tp.tick, tp); // two at one tick: the later entry wins, as playback does
        for (const tp of byTick.values()) {
          const bpm = Math.round(6e7 / tp.usq * 100) / 100;
          const off = Math.round((tp.tick - tick0) / ppq * MXL_DIVISIONS);
          L.push('      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>' + bpm + "</per-minute></metronome></direction-type>" + (off ? "<offset>" + off + "</offset>" : "") + '<sound tempo="' + bpm + '"/></direction>');
        }
      }
      const voice = (events, v, staffNo, tabStaff, hidden, stemDir) => { // → {xml: [lines], divs}
        const out = [];
        let divs = 0;
        const staffTag = staffNo ? "<staff>" + staffNo + "</staff>" : "";
        const rest = (dur, dots, measureRest) => {
          out.push("      <note" + (hidden ? ' print-object="no"' : "") + ">" + (measureRest ? '<rest measure="yes"/>' : "<rest/>") + "<duration>" + (measureRest ? btDiv : mxlPieceDivisions(dur, dots)) + "</duration><voice>" + v + "</voice>" + (measureRest ? "" : "<type>" + MXL_TYPE_NAME[dur] + "</type>" + (dots ? "<dot/>" : "")) + staffTag + "</note>");
        };
        for (const e of events) {
          const d = mxlPieceDivisions(e.dur, e.dots);
          if (divs + d > btDiv + 0.001) break; // never past the bar (the model cuts at barlines; this is the guard)
          divs += d;
          if (e.rest) { rest(e.dur, e.dots, false); continue; }
          const typeDots = "<type>" + MXL_TYPE_NAME[e.dur] + "</type>" + (e.dots ? "<dot/>" : "");
          if (st.drums) {
            e.keys.forEach((k, j) => {
              const dk = mxlDrumKey(k);
              out.push("      <note>" + (j ? "<chord/>" : "") + "<unpitched><display-step>" + dk.step + "</display-step><display-octave>" + dk.octave + "</display-octave></unpitched><duration>" + d + "</duration><voice>" + v + "</voice>" + typeDots + "<stem>" + stemDir + "</stem>" + (dk.x ? "<notehead>x</notehead>" : "") + "</note>");
            });
            continue;
          }
          const stop = !!e.tieFrom, start = tieNext.has(e);
          const ties = (stop ? '<tie type="stop"/>' : "") + (start ? '<tie type="start"/>' : "");
          const tied = (stop ? '<tied type="stop"/>' : "") + (start ? '<tied type="start"/>' : "");
          const pos = tabStaff && positions ? positions.get(e) || [] : null;
          e.pitches.forEach((p, j) => {
            const pt = mxlPitch(p, spell);
            const tech = pos && pos[j] ? "<technical><string>" + pos[j].string + "</string><fret>" + pos[j].fret + "</fret></technical>" : "";
            const notations = tied || tech ? "<notations>" + tied + tech + "</notations>" : "";
            out.push("      <note>" + (j ? "<chord/>" : "") + "<pitch><step>" + pt.step + "</step>" + (pt.alter ? "<alter>" + pt.alter + "</alter>" : "") + "<octave>" + pt.octave + "</octave></pitch><duration>" + d + "</duration>" + ties + "<voice>" + v + "</voice>" + typeDots + staffTag + notations + "</note>");
          });
        }
        if (!divs) { rest(null, 0, true); divs = btDiv; }
        else for (const p of mxlRestPieces(btDiv - divs)) { rest(p.dur, p.dots, false); divs += p.divs; }
        return {xml: out, divs};
      };
      if (st.drums) {
        const hands = voice(st.measures[mi] || [], 1, null, false, false, "up");
        const feet = voice((st.measuresFeet && st.measuresFeet[mi]) || [], 2, null, false, true, "down");
        L.push(...hands.xml, "      <backup><duration>" + hands.divs + "</duration></backup>", ...feet.xml);
      } else {
        const v1 = voice(st.measures[mi] || [], 1, isTab ? 1 : null, false, false);
        L.push(...v1.xml);
        if (isTab) {
          const v2 = voice(st.measures[mi] || [], 5, 2, true, false);
          L.push("      <backup><duration>" + v1.divs + "</duration></backup>", ...v2.xml);
        }
      }
      L.push("    </measure>");
    }
    L.push("  </part>");
  });
  L.push("</score-partwise>");
  return L.join("\n") + "\n";
}

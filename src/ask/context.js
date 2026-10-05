import { S } from "../state.js";
import { impDisplayTitle } from "../import/capture.js";
import { titleCaseSlug } from "../model/catalog.js";
import { LINK_SONGS } from "../platform/base.js";
import { linkRepoLabel } from "../platform/base.js";
import { appMode } from "../platform/mode.js";
import { barTicks } from "../model/rollnotes.js";
import { wrap } from "../render/roll.js";
import { pxPerTick } from "../render/roll.js";
import { sfDeclaredAtRaw } from "../model/song.js";
import { estimateKey } from "../model/song.js";
import { keyNameAt } from "../model/song.js";
import { beatTicks } from "../model/grid.js";
import { effTs } from "../model/grid.js";
import { trackIsDrums } from "../model/grid.js";
import { trackAudible } from "../audio/engine.js";
import { pitchName } from "../theory/chords.js";
import { spellPc } from "../theory/chords.js";
import { fnv1a32 } from "../gen/drummer.js";
import { EDITION } from "../edition.js";
import { logLines } from "../model/jobs.js";
import { debugLogOn } from "../model/jobs.js";
import { curTick } from "../render/roll.js";
import { askSeenGet } from "./bridge.js";
import { askSeenStage } from "./bridge.js";
import { askMaxErrId } from "./bridge.js";
import { askMaxStatusId } from "./bridge.js";
import { logLine } from "../model/jobs.js";
import { askStoreKey } from "./sheet.js";
import { cfg } from "../platform/storage.js";
import { ASK_TERMINAL_KEY } from "./bridge.js";
import { songTitleOf } from "../hooks.js";
import { keyLabelState } from "../ui/chrome.js";
import { editableSong } from "../model/song.js";
import { baseName } from "../model/rollnotes.js";
import { nameChord } from "../theory/chords.js";
import { askAnnotationsTextCompact } from "./tools.js";
import { askAnnotationsText } from "./tools.js";
import { dedupedNotesWithIndex } from "../model/rollnotes.js";
import { annoShown } from "../model/rollnotes.js";
import { askAnnotationStructural } from "./tools.js";
import { askHost } from "./host.js";
import { aiSentKey, aiSentGet, aiSentStage, aiSentStageBars, AI_SENT_BARS_CAP, aiSentCommit, aiSentDrop, aiSentReset, aiEpochKey, aiEpochGet, aiEpochSet, aiEpochNote, aiCachedBlock } from "../../vendor/ai/web/ctx-cache.js";
import { aiStripContext } from "../../vendor/ai/web/store.js";

// resolved in boot() once the manifest is in
export function songTitleOfImpl(path) {
  for (const songs of Object.values(S.CATALOG)) {
    const hit = songs.find(([, p]) => p === path);
    if (hit) return hit[0];
  }
  const base = path.split("/").pop().replace(/\.midi?$/i, "");
  try { // a draft may carry a typed title (rename / import naming)
    const d = JSON.parse(localStorage.getItem("ff1roll-draft-" + path) || "null");
    if (d && d.title) return impDisplayTitle(d, base);
  } catch (err) { /* corrupt draft */ }
  return titleCaseSlug(base);
}
// Published or Local, meaning what Open's two sections mean: a copy on this
// device is Local, even of a published song (Josh, 2026-09-29). Shared by
// updateSongBtn's breadcrumb below and askOpenSongLine (the bridge context
// block's compact song summary for the general/Terminal tabs, which have no
// other song context) — one wording, never duplicated (Josh, 2026-09-30).
export function songWhereLabel(path) {
  const group = Object.entries(S.CATALOG).find(([, songs]) => songs.some(([, p]) => p === path));
  const local = localStorage.getItem("ff1roll-draft-" + path) !== null;
  return (LINK_SONGS ? "🔗 " + linkRepoLabel(LINK_SONGS) + " › " : "") + (local || !group ? "Local" : "Published");
}

// ---------------------------------------------------------------- ✦ AI (in-app AI)
// Design: docs/design/local-llm-design.md (advisor-converged, Josh's rulings 2026-09-25).
// A tutor and, later, a generator, over ONE adapter: any OpenAI-compatible
// server (LM Studio / Ollama, this machine or another on the network). The
// house rules ride in the system prompt: hints first, answers when he insists.
// Every request carries ONE context block (never stored) under a budget keyed
// to the model's window; bars and beats in the protocol are the RULER's —
// display bars, the declared meter's counted beat — never quarters.
// ASK_SYS split (P4, 2026-09-30): a shared BASE plus a per-mode RULE
// paragraph, picked at SEND time by askSys() — never cached, since the
// device-global mode can flip between messages. RULE_LEARNING is
// yesterday's "THE RULE" paragraph, verbatim (Learning's tutoring never
// changed); RULE_NORMAL is new (other users, one device switch — CLAUDE.md
// scope, Josh's ruling 2026-09-29).
export const ASK_SYS_BASE1 = `You are the resident music-theory tutor inside Night Roll, a piano-roll + engraved-score web app for studying NES soundtracks and learning composition. The user often chats from an iPad — keep replies short and warm, a few sentences unless asked for depth. Plain text only: no markdown, no headers, no bullet lists.`;
export const RULE_LEARNING = `THE RULE: discoveries are the user's. Default to hints, questions and direction (what does the bass outline? which accidental keeps appearing? what happens on the downbeat of bar 9?). When the user has made a guess, confirm or refine it honestly. If the user asks to be told, give one strong hint first; if they insist again, or say they give up, tell them plainly — never withhold forever. General theory concepts (what is a secondary dominant? how do sevenths resolve?) are fair game to answer directly: concepts aren't spoilers, per-song conclusions are.`;
export const RULE_NORMAL = `Answer music questions directly — name keys, chords, cadences and form when asked; say how sure you are; the key line may be an estimate, call it one.`;
export const ASK_SYS_BASE2 = `Each user message carries a <context> block: the song, the meter, the cursor, any lasso-selected pitches, the user's own annotations (their established discoveries — build on them), and the notes of the bars in view. Bar and beat numbers are the user's ruler: "bar 9 beat 2" is the counted beat of the declared meter (in 6/8 there are six beats per bar). Refer to locations that way. The key-state line says whether the user has set a key; if it is not set, the key is undiscovered — do not name it. If the song is the user's own composition, it is editable and they may ask what they wrote — still lead with a hint. Say "not sure" when you are not sure. Never invent notes that are not in the context.

What you are inside Night Roll, so you never misdescribe it: the app attaches the <context> block itself — the user pastes nothing, and never needs to. For this project, always prefer the context block and the tools below over reading a song's file yourself, even where the system you're running in can otherwise read files, the repo or the web — they reflect the user's LIVE state, unsaved edits included, which a file on disk does not; say what access you actually have only when asked, rather than assuming either way. You have thirteen app tools, all of them ONLY when the user explicitly asks for that exact action, never on your own initiative: add_annotation writes ONE annotation in the user's words, at the bar and beat they said (chord, section, key, tempo, loop, or a plain note); edit_annotation changes an EXISTING annotation's text (and, if asked, where it sits) — target it by the "id" its context entry carries, or by its bar, beat and current text if the id has gone stale; delete_annotation removes one existing annotation the same way; all three say what they did in one short line, and if the target is ambiguous they ask which rather than guess. publish_song runs this song's Publish (the same one the footer button does) and reports what happened — it refuses when the device isn't connected (no GitHub token, no folder) or nothing here can be published, and says why. list_songs, read_song and read_notes let you look at another song in this Night Roll when the user refers to one ("compare this to ambush") — read, then answer under THE RULE as usual. read_bars reads bars of THIS song beyond what the context block's current window shows (live state, unsaved edits included) — ask for it instead of guessing an out-of-view bar or telling the user you can't see it; some bars in the context may already read "as sent earlier" instead of their notes — you still have those from earlier in this chat, no need to ask again. write_notes writes notes the user dictates onto a track they name (never the one selected in the app) — spell out every note yourself (a gallop is an eighth plus two sixteenths: write all three, don't use the word); it writes exactly what was asked, never a chord, key or note of your own choosing, lands as one undo step, and refuses on a locked/capture song. copy_bars repeats or duplicates bars that already exist — "repeat bars 5–6 after bar 6" is copy_bars({from_bar: 5, to_bar: 6, at_bar: 7}), never a hand-spelled write_notes call; it opens the gap on every track (notes AND annotations after it slide later, exactly like Insert bars…), copies the source bars' notes into that gap on every track including drums, and never duplicates an annotation into the copy (that's the user's own analysis). insert_bars makes empty room — at_bar and count, nothing copied — the same shift, for when the user asks to insert or add blank bars rather than repeat existing ones. delete_bars removes bars that already exist — from_bar and count, the inverse shift: a note starting inside is deleted, one sustaining across the cut is clipped there, and everything after slides earlier to close the gap (annotations are never destroyed — one anchored inside the deleted span moves to the cut point, one straddling it shrinks) — only when the user explicitly asks to delete or remove bars. All three land as one undo step and refuse on a locked/capture song. drummer runs the app's own Drummer generator over a bar range or one of the user's section labels (energy, or busy/hard apart, fills, feel, parts, and follow = which tracks the kick listens to) — the way to do ANY drum request ("redo the intro following pulse1 and pulse2", "the A part with a bit less energy"), never a hand-spelled write_notes; it replaces that range's drum hits as one undo step, says the seed so the same take can be redone with one knob changed, and refuses on a locked/capture song. In the annotations, "loop: B.Q" marks a playback loop (the anchor is the jump point, B.Q the return), "key:" sets the key state, "section" lines are form labels, "chord" lines are the user's own chord readings. If the user says they are testing, not ready, or asks you to stop bringing up the music, do exactly that until they say they are ready — answer only what they asked.`;
export function askSys() { return ASK_SYS_BASE1 + "\n\n" + (appMode() === "normal" ? RULE_NORMAL : RULE_LEARNING) + "\n\n" + ASK_SYS_BASE2; }
// the span the current turn was sent against
// chars per token for THIS content: note dumps are digits and short names —
// measured 7.3k chars → 3839 tokens on Qwen 3.6 (2026-09-25), not prose's 4
export const ASK_CPT = 2;
// ---- the span: the ruler selection if armed, else the bars in view. ONE
// frame everywhere — display bars/beats (chop-relative, the declared meter's
// counted beat). The turn is sent against the span as frozen at Send.
export function askSpan() {
  const bt = barTicks();
  const end = Math.max(bt, S.songEndTick);
  let t0, t1, src;
  if (S.rangeSel && S.rangeSel.b > S.rangeSel.a) {
    t0 = Math.floor(S.rangeSel.a / bt) * bt; t1 = Math.ceil(S.rangeSel.b / bt) * bt; src = "selected";
  } else {
    const w = (wrap && wrap.clientWidth) || 800;
    const ppt = pxPerTick();
    t0 = Math.floor(Math.max(0, S.view.x / ppt) / bt) * bt;
    t1 = Math.ceil(Math.min(end, (S.view.x + w - S.RULER_W) / ppt) / bt) * bt;
    src = "in view";
  }
  if (src === "in view") { t0 = Math.max(0, Math.min(t0, end - bt)); t1 = Math.min(t1, end); } // a ruler selection may reach past the song's end (a fill can extend it)
  t1 = Math.max(t0 + bt, t1);
  return {t0, t1, from: Math.floor(t0 / bt) + 1, to: Math.ceil(t1 / bt), src};
}
export function askSpanLabel(sp) { return "bars " + sp.from + "–" + sp.to + " (" + sp.src + ")"; }
export function askKeyDeclared(t0, t1) { return sfDeclaredAtRaw(t0) !== null || S.keyRegions.some(r => r.start >= t0 && r.start < t1); }
// askKeySpellComment: the one comment line stating whether/how pitches below
// are spelled — declared key, Normal-mode estimate, or (Learning, or Normal
// with nothing declared and no estimate yet) plain sharps naming no key.
// Factored out (step 5, docs/ask-token-plan.md) so askSpanNotes (full) and
// askSpanNotesCompact (bridge) share the IDENTICAL Learning-mode gate —
// estimateKey() is only ever reached when appMode() === "normal" (P4 spy
// test), never duplicated into two call sites that could drift.
export function askKeySpellComment(t0, t1) {
  const declared = askKeyDeclared(t0, t1);
  // Normal, nothing declared over this whole span: fall back to the estimate
  // for BOTH the header comment and the spelling — stated, never silent
  // (P4). Learning never reaches this (appMode() gates it, same convention
  // as sfShownAt/keyNameShownAt — see the spy test).
  const est = !declared && appMode() === "normal" ? estimateKey() : null;
  const line = declared ? "# Pitches are spelled by the user's declared key (" + (keyNameAt(t0) || "declared") + ")."
        : est ? "# Pitches are spelled by the Normal-mode key ESTIMATE (" + est.name + ", Krumhansl — unconfirmed)."
        : "# Pitches use sharp spelling; the true key is the user's to discover — this block states no key.";
  return {declared, est, line};
}
export function askSpanNotes(t0, t1, maxChars) { // notesTxtFor's shape, three deltas: declared meter, display beats, one speller
  const bt = barTicks(), qt = beatTicks(), ts = effTs();
  const fmt = x => String(Math.round(x * 100) / 100);
  const {est, line} = askKeySpellComment(t0, t1);
  const L = [];
  L.push("# Format: bar N: beat pitch duration, … — beat = the counted beat of the declared meter (" + ts[0] + "/" + ts[1] + ": " + ts[0] + " beats per bar, 1 = the downbeat); duration in the same unit.");
  L.push("# duration is GATE TIME (how long the note was held), NOT a notated value; RHYTHM comes from ONSET SPACING (the beat column): staccato notes gating at 0.33 are still eighths, not triplets.");
  L.push(line);
  const b0 = Math.floor(t0 / bt), b1 = Math.ceil(t1 / bt);
  let cut = null, size = L.join("\n").length;
  S.song.tracks.forEach((tr, ti) => {
    const head = "\n## track " + (ti + 1) + (tr.name ? " (" + tr.name + ")" : "") + (trackIsDrums(ti) ? " [drums]" : "") + (trackAudible(ti) ? "" : " [muted]");
    const rows = [];
    for (let b = b0; b < b1; b++) {
      if (cut !== null && b + 1 > cut) break;
      const ns = tr.notes.filter(n => !n.gone && n.t >= Math.max(b * bt, t0) && n.t < Math.min((b + 1) * bt, t1)).sort((a, c) => a.t - c.t || a.p - c.p);
      if (!ns.length) continue;
      const row = "bar " + (b + 1) + ": " + ns.map(n =>
        fmt((n.t - b * bt) / qt + 1) + " " + (trackIsDrums(ti) ? String(n.p) : pitchName(n.p, sfDeclaredAtRaw(n.t) ?? (est ? est.sf : null))) + " " + fmt(n.d / qt)).join(", ");
      if (maxChars && size + head.length + row.length + 2 > maxChars) { cut = b + 1; break; }
      rows.push(row); size += row.length + 1;
    }
    if (rows.length) { L.push(head); L.push(...rows); size += head.length; }
  });
  if (cut !== null) L.push("# (cut at bar " + cut + " to fit the model's window — ask about a narrower range for the rest)");
  return L.join("\n");
}
// askSpanNotesCompact (step 5, docs/ask-token-plan.md): the SAME facts as
// askSpanNotes, sent to the BRIDGE only (askContext picks this one when
// askCaps.bridge — local/LM Studio providers keep askSpanNotes, full, every
// turn, since they hold no session memory of their own to lean on). One row
// per bar, no word "bar": "<bar>|<beat><Pitch><oct>/<dur> <beat><Pitch>…" —
// octave and duration are each written only when they differ from the
// PREVIOUS NOTE IN THAT ROW (first note of a row always carries both, so a
// row stands alone). The per-turn format explanation moves to askLegendText
// (sent once per session); the key-spelling line stays here, every turn,
// because it's content (which key, if any) — never static boilerplate, and
// shares askKeySpellComment with askSpanNotes so Learning's gate on
// estimateKey() can never drift between the two. Drums: the raw note number,
// "#"-prefixed so a run of digits can't be misread as another beat.
export function askSpanNotesCompact(t0, t1, maxChars) {
  const bt = barTicks(), qt = beatTicks();
  const fmt = x => String(Math.round(x * 100) / 100);
  const {est, line} = askKeySpellComment(t0, t1);
  const L = [line];
  const b0 = Math.floor(t0 / bt), b1 = Math.ceil(t1 / bt);
  let cut = null, size = L.join("\n").length;
  S.song.tracks.forEach((tr, ti) => {
    const drums = trackIsDrums(ti);
    const head = "\nT" + (ti + 1) + (tr.name ? " " + tr.name : "") + (drums ? " [drums]" : "") + (trackAudible(ti) ? "" : " [muted]");
    const rows = [];
    for (let b = b0; b < b1; b++) {
      if (cut !== null && b + 1 > cut) break;
      const ns = tr.notes.filter(n => !n.gone && n.t >= Math.max(b * bt, t0) && n.t < Math.min((b + 1) * bt, t1)).sort((a, c) => a.t - c.t || a.p - c.p);
      if (!ns.length) continue;
      let lastOct = null, lastDur = null; // reset each row: "the previous note in the row" never reaches across bars
      const toks = ns.map(n => {
        const beat = fmt((n.t - b * bt) / qt + 1), dur = fmt(n.d / qt);
        if (drums) { const tok = beat + "#" + n.p + (dur !== lastDur ? "/" + dur : ""); lastDur = dur; return tok; }
        const oct = Math.floor(n.p / 12) - 1, cls = spellPc(n.p % 12, sfDeclaredAtRaw(n.t) ?? (est ? est.sf : null));
        let tok = beat + cls;
        if (oct !== lastOct) tok += oct;
        if (dur !== lastDur) tok += "/" + dur;
        lastOct = oct; lastDur = dur;
        return tok;
      });
      const row = (b + 1) + "|" + toks.join(" ");
      if (maxChars && size + head.length + row.length + 2 > maxChars) { cut = b + 1; break; }
      rows.push(row); size += row.length + 1;
    }
    if (rows.length) { L.push(head); L.push(...rows); size += head.length; }
  });
  if (cut !== null) L.push("# (cut at bar " + cut + " to fit the model's window — ask about a narrower range for the rest)");
  return L.join("\n");
}
// ---- step 6 (docs/ask-token-plan.md): skip already-sent bars + read_bars.
// askBarRow factors ONE track's one-bar row out of askSpanNotesCompact above
// (same math — octave/duration carried forward within the row, reset every
// bar) so this section and read_bars (ASK_TOOLS) build/hash a single bar
// without a second place that could drift from the format askSpanNotesCompact
// already defines. It assumes a bar-aligned window (b*bt .. (b+1)*bt) —
// askSpan's own invariant (t0/t1 are always floor/ceil'd to a bar) — so,
// unlike askSpanNotesCompact's inner loop, it does not need to clamp to a
// t0/t1 that could land mid-bar.
export function askBarRow(tr, ti, b, bt, qt, est) {
  const fmt = x => String(Math.round(x * 100) / 100);
  const drums = trackIsDrums(ti);
  const ns = tr.notes.filter(n => !n.gone && n.t >= b * bt && n.t < (b + 1) * bt).sort((a, c) => a.t - c.t || a.p - c.p);
  if (!ns.length) return null;
  let lastOct = null, lastDur = null; // reset every bar — never carries across bars, same rule as askSpanNotesCompact
  const toks = ns.map(n => {
    const beat = fmt((n.t - b * bt) / qt + 1), dur = fmt(n.d / qt);
    if (drums) { const tok = beat + "#" + n.p + (dur !== lastDur ? "/" + dur : ""); lastDur = dur; return tok; }
    const oct = Math.floor(n.p / 12) - 1, cls = spellPc(n.p % 12, sfDeclaredAtRaw(n.t) ?? (est ? est.sf : null));
    let tok = beat + cls;
    if (oct !== lastOct) tok += oct;
    if (dur !== lastDur) tok += "/" + dur;
    lastOct = oct; lastDur = dur;
    return tok;
  });
  return (b + 1) + "|" + toks.join(" ");
}
// askBarFingerprint: the "compact rows" for ONE bar, across every track in
// order — what the per-bar sent-hash record below hashes. "" (never cached,
// never staged — nothing to collapse) when nothing sounds in that bar at all.
export function askBarFingerprint(b, bt, qt, est) {
  const parts = [];
  S.song.tracks.forEach((tr, ti) => { const row = askBarRow(tr, ti, b, bt, qt, est); if (row) parts.push("T" + (ti + 1) + row); });
  return parts.join("\n");
}
// askSpanNotesCompactCached: askSpanNotesCompact's bridge-only sibling for
// askContext's notes window. A bar whose fingerprint hash matches what THIS
// chat already confirmed sending (askSentGet(key).bars, keyed by 1-based bar
// number) collapses, with its run of likewise-unchanged neighbors, into one
// "bars A–B: as sent earlier" line (singular "bar A: as sent earlier" for a
// run of one) instead of repeating content the resumed Claude Code session
// already holds verbatim; a new or edited bar still renders in full, grouped
// by track exactly as askSpanNotesCompact does, for just that run of bars.
// Returns {text, allCached}: allCached lets askSpanCachedBlock (below) fall
// back to the existing whole-window "unchanged since your last message"
// stand-in when EVERY bar in the window was already sent — a steady view
// costs exactly what it did before this step, not one "as sent earlier" line
// per bar. Stages (never commits — askSentCommit, from askFinish, success-
// only, same as every other sent-hash field) the hashes of the bars this
// call is about to show in full; a cached bar's hash is already on record
// and needs no restaging.
export function askSpanNotesCompactCached(t0, t1, maxChars, key) {
  const bt = barTicks(), qt = beatTicks();
  const {est, line} = askKeySpellComment(t0, t1);
  const b0 = Math.floor(t0 / bt), b1 = Math.ceil(t1 / bt);
  const prevBars = askSentGet(key).bars || {};
  const bars = [];
  for (let b = b0; b < b1; b++) {
    const fp = askBarFingerprint(b, bt, qt, est);
    const hash = fp ? fnv1a32(fp) : null; // null: no content in this bar at all — never "cached", nothing to stage
    bars.push({bar: b + 1, hash, cached: hash !== null && prevBars[b + 1] === hash});
  }
  const stage = {};
  for (const x of bars) if (x.hash !== null && !x.cached) stage[x.bar] = x.hash;
  if (Object.keys(stage).length) askSentStageBars(key, stage);
  const anyContent = bars.some(x => x.hash !== null);
  const allCached = anyContent && bars.every(x => x.hash === null || x.cached);
  const L = [line];
  let size = L.join("\n").length, cut = null, i = 0;
  while (i < bars.length && cut === null) {
    const cachedRun = bars[i].cached;
    let j = i; while (j < bars.length && bars[j].cached === cachedRun) j++;
    const run = bars.slice(i, j);
    if (cachedRun) {
      if (run.some(x => x.hash !== null)) { // an all-empty run has nothing to announce either way
        const label = run.length > 1 ? "bars " + run[0].bar + "–" + run[run.length - 1].bar + ": as sent earlier" : "bar " + run[0].bar + ": as sent earlier";
        if (maxChars && size + label.length + 1 > maxChars) { cut = run[0].bar; break; }
        L.push(label); size += label.length + 1;
      }
    } else {
      const subB0 = run[0].bar - 1, subB1 = run[run.length - 1].bar;
      S.song.tracks.forEach((tr, ti) => {
        const drums = trackIsDrums(ti);
        const head = "\nT" + (ti + 1) + (tr.name ? " " + tr.name : "") + (drums ? " [drums]" : "") + (trackAudible(ti) ? "" : " [muted]");
        const rows = [];
        for (let b = subB0; b < subB1; b++) {
          if (cut !== null && b + 1 > cut) break;
          const row = askBarRow(tr, ti, b, bt, qt, est);
          if (!row) continue;
          if (maxChars && size + head.length + row.length + 2 > maxChars) { cut = b + 1; break; }
          rows.push(row); size += row.length + 1;
        }
        if (rows.length) { L.push(head); L.push(...rows); size += head.length; }
      });
    }
    i = j;
  }
  if (cut !== null) L.push("# (cut at bar " + cut + " to fit the model's window — ask about a narrower range for the rest)");
  return {text: L.join("\n"), allCached};
}
// askSpanCachedBlock: askContext's own "notes in bars a–b" field. Non-bridge
// (no session to lean on): unchanged, full askSpanNotes every turn, exactly
// as before this step. Bridge: askSpanNotesCompactCached's per-bar collapsing,
// falling back to the plain "unchanged since your last message" stand-in
// (askCachedBlock's own wording, kept identical on purpose) when the whole
// window was already sent.
export function askSpanCachedBlock(key, label, t0, t1, maxChars) {
  if (!S.askCaps.bridge) return label + ":\n" + askSpanNotes(t0, t1, maxChars);
  const r = askSpanNotesCompactCached(t0, t1, maxChars, key);
  return r.allCached ? label + ": unchanged since your last message" : label + ":\n" + r.text;
}
// askLegendText (step 5): the compact format's explanation, sent ONCE per
// bridge session (tied to the same sent-hash record askCachedBlock uses —
// askContext stages/commits it as the "legend" field, so it reappears after
// Clear chat, Compact, or a changed session epoch, same as the annotations/
// notes stand-ins do). Never sent to a non-bridge provider.
export function askLegendText() {
  return "# Compact context format (this explanation is sent once per session — later turns omit it):\n" +
    "# notes: \"T<n> name\" starts a track (\"[drums]\"/\"[muted]\" tag if either applies); each row is \"<bar>|<beat><Pitch><oct>/<dur> …\" — beat is the counted beat of the declared meter, 1 = the downbeat; duration is GATE TIME (how long the note was held), NOT a notated value — rhythm comes from onset spacing, not duration. Octave and duration repeat from the previous note IN THAT ROW when omitted (the first note of a row always states both). A drum track gives the raw note number after \"#\" instead of a pitch letter (e.g. \"2.5#38\").\n" +
    "# annotations: \"<id> [bar.beat-bar.beat] kind: value — comment\"; id is this turn's handle for edit_annotation/delete_annotation; structural track/lane/audio directives (song-structure, not analysis) are left out here — they're unchanged in the app.\n" +
    "# a bar already sent unchanged in an earlier turn of THIS chat may be shown as \"bar N: as sent earlier\" or \"bars A–B: as sent earlier\" instead of its rows (you still have it from before); use read_bars(from_bar, to_bar) for any bar you need restated or haven't seen yet, rather than guessing or asking the user to repeat it.";
}
export function askAppState() { // what is running: build, install, audio engine, the last ⚠ lines — a bug report should need no relay (Josh, 2026-09-27: "you should have access to the current running build and any errors")
  const installed = (typeof navigator !== "undefined" && navigator.standalone) || (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
  const L = [];
  L.push("app: build " + (document.lastModified || "unknown") + (typeof EDITION !== "undefined" && EDITION === "app" ? " · the iPad app" : installed ? " · installed (home screen)" : " · in the browser") + (typeof navigator !== "undefined" && navigator.onLine === false ? " · offline" : "") +
         "; audio engine: " + (typeof S.audio !== "undefined" && S.audio ? S.audio.state : "not created yet") + (typeof S.playing !== "undefined" && S.playing ? ", playing" : ""));
  const lines = typeof logLines === "function" ? logLines() : [];
  const errs = lines.slice(-8).map(e => (e.t instanceof Date ? e.t.toTimeString().slice(0, 8) + " " : "") + (e.debug ? "[debug] " : "") + e.msg + (e.n > 1 ? " ×" + e.n : ""));
  L.push("recent ⚠ log (" + lines.length + " total" + (typeof debugLogOn === "function" && debugLogOn() ? ", debug lines included" : "") + "; newest last):\n" + (errs.length ? errs.join("\n") : "(none)"));
  return L.join("\n");
}
// askModeLine (P4): "mode: normal" when Normal, else null (omitted) — the
// bridge's own system prompt (tools/claude-bridge.mjs BRIDGE_SYS_READ/FULL)
// reads this same convention: no mode line in the context = Learning.
export function askModeLine() { return appMode() === "normal" ? "mode: normal" : null; }
export function askViewCursorLine(bt, qt, tick) { // shared by the song chat's own line (below) and askOpenSongLine (general/Terminal's compact summary) — one wording, never duplicated
  return "view: " + S.viewMode + (S.playing ? ", playing" : ", paused") + (S.playRate !== 1 ? " at " + Math.round(S.playRate * 100) + "% speed" : "") +
         "; cursor: bar " + (Math.floor(tick / bt) + 1) + " beat " + (Math.round(((tick % bt) / qt + 1) * 100) / 100);
}
// General/Terminal chats carry no per-song context of their own (askGeneral's
// branch below says so explicitly) — but a song may still be open behind
// them, and Josh never wants to have to say which one or copy its facts over
// (2026-09-30). Compact on purpose: title, path, published/local, view,
// cursor — not the meter/annotations/notes bulk the song chat's own context
// already carries.
export function askOpenSongLine() {
  if (!S.songKey || !S.song) return null;
  return "open song: " + songTitleOf(S.songKey) + " (" + S.songKey + ", " + songWhereLabel(S.songKey) + ") — " + askViewCursorLine(barTicks(), beatTicks(), curTick());
}
// "New since your last message:" (2026-09-30, Josh via the iPad Ask — every
// bridge message should carry what changed since his last one, so he never
// has to copy/paste an error or a status line over by hand). Per-chat cursor
// (askSeenGet/askSeenAdvance, below) so each chat only sees what's NEW to
// IT — a line already sent in that chat never repeats. Capped and
// oldest-first-dropped (askCapLines) to keep it cheap; omitted entirely when
// there's nothing new, so an ordinary turn costs nothing extra.
export function askCapLines(arr, n, fmt) {
  const shown = arr.slice(-n), older = arr.length - shown.length;
  return shown.map(fmt).join("\n") + (older > 0 ? "\n(+" + older + " older)" : "");
}
export function askNewSinceLines(key) {
  const seen = askSeenGet(key);
  // Learning is the law (CLAUDE.md): a line pushed while the device was in
  // Normal mode (a chord/key/meter estimate the selection strip or LCD
  // showed) must never reach a Learning-mode context, whatever it says —
  // dropped here by its OWN tag (logPush/setInfo), not by guessing from text
  const hideNormal = appMode() !== "normal";
  const errs = logLines().filter(l => l.id > seen.err && (!hideNormal || l.mode !== "normal"));
  const stats = S.statusHistory.filter(s => s.id > seen.status && (!hideNormal || s.mode !== "normal"));
  askSeenStage(key, {err: askMaxErrId(), status: askMaxStatusId()}); // this exact snapshot is what a successful send commits
  const L = [];
  if (errs.length) L.push("new ⚠ messages (" + errs.length + "):\n" + askCapLines(errs, 20, logLine));
  if (stats.length) L.push("new status lines (" + stats.length + "):\n" + askCapLines(stats, 20, s => new Date(s.t).toLocaleTimeString() + "  " + s.text));
  return L.length ? "New since your last message:\n" + L.join("\n") : null;
}
// ---- bridge-session caching (2026-10-01, Josh via open-items: "make the
// ✦ Ask context cheaper"). The bridge's Claude Code is a RESUMED session,
// one per song key (sessionFor/runClaude, tools/claude-bridge.mjs) — it
// remembers earlier turns, so resending the two big, slow-changing sections
// below (annotations, the visible note window) every turn is pure
// repetition once the session already holds them. Per chat (askStoreKey(),
// same key the seen-cursor above already uses): a hash of each section
// LAST CONFIRMED SENT; unchanged since then, on the bridge, → a one-line
// stand-in instead of the full text. Full whenever the session might not
// hold it: first message of a chat (a fresh store key has no record), after
// Clear chat / Compact (reset below — the bridge's own session controls),
// after the song key changes (its own store key, so its own empty record),
// after a failed send (askSentCommit runs from askFinish only, never
// askFail), and always for a non-bridge backend (askCaps.bridge — the same
// flag askTabsApply/askSessionRender use to detect the bridge at all; a
// local model server has no memory of its own, so it keeps today's
// full-every-turn behaviour).
// The cache's mechanics live in the AI library (vendor/ai/web/ctx-cache.js,
// step 4) under the same storage keys; these are Night Roll's bare names as
// delegates — askHost() supplies the open chat's key and the state bag.
export function askSentKey(key) { return aiSentKey(askHost(), key); }
export function askSentGet(key) { return aiSentGet(askHost(), key); }
export function askSentStage(key, field, hash) { aiSentStage(askHost(), key, field, hash); }
// the "bars" field is a MAP (bar number → hash), merged, never overwritten
export function askSentStageBars(key, barsObj) { aiSentStageBars(askHost(), key, barsObj); }
export const ASK_SENT_BARS_CAP = AI_SENT_BARS_CAP;
export function askSentCommit(key) { aiSentCommit(askHost(), key); } // askFinish only: the reply that answers THIS context actually landed
export function askSentDrop(key) { aiSentDrop(askHost(), key); } // askFail: never landed — the full text goes again next time
export function askSentReset(key) { aiSentReset(askHost(), key); } // Clear chat / Compact: the bridge's memory of this chat just changed under it
// ---- session epoch (docs/ask-token-plan.md #4/#7): the bridge names each
// resumed Claude Code session's identity as "<session-id>:<lastCompact.at||0>"
// in the x-nr-session-epoch response header on every chat completion — it
// changes the instant a compact (manual OR the bridge's own automatic one)
// lands on that song's session, because the session either restarted or lost
// its verbatim memory of what askCachedBlock thinks is still "unchanged
// since your last message". Kept per chat (askStoreKey()), right beside the
// sent-hash record: a changed epoch means the one this device is sending
// against is stale, so it resets the SAME way Clear chat / a manual Compact
// already do (askSentReset) — next message resends annotations/notes in
// full rather than a stand-in the resumed session no longer backs.
export function askEpochKey(key) { return aiEpochKey(askHost(), key); }
export function askEpochGet(key) { return aiEpochGet(askHost(), key); }
export function askEpochSet(key, epoch) { aiEpochSet(askHost(), key, epoch); }
export function askEpochNote(key, epoch) { aiEpochNote(askHost(), key, epoch); } // called wherever a chat completion's response headers are read
// One large, slow-changing section: `label` names the one-line stand-in
// ("annotations" / "notes in bars a–b"); `count`, if given, is its own
// "(N entries)". The library's hash is the same FNV-1a 32 as fnv1a32, so
// every record a device already holds still matches.
export function askCachedBlock(key, field, label, header, text, count) { return aiCachedBlock(askHost(), key, field, label, header, text, count); }
export function askBudget() { // profiles keyed to the window (tokens); LM Studio loads at 4–8k by default, WebLLM's prebuilts are 4096
  // the bridge's Claude Code has a large window whatever the Settings field
  // says: the 8k default trimmed its context and warned about a "small
  // window" it does not have (Josh, 2026-09-26)
  const claude = /^claude/i.test(String(cfg().aiModel || (S.askModelCache && S.askModelCache.ids && S.askModelCache.ids[0]) || ""));
  const win = cfg().aiBackend === "browser" ? 4096 : claude ? 200000 : (+cfg().aiWindow || 8192);
  return win <= 4096 ? {win, small: true, anno: 500, span: 1200, hist: 300}
       : win <= 8192 ? {win, small: true, anno: 1000, span: 2000, hist: 1000}
                     : {win, small: false, anno: 6000, span: 8000, hist: 3000};
}
export function askStripContext(text) { return aiStripContext(text); }
// Mode-tagged history (2026-10-01, SAFETY): every stored message carries the
// mode it was PUSHED in (askSend/askFinish/askFail/askNotesArrived —
// `mode: appMode()` at push time); a legacy message from before this tag
// existed has no `mode` field, and is treated as "learning" (Learning is the
// default mode, Normal is the newer one — CLAUDE.md: Learning is the law).
// askSessionName already keeps Learning/Normal on separate BRIDGE sessions
// (2026-10-01, commit 0701a7f) — this is the other half: the on-device
// transcript (askStore) is shared across modes, and askBuildMessages is the
// one place history from it reaches a model request, so a Normal-mode turn
// (which may carry a key/chord estimate) must never be included when the
// CURRENT request is Learning, and vice versa.
export function askMsgMode(m) { return m.mode || "learning"; }
export function askBuildMessages(msgs, text, ctx, budget) { // stripped history newest-first until the history budget is spent
  const out = [];
  let left = budget.hist * ASK_CPT;
  const mode = appMode();
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].pending) continue; // the question in flight is sent as the live one, not as history
    if (askMsgMode(msgs[i]) !== mode) continue; // a different mode's turn — never enters this request's context
    const c = askStripContext(msgs[i].content);
    if (c.length > left) break;
    left -= c.length;
    out.unshift({role: msgs[i].role, content: c});
  }
  out.push({role: "user", content: "<context>\n" + ctx + "\n</context>\n\n" + text});
  return out;
}
export function askEstimate(system, messages) { return Math.round((system.length + messages.reduce((a, m) => a + m.content.length, 0)) / ASK_CPT); }
// The Terminal tab has no model call of its own (no askContext/askBuildMessages)
// — this is its ONLY context builder. Same two pieces as the general chat's
// "New since your last message:" addendum, minus the music-tutor framing
// text, which doesn't apply here (Josh, 2026-09-30).
export function askTerminalContext() {
  const parts = [];
  const openLine = askOpenSongLine();
  if (openLine) parts.push(openLine);
  const ns = askNewSinceLines(ASK_TERMINAL_KEY);
  if (ns) parts.push(ns);
  return parts.length ? parts.join("\n") : null;
}

// askKeyStateLine (P4): Learning matches keyLabelState()'s text BYTE FOR
// BYTE (built from data now, never the DOM — see keyLabelState's comment);
// Normal states declared-vs-estimated plainly instead, since an estimate
// may be named under RULE_NORMAL.
export function askKeyStateLine() {
  if (appMode() !== "normal") return "key state: " + keyLabelState().text + " — 'not set' means the user has NOT discovered the key; do not reveal it";
  if (S.keyRegions.length) return "key state: declared " + S.keyRegions.map(r => r.name + (r.b2 ? "(" + r.b1 + "–" + r.b2 + ")" : "")).join(", ");
  const est = estimateKey();
  return est ? "key state: estimated " + est.name + " (Krumhansl, confidence " + (Math.round(est.conf * 100) / 100) + ")"
             : "key state: undetermined — not enough notes yet to estimate";
}
export function askContext(sp, budget) { // the ONE block per request; never stored
  if (S.askGeneral) {
    let s = "general chat — no song attached. The user opened the general Ask: for the app, the project, music in general, or a message for the terminal; nothing here is about one song. Do not read or discuss the open song unless asked, and do not add annotations. " +
      (appMode() === "normal" ? "The tutor rule about answering music questions directly still holds." : "The tutor rule about the user's own discoveries still holds for music questions.") +
      (appMode() === "normal" ? "\nmode: normal" : "") + "\n" + askAppState();
    const openLine = askOpenSongLine();
    if (openLine) s += "\n" + openLine;
    const ns = askNewSinceLines(askStoreKey());
    if (ns) s += "\n" + ns;
    return s;
  }
  const bt = barTicks(), qt = beatTicks(), ts = effTs();
  const tick = curTick();
  const own = editableSong(); // P1: was missing the link-mode/compare-repo guards editableSong() has (Bugs found, docs/provenance-plan.md) — a linked/compare-repo song now correctly tells the tutor it's locked, like everywhere else
  const tempo = S.song.tempos.reduce((acc, t) => (t.tick <= sp.t0 ? t : acc), S.song.tempos[0]);
  const L = [];
  L.push("song: " + baseName() + (S.songKey && S.songKey.startsWith("albums/") ? " (album: " + S.songKey.split("/")[1] + ")" : "") +
         (own ? " — the user's own composition (editable)" : " — a locked capture the user is studying"));
  L.push("meter: " + ts[0] + "/" + ts[1] + " (beat = " + (ts[1] === 8 ? "eighth" : ts[1] === 16 ? "sixteenth" : ts[1] === 2 ? "half note" : "quarter") + "), tempo: " +
         Math.round(6e7 / tempo.usq) + " bpm, " + Math.max(1, Math.ceil(S.songEndTick / bt)) + " bars");
  L.push("tracks: " + S.song.tracks.map((t, i) => (t.name || "track " + (i + 1)) + (trackIsDrums(i) ? " (drums)" : "") + (trackAudible(i) ? "" : " (muted)")).join(", "));
  L.push(askViewCursorLine(bt, qt, tick));
  L.push(askKeyStateLine());
  const modeLine = askModeLine();
  if (modeLine) L.push(modeLine);
  L.push(askAppState());
  if (S.multiSel.length) {
    const pitches = [...new Set(S.multiSel.map(m => S.song.tracks[m.ti].notes[m.ni].p))].sort((a, b) => a - b);
    const names = pitches.map(p => pitchName(p, S.multiSelSf)).join(" ");
    L.push(appMode() === "normal"
      ? "lasso-selected notes: " + names + " — chord: " + nameChord(pitches, S.multiSelSf)
      : "lasso-selected notes: " + names + " — do not name this chord unless the user has guessed or insists");
  }
  const cacheKey = askStoreKey();
  // step 5 (docs/ask-token-plan.md): the BRIDGE gets the compact encodings
  // (askSpanNotesCompact/askAnnotationsTextCompact) — a resumed Claude Code
  // session is the only backend that can lean on a one-time legend instead
  // of a format explanation every turn; a local/LM Studio provider has no
  // memory of its own, so it keeps today's full, self-explaining format.
  if (S.askCaps.bridge) {
    const sent = askSentGet(cacheKey);
    if (!sent.legend) { L.push(askLegendText()); askSentStage(cacheKey, "legend", true); }
  }
  const anno = S.askCaps.bridge ? askAnnotationsTextCompact() : askAnnotationsText();
  const annoCap = budget.anno * ASK_CPT;
  const annoFull = anno.length > annoCap ? anno.slice(0, annoCap) + "\n# (annotations cut here to fit the window)" : anno;
  const annoCount = S.askCaps.bridge ? dedupedNotesWithIndex(S.rollnotes).filter(({n}) => annoShown(n) && !askAnnotationStructural(n)).length : dedupedNotesWithIndex(S.rollnotes).filter(({n}) => annoShown(n)).length; // annoShown: the same set askAnnotationsText*/read_notes list
  L.push(askCachedBlock(cacheKey, "anno", "annotations", "the user's annotations (.rollnotes) — each entry's \"id\" is this turn's handle for edit_annotation/delete_annotation", annoFull, annoCount));
  const spanLabel = "notes in bars " + sp.from + "–" + sp.to;
  L.push(askSpanCachedBlock(cacheKey, spanLabel, sp.t0, sp.t1, budget.span * ASK_CPT)); // step 6: per-bar collapsing on the bridge (askSpanNotesCompactCached), full askSpanNotes otherwise — see both above
  const ns = askNewSinceLines(askStoreKey());
  if (ns) L.push(ns);
  return L.join("\n");
}

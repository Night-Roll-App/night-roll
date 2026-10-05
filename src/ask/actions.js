import { S } from "../state.js";
import { barTicks } from "../model/rollnotes.js";
import { beatTicks } from "../model/grid.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { tickToSec } from "../midi/parse.js";
import { play } from "../audio/transport.js";
import { stop } from "../audio/transport.js";
import { jumpToTick } from "../input/gestures.js";
import { jumpBarCap } from "../input/gestures.js";
import { editUndoPop } from "../ui/note-editor.js";
import { editRedoPop } from "../ui/note-editor.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { askWritableGate } from "./tools.js";
import { askBarsCount } from "./tools.js";
import { askDrummer } from "./tools.js";
import { askAddAnnotation } from "./tools.js";
import { askEditAnnotation } from "./tools.js";
import { askDeleteAnnotation } from "./tools.js";
import { askPublishSong } from "./tools.js";
import { askListSongs } from "./tools.js";
import { askReadSong } from "./tools.js";
import { askReadNotes } from "./tools.js";
import { askReadBars } from "./tools.js";
import { askWriteNotes } from "./tools.js";
import { askCopyBars } from "./tools.js";
import { askInsertBars } from "./tools.js";
import { askDeleteBars } from "./tools.js";
import { askSongPath } from "./tools.js";
import { LINK_SONGS } from "../platform/base.js";
import { draftDirtyState } from "../ui/chrome.js";
import { songTitleOfImpl as songTitleOf } from "./context.js";
import { askStoreKey } from "./sheet.js";
import { askStore } from "./bridge.js";
import { askShotDisplayText } from "./shots.js";

// ---- act: the one Ask tool every app action lives behind (docs/ai-parity.md
// §2; batch 1 of §5). Josh, #435: the menu sent with every message must not
// grow with each feature, and "go to bar 13 and play" must cost one short
// reply, not three. ASK_ACTIONS is the source of truth: the tool's
// description is ONE index line per action, built from it in name order, so
// the menu is byte-identical every message (prompt caches and small local
// windows both want that — a test pins it); an action's full text goes out
// only on demand (help) or in the error of a rejected call, so a wrong guess
// costs the one round help would and a right guess costs nothing.
//
// To add an action, push ONE entry: {name, args, gloss, spec, example, say,
// quiet?, song?, run(a) → one line}. The index, help, the errors, the
// general-chat variant, the Help sheet's "AI commands" rows
// (tools/build_ask_help.mjs) and the tests' stability pin all follow from it.
//   args    terse arg names for the index line ("bar beat?"; ? = optional)
//   gloss   3–6 words for the index line
//   spec    the full text, sent on demand: args, rules, what it answers
//   example one spoken phrase for the Help sheet; say = how to phrase it
//   quiet   navigation/playback/view: when every item of a call is quiet and
//           succeeds, the result line IS the reply (the AI library's {final}
//           protocol, vendor/ai/web/backends.js aiToolFinal) — no second
//           model round. Edits and questions are answered by the model.
//   song    default true = needs the open song; left out of the general
//           chat's index and refused there.
//   run(a)  throws to reject (the model reads the message, then the spec);
//           returns a short factual line (Learning mode is the law: facts,
//           never a key, chord, meter or verdict). An action that edits
//           goes through askWritableGate() and lands ONE undo step.
// The registry runs without any model: runActions(items) (docs/ai-parity.md
// §7 — a cheap dispatcher model or a no-model fast path calls the same door).
const ASK_ACT_HEAD = "Do things in the app — one or several actions in ONE call, in order; it stops at the first failure and says which. Only what the user asked in THIS message, never on your own initiative. A call of only go_to/play/stop/select/open_song ends your turn: the app shows its result line. Actions (name args — what it does; ? = optional):";
const ASK_ACT_FOOT = "A rejected call's error carries that action's full text; so does help {name}. E.g. {\"do\":[{\"action\":\"go_to\",\"bar\":13},{\"action\":\"play\"}]}";
export const ASK_ACTIONS = [
  {name: "go_to", args: "bar beat?", gloss: "move the cursor there, scrolled into view", quiet: true,
   example: "Go to bar 13.", say: "Say the bar, and a beat if you mean one (\"bar 13 beat 3\").",
   spec: "go_to {bar, beat?}: moves the cursor to that bar (beat 1 unless given; fractions allowed) and brings it into view; while playing, playback restarts from there. bar counts on the ruler, beat is the counted beat of the declared meter.",
   run(a) {
     const r = askActBarBeat(a, "bar", "beat", jumpBarCap());
     jumpToTick(r.tick);
     return "cursor at " + r.label;
   }},
  {name: "play", args: "from_bar? beat?", gloss: "play from the cursor, or from a bar", quiet: true,
   example: "Play from bar 17.", say: "\"Play\" alone plays from the cursor; name a bar (and beat) to start there.",
   spec: "play {from_bar?, beat?}: starts playback from the cursor, or from from_bar (beat 1 unless given). Sound must have been unlocked by one tap on Play this session — before that it answers with that ask instead of failing silently.",
   run(a) {
     if (!S.audio) throw new Error("sound isn't unlocked yet — the browser only starts audio from a tap: tap Play once, then ask again");
     let tick = S.playCursor, label = askActPosText(tick);
     if (askActGiven(a.from_bar)) { const r = askActBarBeat(a, "from_bar", "beat", askBarsCount()); tick = r.tick; label = r.label; }
     if (S.playing) stop();
     // not awaited, like the ▶ button: play() can sit for seconds behind a console
     // render or a sampled voice still decoding (its own status lines say so),
     // and the reply is the intent — a stop in the SAME call is nonsense anyway
     play(tickToSec(S.song, tick), {fromHere: true, noCountIn: true}).catch(() => {});
     return "▶ playing from " + label;
   }},
  {name: "stop", args: "", gloss: "stop playback", quiet: true,
   example: "Stop.", say: "Just that.",
   spec: "stop {}: stops playback; the cursor stays where it stopped.",
   run() {
     const was = S.playing;
     stop();
     return (was ? "■ stopped at " : "already stopped — cursor at ") + askActPosText(S.playCursor);
   }},
  {name: "select", args: "from_bar to_bar? cycle? clear?", gloss: "ruler selection; ▶ loops it unless cycle: false", quiet: true,
   example: "Loop bars 5 to 12.", say: "Say the first and last bar; \"select\" instead of \"loop\", or \"no cycle\", marks them without looping; \"clear the selection\" drops it.",
   spec: "select {from_bar, to_bar?, cycle?, clear?}: selects whole bars on the ruler, from_bar..to_bar inclusive (to_bar omitted = that one bar). cycle defaults to true — Play loops the selection, like a drag on the ruler; cycle: false only marks the range (the context block then follows it). clear: true drops the selection.",
   run(a) {
     if (askActTruthy(a.clear)) { const had = !!S.rangeSel; S.rangeSel = null; draw(); return had ? "selection cleared" : "no selection to clear"; }
     const nBars = askBarsCount();
     const from = askActInt(a.from_bar, "from_bar", 1, nBars, nBars);
     const to = askActGiven(a.to_bar) ? askActInt(a.to_bar, "to_bar", from, nBars, nBars) : from;
     const cycle = askActGiven(a.cycle) ? askActTruthy(a.cycle) : true;
     const bt = barTicks();
     S.rangeSel = {a: (from - 1) * bt, b: to * bt, cycle};
     draw(); // drawImpl persists the selection per song (rangeSelPersist), as a ruler drag does
     return "selected bar" + (from === to ? " " + from : "s " + from + "–" + to) + (cycle ? " — ▶ loops them" : "");
   }},
  {name: "undo", args: "steps? redo?", gloss: "undo the last edit(s); redo: true redoes", quiet: false,
   example: "Undo that.", say: "\"Undo the last three\" for several; \"redo\" to redo.",
   spec: "undo {steps?, redo?}: undoes the last edit step (steps = how many, default 1) and says what each one was; redo: true redoes instead. Only on an editable song.",
   run(a) {
     const gate = askWritableGate();
     if (gate) throw new Error(gate);
     const redo = askActTruthy(a.redo);
     const steps = askActGiven(a.steps) ? askActInt(a.steps, "steps", 1, 50) : 1;
     const stack = redo ? S.editRedo : S.editUndo;
     if (!stack.length) return redo ? "nothing to redo" : "nothing to undo";
     const done = [];
     for (let i = 0; i < steps && stack.length; i++) { const e = stack[stack.length - 1]; if (redo) editRedoPop(); else editUndoPop(); done.push(askUndoDescribe(e, redo)); } // the redo stack holds INVERTED entries (invertEdit): describe them flipped back
     return (redo ? "redid: " : "undid: ") + done.join("; ") + (done.length < steps ? " (the history ended there)" : "");
   }},
  {name: "drummer", args: "from_bar to_bar|section energy? busy? hard? fills? feel? parts? follow? seed?", gloss: "run the Drummer over bars or a section label (one undo)",
   example: "Drums for bars 5 to 12, a bit less energy, following pulse1 and pulse2.", say: "Say the bars or one of your section labels, then what you want: energy 1–5 (or busy/hard apart), fills, feel, which parts, what the kick follows; \"that one again, quieter\" works because the reply names the seed.",
   spec: "drummer {from_bar, to_bar | section, energy?, busy?, hard?, fills?, feel?, parts?, follow?, seed?}: runs the app's own drum generator over those bars (to_bar inclusive) or over ONE of the user's section labels (section = its exact text) and replaces that range's drum hits as one undo step — the way to do ANY drum request, never hand-written notes. energy 1–5 sets busy and hard together (default 3); busy/hard 1–5 apart; fills 0–5 (0 = none, default 3); feel normal|half|double; parts = a list of kick, snare, hats, fills to reroll only those; follow = track names the kick listens to (e.g. [\"pulse1\",\"pulse2\"]), or [\"chords\"] or [\"off\"] (default the bass); seed = same seed, same take (the reply names it). Only when the user asks; own editable songs only (refuses on a locked/capture song).",
   run(a) { return askDrummer(a).note; }},
  {name: "open_song", args: "song then?", gloss: "open another song — the chat moves there; put it LAST", quiet: true, song: false,
   example: "Open Graveyard and play it from bar 9.", say: "Name the song (its title, file name or path); whatever you asked for after that is sent again in that song's chat, in your words. If two songs share the name it asks which.",
   spec: "open_song {song, then?}: opens that song — song is a title, file name or path from the catalog or this device's drafts; an ambiguous name is an error listing the matches, never a guess — the way File → Open Recent does, AFTER this reply has landed; the chat then moves to that song's own history with a ↪ line naming where it came from. then = the rest of the user's request in THEIR words (\"play it from bar 9\"), sent as their next message in the new song's chat, where its notes are in view. It must be the LAST item of the call: nothing after it runs, and nothing else in this reply may touch the song being left. Opening is not editing — a locked or capture song opens fine (its edits refuse there as usual).",
   run(a) { return askOpenSongQueue(a); }},
  // ---- the twelve standalone tools of 2026-09-26…10-02, folded in 2026-10-05
  // (docs/ai-parity.md §5 batch 3): the same functions in src/ask/tools.js,
  // the same gates and undo steps; only the schema went. Their rule texts
  // live in `spec` now — sent on help and in a rejected call's error.
  {name: "add_annotation", args: "kind text bar beat end_bar? end_beat? comment?", gloss: "write one annotation in the user's words",
   example: "Put an F#m chord on bar 21.", say: "Say the kind (chord, section, key, tempo, loop, meter, chop, note), the text in your words, the bar and beat.",
   spec: "add_annotation {kind, text, bar, beat, end_bar?, end_beat?, comment?}: writes ONE annotation at bar.beat exactly as the user asked — kind chord (a symbol: F#m, G7/B), section (a form label: Intro, A, B'), key (F#m, Bb, A#/Bb? for tonic-only), tempo (bpm), loop (the return point as bar.beat, placed at the jump point), meter (3/4), chop (start or end), note (plain prose); text in the user's words; end_bar/end_beat make it span; comment is a note attached to it. Only when the user explicitly asks to annotate, mark, label or write something. It lands as added (unsynced) on this device; Publish sends it, and the Publish sheet can discard it.",
   run(a) { const r = askAddAnnotation(a); return "written " + r.at + " " + r.text.split("\n")[0] + " — on this device until Publish (the Publish sheet can discard it)"; }},
  {name: "edit_annotation", args: "id|bar beat match_text? text comment? new_bar? new_beat? new_end_bar? new_end_beat?", gloss: "change an existing annotation's text or place",
   example: "Change the chord at 14.1 to G7.", say: "Say which one (its bar and beat, or its text) and the new text or place.",
   spec: "edit_annotation {id | bar, beat, match_text?; text, comment?, new_bar?, new_beat?, new_end_bar?, new_end_beat?}: changes an EXISTING annotation's text (and, if asked, where it sits) — never a duplicate beside it. Target it by id exactly as this turn's context block lists it (stale after an earlier edit in the SAME reply re-sorts them — then use bar+beat), or by its current bar and beat (+ match_text when more than one annotation shares that spot); an ambiguous target is an error, never a guess. text = the new symbol, label, key, bpm, bar.beat or prose in the user's words; comment replaces the attached note (omit to keep it). Only when the user explicitly asks to edit, change, rename, move or correct one. Structural directives (meter, chop, track, audio, lane) are the editor's.",
   run(a) { const r = askEditAnnotation(a); return "edited in place: " + r.at + " " + r.text.split("\n")[0]; }},
  {name: "delete_annotation", args: "id|bar beat match_text?", gloss: "remove one existing annotation",
   example: "Delete the note at bar 16.", say: "Say which one — bar and beat, plus its text if two share the spot.",
   spec: "delete_annotation {id | bar, beat, match_text?}: removes ONE existing annotation — by id from this turn's context block, or by its current bar and beat (+ match_text when more than one shares the spot); an ambiguous target is an error, never a guess. Only when the user explicitly asks to delete, remove or take back one. A meter or chop the user dictated goes the same way; track/audio/lane directives are the editor's.",
   run(a) { const r = askDeleteAnnotation(a); return "deleted " + r.at + " " + r.text; }},
  {name: "publish_song", args: "", gloss: "publish the open song (the footer's Publish)",
   example: "Publish.", say: "Just that; it runs the footer's Publish and reports what happened.",
   spec: "publish_song {}: publishes the open song — the same Publish the footer button runs (song + annotations for the user's own song, annotations only for a locked capture). Only when the user explicitly says to publish. Refuses, saying why, when the device isn't connected (no GitHub token, no folder) or nothing here can be published.",
   async run() { return (await askPublishSong()).message; }},
  {name: "list_songs", args: "", gloss: "the songs here: albums, titles, paths", song: false,
   example: "What songs are there?", say: "It lists albums, titles and paths — the ones on this device too.",
   spec: "list_songs {}: lists every song in this Night Roll — album by album, title and path — plus the songs that exist only on this device. Use it when the user names a song you can't place; read_song / read_notes / open_song take the path or the title.",
   run() { return askListSongs(); }},
  {name: "read_song", args: "path from_bar? to_bar?", gloss: "read another song's notes (optional bar range)", song: false,
   example: "Compare this to Ambush.", say: "Name the other song; add bars (\"bars 1 to 8 of Ambush\") to keep it short.",
   spec: "read_song {path, from_bar?, to_bar?}: reads another song's notes (a title or path; an ambiguous name errors with the candidates) in the same text format as the context block, a bar range optional, capped at 6000 characters. Only when the user asks about another song; then answer under THE RULE as usual.",
   run(a) { return askReadSong(a); }},
  {name: "read_notes", args: "path", gloss: "read another song's annotations", song: false,
   example: "What did I write in Graveyard's notes?", say: "Name the song.",
   spec: "read_notes {path}: reads another song's saved annotations (the user's own analysis of it) as \"[bar.beat - bar.beat] kind: value — note\" lines. Only when the user asks about another song.",
   run(a) { return askReadNotes(a); }},
  {name: "read_bars", args: "from_bar to_bar? tracks?", gloss: "read more bars of THIS song, live state",
   example: "What's on the triangle in bars 40 to 48?", say: "Say the bars, and tracks if you want fewer.",
   spec: "read_bars {from_bar, to_bar?, tracks?}: reads bars of the OPEN song beyond what the context block's window shows — the same compact note rows, from LIVE app state (unsaved edits included); tracks limits it to those tracks by number (\"1\") or name. Ask for this instead of guessing what an out-of-view bar holds, or saying you cannot see it; a bar shown as \"as sent earlier\" you already have from this chat. The span is capped at 32 bars; a truncated reply says where to continue from.",
   run(a) { if (askActGiven(a.tracks)) { a.tracks = askActJSON(a.tracks); if (typeof a.tracks === "string") a.tracks = a.tracks.split(/\s*,\s*/).filter(Boolean); } return askReadBars(a); }},
  {name: "write_notes", args: "track notes[{pitch bar beat dur_beats vel?}] replace{from_bar from_beat? to_bar? to_beat?}?", gloss: "write dictated notes on a named track (one undo)",
   example: "On pulse 2, write C5 at bar 3 beat 1, an eighth, then D5 on beat 1.5.", say: "Say the track, then every note: pitch, bar, beat, length (a \"gallop\" must be spelled out as its three notes).",
   spec: "write_notes {track, notes: [{pitch, bar, beat, dur_beats, vel?}], replace?: {from_bar, from_beat?, to_bar?, to_beat?}}: writes the notes the user dictated onto an EXISTING track named as they said it (matched against this song's own track names — never the one selected in the app; an unknown or ambiguous name is an error naming the song's tracks). Spell out every note yourself: pitch like C4 / F#3 / Bb2 (C4 = middle C) or a MIDI number, the ruler's bar, the counted beat (fractions allowed), dur_beats > 0, vel 1–127 optional — a shorthand like \"gallop\" means nothing here (it is an eighth plus two sixteenths: write all three). replace first removes that range's existing notes (by onset) on the same track. Only when the user explicitly asks to write, insert, add or fill in notes — never a chord, key or note of your own choosing. Every note is validated before anything is written (one bad note, nothing lands); up to 256 notes a call; never on a drum track; one undo step; own editable songs only (refuses on a locked/capture song, naming ✎ Edit).",
   run(a) {
     a.notes = askActJSON(a.notes); a.replace = askActJSON(a.replace);
     const num = v => (typeof v === "string" && v.trim() !== "" && Number.isFinite(+v) ? +v : v); // a local model's "3" for 3 (the validator stays strict about everything else)
     if (Array.isArray(a.notes)) a.notes = a.notes.map(n => n && typeof n === "object" ? {...n, bar: num(n.bar), beat: num(n.beat), dur_beats: num(n.dur_beats), ...(askActGiven(n.vel) ? {vel: num(n.vel)} : {})} : n);
     return askWriteNotes(a).note;
   }},
  {name: "copy_bars", args: "from_bar to_bar at_bar", gloss: "repeat bars: open a gap, copy the music into it (one undo)",
   example: "Repeat bars 5 and 6 right after themselves.", say: "Say the bars to copy and where the copy lands.",
   spec: "copy_bars {from_bar, to_bar, at_bar}: repeats, duplicates or copies bars that already exist — inserts (to_bar − from_bar + 1) bars at at_bar on EVERY track (the same shift as Edit ▾ → Insert bars…: every later note AND annotation slides later), then copies bars from_bar..to_bar (every track, drums included) into the gap; to repeat bars 5–6 right after themselves, at_bar is 7. The way to repeat existing music — never a hand-spelled write_notes. Annotations inside the copied range are never duplicated (the user's own analysis), only shifted. Only when the user explicitly asks; one undo step; own editable songs only.",
   run(a) { return askCopyBars(a).note; }},
  {name: "insert_bars", args: "at_bar count", gloss: "insert empty bars; everything later slides right (one undo)",
   example: "Insert two empty bars at bar 9.", say: "Say where, and how many.",
   spec: "insert_bars {at_bar, count}: inserts count empty bars at at_bar — the same operation as Edit ▾ → Insert bars…: every later note AND annotation (sections, chords, loop, key/tempo/meter) slides later to make room. For repeating music that exists, copy_bars instead. Only when the user explicitly asks; one undo step; own editable songs only.",
   run(a) { return askInsertBars(a).note; }},
  {name: "delete_bars", args: "from_bar count", gloss: "delete bars; everything later slides left (one undo)",
   example: "Delete bars 30 to 32.", say: "Say the first bar and how many (or the last bar).",
   spec: "delete_bars {from_bar, count}: removes count bars starting at from_bar on EVERY track — the inverse of insert_bars (Edit ▾ → Delete bars…): a note starting inside is deleted, one sustaining across the cut is clipped there, and everything after slides earlier to close the gap, annotations too; an annotation anchored inside the span moves to the cut point, one straddling it shrinks — none is destroyed. Only when the user explicitly asks to delete or remove bars; one undo step; own editable songs only.",
   run(a) { return askDeleteBars(a).note; }},
  {name: "help", args: "name?", gloss: "the action list, or one action's full text", song: false,
   example: "What can you do?", say: "That lists them; \"help with drummer\" gives one action's details.",
   spec: "help {name?}: without name, the index of every action available in this chat; with one, that action's full text (args, rules, what it answers).",
   run(a) { const n = [a.name, a.about, a.action, a.topic].find(askActGiven); return askActGiven(n) ? askActSpec(n) : askActIndex(!!S.askGeneral) + "\nhelp {name} gives one action's full text."; }},
];
export function askActList(general) { // the registry in index order (by name — stable across sessions and songs); the general chat gets only what needs no open song
  return ASK_ACTIONS.filter(d => !general || d.song === false).slice().sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
}
export function askActFind(name, general) { const n = String(name === undefined || name === null ? "" : name).trim().toLowerCase(); return askActList(general).find(d => d.name === n) || null; }
export function askActOffered(name) { return askActList(!!S.askGeneral).some(d => d.name === String(name)); } // is this action in the open chat's index? (the tests' question; what ASK_SONG_ONLY_TOOLS answered before batch 3)
export function askActIndex(general) { return askActList(general).map(d => d.name + (d.args ? " " + d.args : "") + " — " + d.gloss).join("\n"); }
export function askActSpec(name) {
  const d = askActFind(name, false);
  if (!d) return "no action named \"" + name + "\" — actions:\n" + askActIndex(!!S.askGeneral);
  return d.spec + (d.quiet ? " Quiet: its result line is the whole reply." : "");
}
export function askActTool(general) { // the ONE declaration: fixed header, the index, fixed footer — nothing per-message in it; null when the variant has no actions
  if (!askActList(general).length) return null;
  return {type: "function", function: {name: "act", description: ASK_ACT_HEAD + "\n" + askActIndex(general) + "\n" + ASK_ACT_FOOT,
    parameters: {type: "object", properties: {do: {type: "array", description: "the actions, in order; each item is {action, ...its args}",
      items: {type: "object", properties: {action: {type: "string"}}, required: ["action"]}}}, required: ["do"]}}};
}
// ---- the call, as a model (or anything else) sends it. Forgiving on
// purpose (Josh via Ask #443: LM Studio / Ollama models emit sloppier JSON
// and have small windows — the error, not a refusal, is where they learn):
// a JSON string where an object or list was meant; one item where a list
// was; a list nested one deep where one item was; args under args /
// arguments / params / input, or flat beside action, or a one-item list; an
// item that is a bare action name. Each tolerance has a test.
export function askActJSON(v) { // a JSON string where a value was meant → the value; anything else as it came
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!/^[[{]/.test(t)) return v;
  try { return JSON.parse(t); } catch (err) { return v; }
}
export function askActItems(input) { // → [{action, args}], or throws naming the shape wanted
  const shape = "send {\"do\": [{\"action\": \"<name>\", ...its args}]}";
  const parsed = askActJSON(input);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed._parse_error) throw new Error("the call's arguments weren't valid JSON (" + parsed._parse_error + ") — " + shape);
  let list = parsed;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (parsed.do !== undefined) list = askActJSON(parsed.do);
    else if (parsed.actions !== undefined) list = askActJSON(parsed.actions);
    else list = Object.keys(parsed).length ? [parsed] : [];
  }
  if (typeof list === "string") list = [list];
  if (!Array.isArray(list)) list = list && typeof list === "object" ? [list] : [];
  list = list.flat(Infinity).map(askActJSON);
  if (!list.length) throw new Error("nothing to do — " + shape);
  const ARGKEYS = ["args", "arguments", "params", "parameters", "input"];
  return list.map((it, i) => {
    if (typeof it === "string") it = {action: it};
    if (!it || typeof it !== "object" || Array.isArray(it)) throw new Error("item " + (i + 1) + " isn't an action: " + JSON.stringify(it) + " — " + shape);
    const nameKey = ["action", "name", "tool"].find(k => askActGiven(it[k])); // name/tool stand in for action only when action is absent — help's own `name` arg must survive
    const action = nameKey ? String(it[nameKey]).trim() : "";
    if (!action) throw new Error("item " + (i + 1) + " names no action: " + JSON.stringify(it) + " — " + shape);
    const args = {};
    for (const k of ARGKEYS) if (it[k] !== undefined) {
      const v = askActJSON(it[k]);
      if (Array.isArray(v)) { if (v.length === 1 && v[0] && typeof v[0] === "object") Object.assign(args, v[0]); }
      else if (v && typeof v === "object") Object.assign(args, v);
    }
    for (const [k, v] of Object.entries(it)) if (k !== nameKey && !ARGKEYS.includes(k)) args[k] = v;
    return {action, args};
  });
}
// ---- open_song's first half (docs/ai-parity.md §4): find the song, remember
// the switch, answer — and open NOTHING here. The AI library runs tool rounds
// inside one exchange and stores the whole reply under the chat it started
// in; a switch mid-reply would read the new song's context into the old
// song's chat. askLanded (src/ask/client.js) runs the second half once the
// reply has landed. The lookup is askSongPath's (catalog + this device's
// drafts, an ambiguous name errors with the candidates — never a guess).
export function askOpenSongQueue(a) {
  if (LINK_SONGS) throw new Error("this song is being viewed from a link to another repo — open_song only opens songs from this Night Roll's own list");
  if (S.askTerminal) throw new Error("the Terminal tab goes to Claude Code on the Mac — nothing opens from here");
  if (S.songLoading) throw new Error("still opening the last song — ask again when it's in");
  if (S.askHopKey && S.askHopKey === askStoreKey()) throw new Error("a carried-over request can't open another song — ask for that yourself in this chat");
  if (S.askSwitch) throw new Error("the song is changing — ask again in " + S.askSwitch.title + "'s chat");
  const path = askSongPath([a.song, a.path, a.title, a.name].find(askActGiven));
  const title = songTitleOf(path);
  const then = askActGiven(a.then) ? String(a.then).trim() : "";
  if (path === S.songKey && !S.askGeneral && !then) return title + " is already open";
  const from = askStoreKey();
  const inFlight = askStore(from).msgs.filter(m => m.role === "user" && m.pending).pop(); // the message that asked, as the user typed it — the ↪ line quotes it
  S.askSwitch = {path, title, then, from, fromTitle: S.askGeneral ? "the general chat" : songTitleOf(S.songKey || ""), said: inFlight ? askShotDisplayText(inFlight.content) : "", t: Date.now()};
  const notes = [];
  if (path === S.songKey) notes.push("already open");
  if (S.albumRun && path !== S.songKey) notes.push("the album run ends");
  if (S.songKey && path !== S.songKey && draftDirtyState(S.songKey)) notes.push(songTitleOf(S.songKey) + "'s changes are kept on this device (not published)");
  return "opening " + title + (notes.length ? " — " + notes.join("; ") : "") + (then ? " · then: " + then : "");
}
export async function runActions(items, general) { // the model-free door: [{action, args}] in order, stopping at the first failure → {lines, quiet, failed}
  const lines = [];
  let quiet = true;
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const def = askActFind(it.action, false);
    const fail = (message, unknown) => ({lines, quiet: false, failed: {step: i + 1, action: String(it.action), message, unknown: !!unknown}});
    if (!def) return fail("no action named \"" + it.action + "\"", true);
    if (S.askSwitch && def.name !== "open_song") return fail("the song is changing — ask again in " + S.askSwitch.title + "'s chat"); // open_song ran (in this call or earlier in this reply): it is the last thing that happens here (docs/ai-parity.md §4)
    if (def.song !== false && general) return fail("\"" + def.name + "\" works in a song's ♪ chat, not here");
    if (def.song !== false && !S.song) return fail("no song open");
    try { lines.push(String(await def.run(it.args || {}))); } catch (err) { return fail(String(err && err.message || err)); }
    if (!def.quiet) quiet = false;
  }
  return {lines, quiet, failed: null};
}
export async function askAct(input) { // the tool entry (askRunTool "act"): normalize, run, word the outcome for the model
  const general = !!S.askGeneral;
  let items;
  try { items = askActItems(input); } catch (err) { throw new Error(err.message + "\nactions:\n" + askActIndex(general)); }
  const r = await runActions(items, general);
  const done = r.lines.map((l, i) => (items.length > 1 ? (i + 1) + ". " : "") + l);
  if (r.failed) {
    const f = r.failed;
    throw new Error((items.length > 1 ? "step " + f.step + " (" + f.action + ") failed: " : "") + f.message +
      (done.length ? "\ndone before it: " + done.join("; ") : "") +
      "\n\n" + (f.unknown ? "actions:\n" + askActIndex(general) : askActSpec(f.action)));
  }
  const text = done.join("\n");
  return r.quiet ? {final: text} : text; // {final}: the AI library ends the exchange with this text, no second model round
}
// ---- shared validation: every message names the bad arg and the range,
// nothing runs until every arg of the item is good
export function askActGiven(v) { return v !== undefined && v !== null && v !== ""; }
export function askActTruthy(v) { return v === true || v === 1 || /^(true|yes|on|1)$/i.test(String(v === undefined || v === null ? "" : v).trim()); }
export function askActInt(v, name, lo, hi, nBars) {
  const n = Math.round(+v);
  if (!Number.isFinite(+v) || String(v).trim() === "" || n < lo || n > hi) throw new Error(name + " must be a whole number " + lo + "–" + hi + (nBars ? " (this song has " + nBars + " bar" + (nBars === 1 ? "" : "s") + ")" : ""));
  return n;
}
export function askActBarBeat(a, barKey, beatKey, cap) { // → {bar, beat, tick, label} — ruler bar, counted beat of the declared meter
  const nBars = askBarsCount();
  const bar = askActInt(a[barKey], barKey, 1, cap, nBars);
  const beats = beatsPerBarDisp();
  let beat = 1;
  if (askActGiven(a[beatKey])) { beat = +a[beatKey]; if (!(beat >= 1 && beat < beats + 1)) throw new Error(beatKey + " must be ≥ 1 and < " + (beats + 1) + " (" + beats + " beats per bar)"); }
  const tick = Math.round((bar - 1) * barTicks() + (beat - 1) * beatTicks());
  return {bar, beat, tick, label: bar + "." + askActBeatText(beat)};
}
export function askActBeatText(q) { return (Math.round(q * 100) / 100).toString(); }
export function askActPosText(tick) { // "13.1" for a tick, the ruler's own bar.beat
  const bt = barTicks(), qt = beatTicks();
  const bar = Math.floor(tick / bt) + 1, beat = (tick - (bar - 1) * bt) / qt + 1;
  return bar + "." + askActBeatText(beat);
}
export function askUndoDescribe(e, flipped) { // what an undo entry did, by counting its leaves — "12 notes added, 3 changed"; flipped = the entry is an invertEdit of the edit (the redo stack), so added and erased trade places
  const c = {added: 0, erased: 0, changed: 0}, other = [];
  const walk = v => {
    if (!v) return;
    if (v.kind === "group") { (v.entries || []).forEach(walk); return; }
    if (v.kind === "add") c.added++;
    else if (v.kind === "erase") c.erased++;
    else if (v.kind === "addBatch") c.added += (v.items || []).length;
    else if (v.kind === "eraseBatch") c.erased += (v.items || []).length;
    else if (v.kind === "mod") c.changed += (v.items || []).length;
    else if (v.kind === "anno") other.push("the annotation layer");
    else if (v.kind === "trackRemove") other.push("a track removed");
    else if (v.kind === "trackInsert") other.push("a track added");
    else if (v.kind === "trackReorder") other.push("tracks reordered");
    else other.push(String(v.kind));
  };
  walk(e);
  if (flipped) [c.added, c.erased] = [c.erased, c.added];
  const n = (k, word) => k + " note" + (k === 1 ? "" : "s") + " " + word;
  const parts = [];
  if (c.added) parts.push(n(c.added, "added"));
  if (c.erased) parts.push(n(c.erased, "erased"));
  if (c.changed) parts.push(n(c.changed, "changed"));
  parts.push(...new Set(other));
  return parts.join(", ") || "an edit";
}
// ---- the Help sheet's "AI commands" rows (Josh via Ask #451): generated
// from the registry so the sheet never drifts from what Ask can do. tools/
// build_ask_help.mjs writes this between help/help.html's ask-commands
// markers; a vm test compares the file against this function.
export function askHelpCommandsHTML() {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = [];
  rows.push("<dt>AI commands</dt><dd>Everything you can tell Ask, one row each — a phrase that works, then how to phrase your own. Several at once run in order (\"go to bar 13 and play\"); a quick one (go to, play, stop, select) answers with its one line and nothing more. Ask only ever does what you asked in that message. Generated from the app's own action list, so this is exactly what it can do today.</dd>");
  for (const d of askActList(false)) rows.push("<dt>Ask: " + esc(d.gloss) + "</dt><dd><b>“" + esc(d.example) + "”</b> " + esc(d.say) + " <i>(act: " + esc(d.name + (d.args ? " " + d.args : "")) + ")</i></dd>");
  return rows.join("\n      ");
}

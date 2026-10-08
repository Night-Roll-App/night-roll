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
import { editorFollowSelection } from "../ui/note-editor.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { askWritableGate } from "./tools.js";
import { askBarsCount } from "./tools.js";
import { askDrummer } from "./tools.js";
import { askBassist } from "./tools.js";
import { askEditNotes } from "./tools.js";
import { askAddAnnotation } from "./tools.js";
import { askEditAnnotation } from "./tools.js";
import { askDeleteAnnotation } from "./tools.js";
import { askSongNote } from "./tools.js";
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
import { askSetTrack } from "./tools.js";
import { askAddTrack } from "./tools.js";
import { askDeleteTrack } from "./tools.js";
import { askKeepThat } from "./tools.js";
import { askAlbum } from "./tools.js";
import { askSongFile } from "./tools.js";
import { askSetPref } from "./tools.js";
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
     if (askActTruthy(a.clear)) { const had = !!S.rangeSel; S.rangeSel = null; editorFollowSelection(); draw(); return had ? "selection cleared" : "no selection to clear"; }
     const nBars = askBarsCount();
     const from = askActInt(a.from_bar, "from_bar", 1, nBars, nBars);
     const to = askActGiven(a.to_bar) ? askActInt(a.to_bar, "to_bar", from, nBars, nBars) : from;
     const cycle = askActGiven(a.cycle) ? askActTruthy(a.cycle) : true;
     const bt = barTicks();
     S.rangeSel = {a: (from - 1) * bt, b: to * bt, cycle};
     editorFollowSelection(); // a docked annotation window follows it, as it follows a ruler drag
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
  {name: "edit_notes", args: "op from_bar to_bar|section tracks + op's own", gloss: "bulk-edit existing notes over bars + tracks (one undo): delete quantize velocity split join divide dedupe transpose move copy to_track shape",
   example: "Delete the notes on pulse 1 in bars 5 and 6.", say: "Say the op, the bars (or a section label) and the track(s) by name. Delete, quantize (grid \"1/16\", strength — default a hard snap), velocity (vel: 80, or +10/-10), split (at_bar/at_beat, else in half), join, divide (into: N), dedupe; \"move bars 9 to 12 on pulse 2 up an octave\" (transpose: semitones and/or octaves, or scale_steps in your declared key — no key declared, no in-key move); \"move it two beats later\" (move: bars/beats, negative = earlier); \"copy the pulse 1 line in bar 3 to pulse 2, an octave down\" (copy: at_bar, at_beat, to_track, semitones/octaves; labels: true brings the chord, section and text annotations over those bars along, chord labels shifted with the notes, as Paste to… does); to_track (move them onto another track); shape (the loudness inside each held note, no new attack: shape swell, fade, swell_fade or flat — flat clears it — or points [[beats after the note starts, level 0–127]…]).",
   spec: "edit_notes {op, from_bar, to_bar | section, tracks, …}: bulk-edits notes already written on named tracks (never the track selected in the app — an unknown or ambiguous name is an error naming the song's own tracks) over from_bar..to_bar inclusive, or ONE declared section label's span, as ONE undo step for the whole call. op is delete (removes them); quantize (snaps onsets to a grid — grid like \"1/16\", default the song's own current grid; strength 0–1 or a percent like \"75%\", default 1 = a hard snap; ends: true also resizes to match the quantized end); velocity (vel: an absolute 1–127, or relative +10/-10); split (at_bar/at_beat cuts any note spanning that point, else every note in the selection splits in half); join (merges same-pitch notes on the same track that touch or overlap into one); divide (into: 2 or more — each note becomes that many equal notes); dedupe (removes exact duplicate onsets in the range, keeping the longer one); transpose (semitones and/or octaves: a chromatic shift, refused if a note would leave the roll; or scale_steps — a whole number of steps in the key the USER declared, octaves may join it as 7 steps each; with no declared key over those notes it errors \"no key declared\" and does nothing — never estimate one, never name one; drum/noise tracks don't transpose); move (bars and/or beats, negative = earlier; refused if a note would land before the song's start; a note dragged past the end grows the song); copy (at_bar where the copy starts, at_beat default 1, to_track default each note's own track, semitones/octaves shift the copy; labels: true also copies the chord, section and text annotations spanning the bars, chord labels transposed by the same shift, and nothing else rides by default — exactly Paste to…: a note already there is skipped, one shifted off the roll is dropped, a destination past the song's end grows it, the user's clipboard is untouched, the cursor lands at the copy's end); to_track (to_track: move them onto that track, pitches kept; an audio track is refused); shape (a volume shape INSIDE each held note — velocity stays the attack, the level glides through the points on one sound, the last held to the end; shape: swell (rises to the end), fade (falls to a quarter), swell_fade (rises to the middle, falls to half), flat (clears the shape and any decay target) — each scaled to the note's length; or points: [[beats after the note starts, level 0–127]…] for exact values; levels are stored relative to velocity, so a later velocity change rescales them; describe points as numbers, never name the gesture with a musical term the user has not used). Only when the user explicitly asks; own editable songs only (refuses on a locked/capture song) — except copy: on a song whose notes are locked (a capture, a starter) copy still copies the chord, section and text annotations spanning the bars to at_bar (tracks optional, labels implied), never notes, one undo — copying a section's labels into its repeat.",
   run(a) { return askEditNotes(a).note; }},
  {name: "drummer", args: "from_bar to_bar|section energy? busy? hard? fills? feel? parts? follow? seed?", gloss: "run the Drummer over bars or a section label (one undo)",
   example: "Drums for bars 5 to 12, a bit less energy, following pulse1 and pulse2.", say: "Say the bars or one of your section labels, then what you want: energy 1–5 (or busy/hard apart), fills, feel, which parts, what the kick follows; \"that one again, quieter\" works because the reply names the seed.",
   spec: "drummer {from_bar, to_bar | section, energy?, busy?, hard?, fills?, feel?, parts?, follow?, seed?}: runs the app's own drum generator over those bars (to_bar inclusive) or over ONE of the user's section labels (section = its exact text) and replaces that range's drum hits as one undo step — the way to do ANY drum request, never hand-written notes. energy 1–5 sets busy and hard together (default 3); busy/hard 1–5 apart; fills 0–5 (0 = none, default 3); feel normal|half|double; parts = a list of kick, snare, hats, fills to reroll only those; follow = track names the kick listens to (e.g. [\"pulse1\",\"pulse2\"]), or [\"chords\"] or [\"off\"] (default the bass); seed = same seed, same take (the reply names it). Only when the user asks; own editable songs only (refuses on a locked/capture song).",
   run(a) { return askDrummer(a).note; }},
  {name: "bassist", args: "from_bar to_bar|section track? style? busy? octave? follow? seed?", gloss: "run the Bassist over bars or a section label (one undo)",
   example: "Bass line for bars 1 to 16, busy 2, follow the drums.", say: "Say the bars or one of your section labels, then what you want: style (chug, pump, arp, walk, riff), busy 1–5, octave 1–3, what it follows (drums, chords, or a track name); name a track to pick where the bass goes, else it uses your bass track or makes one. \"that one again, quieter\" works because the reply names the seed.",
   spec: "bassist {from_bar, to_bar | section, track?, style?, busy?, octave?, follow?, seed?}: runs the app's own bass generator (the Bassist sheet) over those bars (to_bar inclusive) or over ONE of the user's section labels (section = its exact text) and replaces that range's notes on the bass track as one undo step — the way to do ANY bass-line request, never hand-written notes. track = an existing track by name, or \"new\" for a fresh one; omitted picks the song's detected bass track when nothing of its own sounds in that range already, else makes a new one. style chug|pump|arp|walk|riff (default riff when the song has a drum track, else chug). busy 1–5 (default 3); octave 1–3 (default 2). follow = auto (default), chords, drums, or a track name — what supplies the line's rhythmic cue (pitch always comes from the chord/key ladder below, never from what it follows). seed = same seed, same take (the reply names it). Reads the song's own chord-band annotations where present; where none exist it sketches harmony internally from the melody — that sketch is never shown, written or named in the reply (Learning mode is the law: it states only what it replaced and the seed, never a chord or key it inferred). Only when the user asks; own editable songs only (refuses on a locked/capture song).",
   run(a) { return askBassist(a).note; }},
  {name: "open_song", args: "song then?", gloss: "open another song — the chat moves there; put it LAST", quiet: true, song: false,
   example: "Open Graveyard and play it from bar 9.", say: "Name the song (its title, file name or path); whatever you asked for after that is sent again in that song's chat, in your words. If two songs share the name it asks which.",
   spec: "open_song {song, then?}: opens that song — song is a title, file name or path from the catalog or this device's drafts; an ambiguous name is an error listing the matches, never a guess — the way File → Open Recent does, AFTER this reply has landed; the chat then moves to that song's own history with a ↪ line naming where it came from. then = the rest of the user's request in THEIR words (\"play it from bar 9\"), sent as their next message in the new song's chat, where its notes are in view. It must be the LAST item of the call: nothing after it runs, and nothing else in this reply may touch the song being left. Opening is not editing — a locked or capture song opens fine (its edits refuse there as usual).",
   run(a) { return askOpenSongQueue(a); }},
  // ---- the twelve standalone tools of 2026-09-26…10-02, folded in 2026-10-05
  // (docs/ai-parity.md §5 batch 3): the same functions in src/ask/tools.js,
  // the same gates and undo steps; only the schema went. Their rule texts
  // live in `spec` now — sent on help and in a rejected call's error.
  {name: "add_annotation", args: "kind text bar beat end_bar? end_beat? comment? roman? no5?", gloss: "write one annotation in the user's words",
   example: "Put an F#m chord on bar 21.", say: "Say the kind (chord, section, key, tempo, loop, meter, chop, note), the text in your words, the bar and beat.",
   spec: "add_annotation {kind, text, bar, beat, end_bar?, end_beat?, comment?, roman?, no5?}: writes ONE annotation at bar.beat exactly as the user asked — kind chord (a symbol: F#m, G7/B), section (a form label: Intro, A, B'), key (F#m, Bb, A#/Bb? for tonic-only), tempo (bpm), loop (the return point as bar.beat, placed at the jump point), meter (3/4), chop (start or end), note (plain prose); text in the user's words; end_bar/end_beat make it span; comment is a note attached to it; on a chord, roman = the Roman numeral the user dictated, exactly as said (bVII, vi, ii°, V7, V/V), and no5: true = their “no fifth” mark — never a numeral or a no-fifth of your own, never worked out from the notes or a key; leave both out unless the user said them. Only when the user explicitly asks to annotate, mark, label or write something.",
   run(a) { const r = askAddAnnotation(a); return "written " + r.at + " " + r.text.split("\n")[0] + " — on this device until Publish (the Publish sheet can discard it)"; }},
  {name: "edit_annotation", args: "id|bar beat match_text? text comment? roman? no5? new_bar? new_beat? new_end_bar? new_end_beat?", gloss: "change an existing annotation's text or place",
   example: "Change the chord at 14.1 to G7.", say: "Say which one (its bar and beat, or its text) and the new text or place.",
   spec: "edit_annotation {id | bar, beat, match_text?; text, comment?, roman?, no5?, new_bar?, new_beat?, new_end_bar?, new_end_beat?}: changes an EXISTING annotation's text (and, if asked, where it sits) — never a duplicate beside it. Target it by id exactly as this turn's context block lists it (stale after an earlier edit in the SAME reply re-sorts them — then use bar+beat), or by its current bar and beat (+ match_text when more than one annotation shares that spot); an ambiguous target is an error, never a guess. text = the new symbol, label, key, bpm, bar.beat or prose in the user's words (on a chord it may be left out when only roman or no5 changes); comment replaces the attached note (omit to keep it); on a chord, roman replaces its Roman numeral with the one the user dictated (an empty string clears it; omit to keep it) and no5 true/false sets or clears their “no fifth” mark (omit to keep it) — never one of your own. Only when the user explicitly asks to edit, change, rename, move or correct one. Structural directives (meter, chop, track, audio, lane) are the editor's.",
   run(a) { const r = askEditAnnotation(a); return "edited in place: " + r.at + " " + r.text.split("\n")[0]; }},
  {name: "delete_annotation", args: "id|bar beat match_text?", gloss: "remove one existing annotation",
   example: "Delete the note at bar 16.", say: "Say which one — bar and beat, plus its text if two share the spot.",
   spec: "delete_annotation {id | bar, beat, match_text?}: removes ONE existing annotation — by id from this turn's context block, or by its current bar and beat (+ match_text when more than one shares the spot); an ambiguous target is an error, never a guess. Only when the user explicitly asks to delete, remove or take back one. A meter or chop the user dictated goes the same way; track/audio/lane directives are the editor's.",
   run(a) { const r = askDeleteAnnotation(a); return "deleted " + r.at + " " + r.text; }},
  {name: "song_note", args: "op title new_title? text? kind?", gloss: "add|edit|delete a titled song note (general or open question)",
   example: "Add a song note called Sway: long-short-long is the strongest, see bars 5 and 12.", say: "Say add, edit or delete, the note's title, and its words; \"rename Sway to Lilt\" changes the title; \"as an open question\" (or \"mark Sway as an open question\") makes it one.",
   spec: "song_note {op, title, new_title?, text?, kind?}: the user's song notes — titled ideas about the whole song, not tied to a bar (the context lists each as \"songnote: Title — body\"). add: a new one, title short and unique in this song (a title already used is an error), text = the body in the user's words. kind: \"general\" (the default) or \"question\" — an open question the user still has to solve (the context lists those as \"songnote (question): Title — body\"). edit: finds it by title (any case) and replaces the body with text, the title with new_title and/or the kind with kind (\"mark Sway as an open question\", \"Sway is answered, make it general\"); what isn't given is kept. Asked for the open questions, list those titles and bodies as written — never answer one, hint at an answer or rank them unless the user asks you to work on that question. delete: removes it. One undo step. Only when the user explicitly asks, never a note of your own; refuses on a song viewed from a link or locked by a newer Night Roll.",
   run(a) { return askSongNote(a).note; }},
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
  // ---- set_track / add_track / delete_track / keep_that / album (docs/
  // ai-parity.md §5 batch 7, 2026-10-05): tracks and albums. set_track lands
  // every setting through saveTrackDir, the SAME "track:" annotation the
  // mixer fader, M/S/H chips and voice menu already write — never
  // localStorage; add/delete_track are the ＋ chip and the voice menu's ✕
  // Delete track, compositions only (a local draft can reconfigure a track
  // through set_track but not grow or shrink the song's track count).
  {name: "set_track", args: "track mute? solo? hide? volume? pan? voice? patch? color? name? octave?", gloss: "mute, solo, hide, volume, pan, voice or patch, color, rename or octave-shift a track (one undo)",
   example: "Mute the noise channel.", say: "Say the track and what to change: mute/solo/hide (true/false), volume (0–1.5), pan (-1 left to 1 right), voice (a name from the voice menu — unknown names list the choices), patch (a preset like Chip lead, or changes like attack=0.02 vib_depth=0.4), color (a hex code), name (rename it), or octave (1 or -1).",
   spec: "set_track {track, mute?, solo?, hide?, volume?, pan?, voice?, patch?, color?, name?, octave?}: changes one or more of a track's own settings, by name (never the track selected in the app — an unknown or ambiguous name is an error naming the song's own tracks). mute/solo/hide take true/false. volume is 0–1.5 (1 = unity, the mixer fader's own range). pan is -1 (left) to 1 (right). voice is matched against the voice menu's built-in list (NES waves + sampled instruments) by name — an unknown name errors listing every choice; game/soundfont library voices aren't reachable here, only through the voice menu itself. patch is the voice menu's Patches family (a synth wave + ADSR + delayed vibrato saved in the song): a preset name (Pluck, Soft pad, Lead + vibrato, Bass, Chip lead, Organ), or changes as key=value words — wave (pulse 50%/pulse 25%/pulse 12.5%/triangle/sine/saw/organ), attack/decay/release seconds, sustain 0–1, vib_rate Hz, vib_depth semitones, vib_delay seconds, or env=A,D,S,R and vib=rate,depth,delay — on top of a leading preset word, else the track's current patch; out-of-range values error. voice and patch together is an error. color is a hex code like #4488ff. name renames the track (your own songs only — captures' names come from the pipeline). octave is 1 or -1, a whole-track octave shift (refused on a drum/noise track, or where a note would leave the roll). Every field given lands as ONE undo step. Only when the user explicitly asks; own editable songs only (refuses on a locked/capture song).",
   run(a) { return askSetTrack(a).note; }},
  {name: "add_track", args: "name voice?", gloss: "add a track (one undo removes it)",
   example: "Add a track called pad.", say: "Say the name, and a voice if you want one picked now (else it starts auto).",
   spec: "add_track {name, voice?}: adds a new, empty track at the end, named as given (a name already in use is an error) — the SAME ＋ the track bar's own chip adds. voice, if given, is matched against the voice menu's built-in list exactly as set_track's; omitted leaves it auto. Only when the user explicitly asks; one undo step; own compositions only (an import or capture can't grow its track count — song_file save_as makes an editable copy first).",
   run(a) { return askAddTrack(a).note; }},
  {name: "delete_track", args: "track", gloss: "delete a track (one undo brings it back)",
   example: "Delete the empty track.", say: "Say which track.",
   spec: "delete_track {track}: removes a track by name (never the track selected in the app — an unknown or ambiguous name is an error naming the song's own tracks) — the SAME ✕ Delete track the voice menu offers. Refused when it is the song's last track (a song needs at least one), saying so. Only when the user explicitly asks; one undo step; own compositions only.",
   run(a) { return askDeleteTrack(a).note; }},
  {name: "keep_that", args: "track?", gloss: "write the last ~60s you noodled on the keys, at the cursor (one undo)",
   example: "Keep that on pulse 1.", say: "Say which track if it isn't the one already selected.",
   spec: "keep_that {track?}: writes whatever was just played on the on-screen keys or a MIDI keyboard — the rolling buffer 🎹 Keep that already keeps, up to the last 60 seconds — onto the named track (or the one already selected, if track is omitted) at the playhead, timed against the song's tempo exactly as the button does. One undo step, exactly like a take from Record. Refused while ● Record is running, on an audio track, or when nothing was played; own editable songs only.",
   run(a) { return askKeepThat(a).note; }},
  {name: "album", args: "op album? song?", gloss: "play|next|prev|leave an album run", quiet: true,
   example: "Play the FF1 album.", say: "Name the op: play (name the album, and a song in it to start from), next, prev, or leave.",
   spec: "album {op, album?, song?}: op is play (starts an album run — album names it, from the catalog; an ambiguous name lists the matches; song optionally picks where in it to start, in the album's own shown order — game order or A–Z, whichever is in effect), next, prev (move within the running album), or leave (ends the run; this song keeps playing on its own). next/prev/leave refuse when no album is running. Sound must have been unlocked by one tap on Play this session, same as play.",
   async run(a) { return (await askAlbum(a)).note; }},
  // ---- song_file / set_pref (docs/ai-parity.md §5 batch 8, 2026-10-05):
  // song files and device prefs. Both reuse the File menu's / Settings
  // sheet's own functions — never a parallel path, no native dialogs (a
  // name collision that would otherwise pop appConfirm() is checked first
  // and errors instead of waiting on a tap that will never come).
  {name: "song_file", args: "op title? folder? label?", gloss: "new, save_version, versions, save_as, rename, or share_link", song: false,
   example: "Save a version called before drums.", say: "Say the op: new (a title, and a folder if you want one besides the default), save_version (a label, else \"Version N\"), versions (lists them), save_as (a title, and a folder), rename (the new name), or share_link.",
   spec: "song_file {op, title?, folder?, label?}: op new creates a fresh song (the File menu's ＋ New song, 120bpm/4-4 — bpm and meter aren't settable here) and immediately names it with title (and folder, else the last-used one) — errors instead of asking to replace when a local copy of that name already exists (the one case the real form would need a tap for). save_version snapshots this device's working copy + annotations, dated, under label (default \"Version N\"); own compositions only, and only once the song has a name (not an Untitled song — song_file new or save_as first). versions lists every saved version, newest first (restoring one needs your tap — not this action). save_as makes an editable copy of whatever is open (own songs, captures, anything) under title in folder (default the last-used one). rename changes the song's name — an uncommitted local draft renames its file; anything already saved gets a title override everywhere the dropdown shows it (needs a GitHub token). share_link gives the link your own song already has, once it's been published — a song that only lives on this device says so instead of a dead link. Only when the user explicitly asks.",
   async run(a) { return (await askSongFile(a)).note; }},
  {name: "set_pref", args: "name value", gloss: "a device preference: album_order, octave_numbers, debug_log, chip_stream, sound, beat_subdivisions, volume_slider, ruler_highlight, text_jump, or text_size", quiet: true, song: false,
   example: "Turn the debug log on.", say: "Say the name and the value: album_order (game or az), octave_numbers (on/off), debug_log (on/off), chip_stream (on/off/auto), sound (chip or midi — what you hear), beat_subdivisions (true/false — the counter's e/&/a and +NN%), ruler_highlight (true/false — whether tapping a chord/section band selects its bars), text_jump (true/false — whether the app may put the cursor in a text box by itself, which raises the iPad keyboard), volume_slider (true/false — the top bar's 🔊 master volume), or text_size (small/default/large/larger).",
   spec: "set_pref {name, value}: changes one device-local preference, same as the matching Settings-sheet control — never song state. name is album_order (game or az — the album strip's own order switch), octave_numbers (true/false — the 8va ‹›  readout), debug_log (true/false), chip_stream (on/off/auto), sound (chip or midi — what you hear), beat_subdivisions (true/false — the counter's e/&/a and +NN%), volume_slider (true/false — the top bar's 🔊 master volume), ruler_highlight (true/false — a chord/section band tap selects its bars), text_jump (true/false — the app may put the cursor in a text box by itself; off by default on touch, where that raises the on-screen keyboard), or text_size (small/default/large/larger, or 0.9/1/1.15/1.3). Learning mode is NOT on this list and never will be — it is a setting only the user flips himself, never through Ask. An unknown name errors listing the choices.",
   run(a) { return askSetPref(a).note; }},
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
  if (S.songKey && path !== S.songKey && draftDirtyState(S.songKey)) notes.push(songTitleOf(S.songKey) + "'s changes are kept");
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
    else if (v.kind === "anno") other.push(v.what || "the annotation layer"); // editor Save/Delete and band-edge drags name theirs (annoUndoEntry)
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

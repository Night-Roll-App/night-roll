import { LINK_SONGS } from "../platform/base.js";
import { studyBeforeSongChange, studyAfterNotesChange } from "../ui/study-sheet.js";
import { isUnsaved } from "../model/provenance.js";
import { recentSongs } from "../platform/base.js";
import { songTitleOfImpl as songTitleOf } from "../ask/context.js";
import { saveRecentSongsRaw } from "../platform/base.js";
import { RECENT_MAX } from "../platform/base.js";
import { S } from "../state.js";
import { wmRestoreOpen } from "../ui/wm.js";
import { prof } from "../state.js";
import { barTicks } from "../model/rollnotes.js";
import { beatTicks } from "../model/grid.js";
import { applyChop } from "../model/rollnotes.js";
import { resolveNote } from "../model/rollnotes.js";
import { visibleNotes } from "../model/rollnotes.js";
import { annoShown } from "../model/rollnotes.js";
import { bakesTempo } from "../model/provenance.js";
import { bakeTempos } from "../model/rollnotes.js";
import { applyAudioDirs } from "../audio/clips.js";
import { updateTrackGains } from "../audio/engine.js";
import { renderTrackbarImpl as renderTrackbar } from "../ui/trackbar.js";
import { sfPreloadForSong } from "../audio/voices.js";
import { gamePreloadForSong } from "../audio/voices.js";
import { updateSongMeta } from "../hooks.js";
import { computeSongEnd } from "../model/song.js";
import { fitView } from "../hooks.js";
import { updateEditBtnVisImpl as updateEditBtnVis } from "../ui/chrome.js";
import { SF_MAJOR } from "../theory/chords.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { keyLabelState } from "../ui/chrome.js";
import { secDepthCap } from "../model/grid.js";
import { TRACK_COLORS } from "../render/roll.js";
import { appMode } from "../platform/mode.js";
import { BASE_RULER_H } from "../render/roll.js";
import { LANE_H } from "../render/roll.js";
import { songHasAudio } from "../model/song.js";
import { AUDIO_STRIP_H } from "../render/roll.js";
import { STRIP_H } from "../render/roll.js";
import { readData } from "../platform/folder.js";
import { notesBase } from "../model/rollnotes.js";
import { parseRollnotes } from "../model/rollnotes.js";
import { subtractTombstones } from "../model/rollnotes.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { cfg } from "../platform/storage.js";
import { mergeLocalAdditions } from "../model/rollnotes.js";
import { finalizeNotes } from "../hooks.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { updateSubtitleImpl as updateSubtitle } from "../ui/chrome.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { songShareURL } from "../platform/base.js";
import { syncDurSeg } from "../ui/note-editor.js";
import { editorBeforeSongChange, editorAfterNotesChange } from "../ui/note-editor.js";
import { stop } from "../audio/transport.js";
import { play } from "../audio/transport.js";
import { localDraftTracks } from "../model/versions.js";
import { idbDraftGet } from "../platform/storage.js";
import { draftFingerprint } from "../model/versions.js";
import { appConfirmImpl as appConfirm } from "../ui/chrome.js";
import { idbDraftDelete } from "../platform/storage.js";
import { isComposition } from "../model/provenance.js";
import { isLocalDraft } from "../model/edits.js";
import { saveDraft } from "../model/versions.js";
import { parseMidi } from "../midi/parse.js";
import { cmpBar } from "../ui/chrome.js";
import { rangeSelRestore } from "../render/roll.js";
import { stretchCache } from "../audio/clips.js";
import { playGateTick } from "../audio/transport.js";
import { loadEdits } from "../model/edits.js";
import { effTs } from "../model/grid.js";
import { clampViewImpl as clampView } from "../ui/chrome.js";
import { askModeButtons } from "../ask/sheet.js";
import { askRenderImpl as askRender } from "../ask/sheet.js";
import { SCORE_INTRO_W } from "../render/score.js";
import { viewRestore } from "../render/roll.js";
import { pxqFloor } from "../ui/chrome.js";
import { rowHFloor } from "../ui/chrome.js";
import { topRow } from "../render/roll.js";
import { dispPitchExtent } from "../ui/chrome.js";
import { ROLL_AIR } from "../ui/chrome.js";
import { draftRead } from "../model/versions.js";
import { rememberLastSong } from "../platform/base.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { ctlCopy } from "../midi/parse.js";

export function rememberRecentSong(key) {
  if (LINK_SONGS || !key || isUnsaved(key)) return;
  const list = recentSongs().filter(r => r.key !== key); // dedupe: reopening moves it to the front, not a second row
  list.unshift({key, title: songTitleOf(key)});
  saveRecentSongsRaw(list.slice(0, RECENT_MAX));
}
export function finalizeNotesImpl() {
  // adopt any declared meter FIRST, then re-resolve every anchor under it —
  // at load, resolveNote ran under neutral 4/4 before the file's timesig was
  // seen, so 6/8 songs' anchors landed on wrong ticks (the old menu bug)
  const tsNote = S.rollnotes.find(n => n.tsdir);
  S.declaredTs = tsNote ? tsNote.tsdir : null;
  // chop directives (raw-capture coordinates) carve the displayed song
  let chopChanged = false;
  if (S.song) {
    for (const n of S.rollnotes) {
      const cm = n.text.match(/^chop:\s*(start|end)\s*$/i);
      if (cm) n.chopdir = cm[1].toLowerCase(); else delete n.chopdir;
    }
    const cs = S.rollnotes.find(n => n.chopdir === "start");
    const ce = S.rollnotes.find(n => n.chopdir === "end");
    const rawTick = n => Math.max(0, Math.round((n.b1 - 1) * barTicks() + (n.q1 - 1) * beatTicks()));
    // docs/split-plan.md §4 step 1 deviation: locals were named S/E pre-split,
    // a coincidental collision with the state container's name — renamed
    // (pure local rename, no behavior change) so this block's own S.rollnotes
    // etc. above keep resolving to the real state object. See
    // "Deviations (1)" in docs/split-plan.md.
    const cStart = cs ? rawTick(cs) : 0;
    const cEnd = ce && rawTick(ce) > cStart ? rawTick(ce) : null;
    chopChanged = applyChop(cStart, cEnd);
  }
  S.rollnotes.forEach(resolveNote);
  S.rollnotes.sort((a, b) => a.start - b.start);
  const bt = barTicks();
  const plain = S.rollnotes.filter(n => !n.section && !n.chord);
  plain.forEach((n, i) => {
    if (n.end === null || n.end <= n.start) {
      const next = plain[i + 1];
      n.end = next && next.start > n.start ? next.start : n.start + bt;
    }
  });
  // "loop: B.Q" directive — anchor = jump point, value = jump target.
  // Discovered per song (some FF1 loops return past an intro, e.g. to bar 2).
  for (const n of S.rollnotes) {
    const lm = n.text.match(/^loop:\s*(\d+)(?:\.(\d+(?:\.\d+)?))?\s*$/);
    if (lm) n.loopTo = (+lm[1] - 1) * bt + ((lm[2] ? +lm[2] : 1) - 1) * beatTicks();
    else delete n.loopTo;
  }
  if (S.song && bakesTempo(S.songKey)) { // Josh's ruling (2026-08-15, widened 2026-09-30): on
    // songs HE WROTE a tempo: annotation authors the tempo — it rebuilds the
    // map. On ANALYZED songs (captures, starters, corpora) the same
    // annotation is an observation ("the song changes tempo here") and must
    // not touch playback: captures' timing is measured.
    if (!S.song.baseTempos) S.song.baseTempos = S.song.tempos.map(t => ({...t}));
    S.song.tempos = bakeTempos(S.song.baseTempos, S.rollnotes, S.song.ppq);
  }
  if (S.song) { // track: directives — per-track voice & color, synced like any note
    S.song.tracks.forEach(tr => { delete tr.voice; delete tr.color; delete tr.vol; delete tr.pan; }); // pan: the directive's; the .mid's own stays in midiPan
    S.trackState.forEach(st => { st.muted = false; st.solo = false; st.hidden = false; }); // the directives below say otherwise
    S.laneOverride = null; // "lane: N" directive — the kit lane's pinned row, synced like any note
    { // duplicate track: directives accumulate (upsert removes a SYNCED copy
      // in memory only; the repo file resurrects it on load — web-session
      // handoff 2026-08-18). Last-wins per track name, earlier copies drop.
      const lastFor = new Map();
      for (const n of S.rollnotes) if (n.trackdir) lastFor.set(n.trackdir.name.toLowerCase(), n);
      S.rollnotes = S.rollnotes.filter(n => !n.trackdir || lastFor.get(n.trackdir.name.toLowerCase()) === n);
    }
    for (const n of S.rollnotes) {
      const ln = n.text.match(/^lane:\s*(-?\d+)\s*$/);
      if (ln) S.laneOverride = Math.min(S.PMAX - 4, Math.max(S.PMIN - 2, +ln[1]));
      if (!n.trackdir) continue;
      const ti = S.song.tracks.findIndex((tr, i) =>
        (tr.name || "tr" + (i + 1)).toLowerCase() === n.trackdir.name.toLowerCase());
      if (ti < 0) continue;
      if (n.trackdir.voice) S.song.tracks[ti].voice = n.trackdir.voice;
      if (n.trackdir.color) S.song.tracks[ti].color = n.trackdir.color;
      if (n.trackdir.vol !== undefined) S.song.tracks[ti].vol = n.trackdir.vol;
      if (n.trackdir.pan !== undefined) S.song.tracks[ti].pan = n.trackdir.pan;
      if (S.trackState[ti]) Object.assign(S.trackState[ti], {muted: !!n.trackdir.mute, solo: !!n.trackdir.solo, hidden: !!n.trackdir.hide});
    }
    applyAudioDirs(); // audio: directives — kind/clip derived onto named tracks the same way
    updateTrackGains(); // live nodes follow re-applied faders immediately
    renderTrackbar();
    sfPreloadForSong(); // sampled voices: fetch + decode this song's pitches now, not at first note
    gamePreloadForSong(); // game instrument voices: fetch their library + the pitches this song plays, same reason
  }
  if (S.song) { updateSongMeta(); computeSongEnd(); } // grid may have changed
  if (chopChanged) { S.playCursor = Math.min(S.playCursor, S.songEndTick); if (typeof fitView === "function") fitView(); }
  updateEditBtnVis(); // "forked from" notes arrive with the rollnotes — recheck editability
  S.keyRegions = visibleNotes().filter(n => n.keydir !== undefined) // visibleNotes: a Learning-hidden ✦ AI key never reaches the staff, the LCD or the ✦ Ask key state
    .map(n => ({start: n.start, sf: n.keydir,
                name: (n.text.match(/^key:\s*(\S+(?:\s+[a-z]+)?)/i) || [, SF_MAJOR[n.keydir]])[1], // "Gm"/"D dorian" show as recorded
                end: n.b2 ? (n.b2 - 1) * bt + (n.q2 || beatsPerBarDisp()) * beatTicks() : null,
                b1: n.b1, b2: n.b2}))
    .sort((a, b) => a.start - b.start);
  const unsetOpt = document.getElementById("keyunset");
  const keysetEstBtn = document.getElementById("keysetest");
  if (unsetOpt) {
    // keyLabelState() (P4) is the SAME computation this used to do inline —
    // factored out so askContext can build the identical text from data,
    // never by reading this label back out of the DOM.
    const {text, est} = keyLabelState();
    unsetOpt.textContent = text;
    if (keysetEstBtn) keysetEstBtn.style.display = est ? "" : "none";
  }
  // sections and chords NEVER share a row (Josh's redesign, 2026-08-18):
  // each type stacks by containment within its OWN group — sections on top,
  // chords below — so a section and a chord with identical spans can't
  // collide. An empty group contributes zero rows.
  for (const n of S.rollnotes) if (!annoShown(n)) n.lane = null; // a Learning-hidden ✦ AI band takes no row (folded, like a collapsed level); every lane reader also goes through visibleNotes
  const secs = visibleNotes().filter(n => n.section || n.chord);
  secs.forEach(s => { if (s.end === null || s.end <= s.start) s.end = s.start + bt; });
  S.sectionColors = {};
  let ci = 0;
  const depthWithin = group => {
    let max = -1;
    for (const s of group) {
      s.depth = group.filter(t => t !== s && t.start <= s.start && t.end >= s.end &&
                                  (t.start < s.start || t.end > s.end)).length;
      max = Math.max(max, s.depth);
    }
    return max + 1; // row count (0 when the group is empty)
  };
  const secGroup = secs.filter(n => n.section);
  const chGroup = secs.filter(n => n.chord && !n.section);
  const secDeep = depthWithin(secGroup);
  const chRows = depthWithin(chGroup);
  // collapse: levels deeper than the device's cap fold away from the RULER
  // only — the drummer and every tool still read all of them (a drum-keying
  // sub-label is scaffolding you shouldn't have to look at; Josh, 2026-08-22)
  const cap = S.listenerMode ? -1 : secDepthCap(); // listener: bands fold entirely
  const secRows = Math.min(secDeep, cap + 1);
  S.secMaxDepth = secDeep; // for the chevron's cycle
  for (const s of secGroup) s.lane = s.depth <= cap ? s.depth : null; // null = folded
  for (const c of chGroup) c.lane = S.listenerMode ? null : secRows + c.depth;
  for (const s of secs)
    if (!(s.text in S.sectionColors)) S.sectionColors[s.text] = TRACK_COLORS[ci++ % TRACK_COLORS.length];
  // P6: the Analyze layer's own rows, appended BELOW every section/chord
  // row — never interleaved with them, same "own row" discipline as
  // sections-vs-chords above. Normal + toggled on only; Learning (or the
  // layer being off) contributes zero rows, same as an empty annotation group.
  S.analysisChordLane = S.analysisKeyLane = null;
  let analysisRows = 0;
  if (S.analysisOn && appMode() === "normal" && !S.listenerMode) {
    const rowsSoFar = secRows + chRows;
    if (S.analysisBands.chords.length) { S.analysisChordLane = rowsSoFar + analysisRows; analysisRows++; }
    if (S.analysisBands.key) { S.analysisKeyLane = rowsSoFar + analysisRows; analysisRows++; }
  }
  S.STRIP_Y = BASE_RULER_H + (secRows + (S.listenerMode ? 0 : chRows) + analysisRows) * LANE_H +
            (songHasAudio() ? AUDIO_STRIP_H : 0); // clip spans ride under the ruler in every view
  S.RULER_H = S.STRIP_Y + STRIP_H; // + the playhead strip, always present, right above the notes
  studyAfterNotesChange(); // an open Analysis sheet follows every change to the layer (edit, undo, a song's notes landing)
  editorAfterNotesChange(); // so does a docked annotation window (a song's notes landing, an undo that removed what it shows)
}
finalizeNotesImpl = prof("finalizeNotes", finalizeNotesImpl); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export async function loadNotes() {
  const gen = S.loadGen; // abandon if another song starts loading mid-fetch
  S.rollnotes = [];
  S.rollnotesReadOnly = false; S.rollnotesLockReason = null; S.rollnotesOrigin = null;
  if (S.songKey) {
    try {
      // ?t= busts the Pages CDN (it caches ~10 min; a reload right after
      // Sync otherwise shows pre-sync annotations and looks like data loss)
      let res = await readData("analysis", notesBase() + ".rollnotes.json", true);
      if (!res.ok) res = await readData("analysis", notesBase() + ".rollnotes", true); // legacy
      let text = res.ok ? await res.text() : null;
      if (gen !== S.loadGen) return;
      // deploy-lag bridge: a Sync younger than 10 min beats a disagreeing CDN
      try {
        const ls = LINK_SONGS ? null : JSON.parse(localStorage.getItem("ff1roll-lastsync-" + S.songKey) || "null");
        if (ls) {
          if (text === ls.text || Date.now() - ls.t > 10 * 60e3)
            localStorage.removeItem("ff1roll-lastsync-" + S.songKey); // CDN caught up (or bridge expired)
          else text = ls.text;
        }
      } catch (err) { /* corrupt bridge: ignore */ }
      if (text !== null) {
        const parsed = parseRollnotes(text); // version/origin/readOnly live on THIS array (props a later .map/.filter won't carry) — read them now
        S.rollnotesReadOnly = !!parsed.readOnly;
        S.rollnotesLockReason = parsed.lockReason || null;
        S.rollnotesOrigin = parsed.origin || null;
        S.rollnotes = parsed.map(resolveNote);
        // the file's save stamp is the base this device's draft derives from.
        // It was only ever set by THIS device's own Publish, so any other
        // device tripped "newer save exists" on its first edit (Josh, the
        // fresh Xcode shell, Threnody II, 2026-09-27)
        try { const j = JSON.parse(text); if (j && typeof j.saved === "number" && S.song && j.saved > (S.song.savedStamp || 0)) S.song.savedStamp = j.saved; } catch (err) { /* legacy text format carries no stamp */ }
        S.rollnotes = subtractTombstones(S.rollnotes, S.songKey); // (they only die for real on Sync)
        // version guard (docs/annotations-v2.md P3): a file written by a
        // newer Night Roll opens read-only — never silently, so he isn't
        // puzzled when an edit later refuses to publish
        if (S.rollnotesReadOnly) setInfo(S.rollnotesLockReason);
      }
      else if (localStorage.getItem("ff1roll-lastsync-" + S.songKey)) {
        // this device SYNCED annotations for this path before, yet the analysis
        // location now has none — likely repo/path drift, not "no notes yet".
        // Never render silently empty over that (advisor, 2026-08-17).
        setInfo("⚠ annotations were synced for this song before, but " +
                (cfg().analysisBase || "this site") + " has none at " + notesBase() + ".rollnotes.json — check Data locations");
      }
    } catch (err) { /* no sidecar */ }
    if (gen !== S.loadGen) return;
    const before = S.rollnotes.length;
    S.rollnotes = mergeLocalAdditions(S.rollnotes, S.songKey);
    for (let i = before; i < S.rollnotes.length; i++) resolveNote(S.rollnotes[i]); // only the newly-merged ones need it — the rest were resolved above
  }
  finalizeNotes();
  buildScoreModel(); // key regions may have changed spelling/signatures
  updateSubtitle();
  draw();
}
export function reflectSongURL(path) { // the address bar always holds a shareable link: the song's path, no extension
  try {
    const u = new URL(/^albums\//.test(path) ? songShareURL(path) : S.APP_BASE); // local/ drafts don't exist for anyone else
    for (const [k, v] of new URL(location.href).searchParams) if (k !== "song" && k !== "album") u.searchParams.set(k, v); // ?perf=1 etc. survive; album is set below, only while a run is actually on (never carried over stale)
    if (S.albumRun) u.searchParams.set("album", S.albumRun.album); // a run is on: the link reopens armed to it, not just this song
    u.hash = location.hash;
    history.replaceState(null, "", u);
  } catch (e) {}
}
export async function loadSong(path) {
  if (S.gridDiv) { S.gridDiv = null; syncDurSeg(); } // a custom grid is per passage, never per session: it must not follow you to the next song
  stop();
  S.songLoading = true;
  try {
    await loadSongInner(path);
  } catch (err) { // a failed open must SAY so (Josh, 2026-09-26, airplane mode: "it just hangs")
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    setInfo("couldn't open " + songTitleOf(path) + (offline ? " — you're offline and it isn't on this device yet; songs are kept as you open them (and all of them after one online launch)" : " — " + (err && err.message || "fetch failed")));
    return false; // said in the info strip; not an app error for the ⚠ log
  } finally {
    S.songLoading = false;
    if (S.pendingPlay) { // play pressed mid-load: honor it now the song is real — and its notes
      S.pendingPlay = false; // (the loop: directive arrives with them; playing before it wrapped the whole song)
      const ready = S.song && S.song.notesReady ? S.song.notesReady : Promise.resolve();
      ready.then(() => play(0)).catch(() => { /* audio context refusal */ });
    }
  }
}
export async function loadSongInner(path) {
  const draftRaw = LINK_SONGS ? null : localStorage.getItem("ff1roll-draft-" + path); // a linked song never meets this device's drafts
  if (draftRaw) {
    // cross-device freshness (Josh, 2026-08-16): a Save from another machine
    // stamps the repo file; if it's newer than this draft's base, the draft
    // must not silently mask it
    let d = null;
    try { d = JSON.parse(draftRaw); } catch (err) {}
    if (d && d.tracksRef && !d.tracks) { // an import's notes live in IndexedDB
      if (path.startsWith("local/")) d = await localDraftTracks(path, d);
      else d.tracks = (await idbDraftGet(path)) || [];
    }
    let repoStamp = 0;
    try {
      const r = await readData("analysis", path.replace(/\.mid$/, "") + ".rollnotes.json", true);
      if (r.ok) repoStamp = (JSON.parse(await r.text()).saved || 0);
    } catch (err) { /* offline / not yet saved: draft wins */ }
    if (d && !d.savedStamp && repoStamp) await draftFingerprint(path, d, repoStamp); // unstamped but identical to the repo: adopt its stamp, no question
    if (d && repoStamp > (d.savedStamp || 0)) {
      // an album run never asks: it keeps the draft and says so (nothing is lost)
      const takeNewer = !d.dirty || (!S.albumRun && await appConfirm("NEWER SAVE EXISTS",
        "This song was saved from another device more recently than this draft.",
        "Use the newer save (discard this device's changes)",
        "Keep this device's draft"));
      if (takeNewer) {
        for (const pre of ["ff1roll-draft-", "ff1roll-notes-", "ff1roll-ts-", "ff1roll-edits-"])
          localStorage.removeItem(pre + path);
        idbDraftDelete(path);
        // fall through to the normal repo load below
      } else {
        if (S.albumRun) setInfo("draft kept — a newer save of this song exists on the repo");
        // the user (or an album run) keeps the draft knowingly: it now derives
        // from this repo save, so the question is not asked again on every
        // launch — a draft stamped 0 before the loadNotes fix asked forever
        // (Josh, the iPad shell, 2026-09-27)
        d.savedStamp = repoStamp;
        openDraftDoc(d, path);
        if (isComposition() || isLocalDraft()) saveDraft(); // persist the new base with the draft's own dirty state
        return;
      }
    } else if (d) { // draft is the newest known state
      // a draft from before the fingerprint: read the published .mid once so an
      // edit undone back to it stops counting as "edited since last save"
      await draftFingerprint(path, d, repoStamp);
      openDraftDoc(d, path); return;
    }
  }
  const gen = ++S.loadGen;
  const res = await readData("songs", path);
  if (!res.ok) throw new Error("fetch failed: " + path);
  const buf = await res.arrayBuffer();
  if (gen !== S.loadGen) return; // a newer song load superseded this one
  setSong(parseMidi(buf, {trust: path.startsWith("albums/imports/")}), path); // an import album's file is our own writing: no corrupt-file guards
}
export function setSong(parsed, key) {
  studyBeforeSongChange(); // FIRST, while S.songKey/S.rollnotes are still the outgoing song's: an open Analysis-sheet answer box is committed to the song it was written on, never the next one
  editorBeforeSongChange(); // likewise first: an unsaved docked annotation draft is dropped by name, never carried to the next song's bars
  S.loadGen++; // covers the local-file path: invalidate any in-flight catalog load
  S.cmp = null; if (typeof cmpBar === "function") cmpBar(); // compare belongs to one song
  S.song = parsed;
  S.song.baseTempos = S.song.tempos.map(t => ({...t})); // tempo: directives rebuild from this
  S.songKey = key;
  rememberRecentSong(key); // File ▾ → Open Recent: every real song-open converges here (loadSongInner, openDraftDoc, createComposition, forkCurrentSong) — isUnsaved/LINK_SONGS guards live inside it
  S._laneTop = null; S._kitSlots = null; // lane re-docks per song; a lane: annotation may pin it in loadNotes
  S._has32 = null;
  S.editRedo = [];
  S.dupPending = null; // clone bookkeeping never crosses songs
  S.rangeSel = rangeSelRestore(key); // the ruler range is per song — but THIS song's survives a relaunch (Josh, 2026-10-03)
  S.tapBand = {n: null, t: 0};
  // P6: the Analyze layer is a per-song VIEW computation — a different song
  // means stale bands, so it goes off rather than carry the wrong song's
  // reading (same "off by default" discipline as a fresh session)
  if (S._analysisTimer) { clearTimeout(S._analysisTimer); S._analysisTimer = null; }
  S.analysisOn = false;
  S.analysisBands = {chords: [], key: null};
  S.analysisChordLane = S.analysisKeyLane = null;
  S.analyzeTarget = null;
  S.drTakes = []; S.drActive = -1; // Drummer takes replay against THIS song's notes
  S.declaredTs = null; // meter resets to neutral until this song's notes declare one
  S.selNote = null;
  S.selClip = null;
  stretchCache.clear(); // stretched takes belong to one song
  S.editUndo = []; // undo history belongs to ONE song — stale entries would mutate the wrong notes
  S.captureBuf = []; // a phrase noodled over the last song is not this song's
  playGateTick.queued = false; // a play queued while the last song loaded is not for this one
  S.trackState = S.song.tracks.map(() => ({muted: false, solo: false}));
  S.selTrack = 0;
  loadEdits();
  // raw snapshot (post-edits) that chop directives carve a view out of
  S.song.rawNotes = S.song.tracks.map(tr => tr.notes.map(n => ({...n})));
  S.chopS = 0; S.chopE = null; S.appliedChop = null;
  updateSongMeta();
  if (S.songKey && !LINK_SONGS) // stash meter so Publish-all can serialize this song without reloading it (not for a linked song: nothing of it is remembered)
    localStorage.setItem("ff1roll-ts-" + S.songKey, effTs()[0] + "/" + effTs()[1]);
  S.playCursor = 0;
  S.lastSubtitle = undefined;
  computeSongEnd();
  fitView();
  renderTrackbar();
  updateEditBtnVis();
  buildScoreModel();
  clampView();
  setInfo("tap a note");
  draw();
  S.song.notesReady = loadNotes(); // awaited by anything that must see the loop: directive before playing
  // the AI panel stays open (docked) across song changes: its ♪ tab and log
  // follow the song, not just on open (Josh, 2026-09-29: "Another Arni
  // Village" over Termina). By id: boot reaches here before asksheet's const.
  const ask = document.getElementById("asksheet");
  if (ask && ask.classList.contains("on")) { try { askModeButtons(); askRender(); } catch (err) { /* too early in boot: openAsk renders it */ } }
  if (!S.wmRestored && typeof setTimeout === "function") setTimeout(wmRestoreOpen, 0); // the windows open at last launch come back once the first song is in
}
export function fitViewImpl() { // on song load: the whole song flush on screen (= the zoom-out floor) — unless this song has a view of its own to come back to
  if (S.viewMode === "score") { S.view.x = -SCORE_INTRO_W; S.view.y = 0; return; }
  if (viewRestore()) return;
  S.view.pxq = pxqFloor();
  S.view.rowH = rowHFloor();
  S.view.x = 0;
  // tracks view has no pitch scroll: the roll's fit put the lanes above the
  // screen after a reload in Tracks (first finalizeNotes re-fits, unclamped)
  S.view.y = S.viewMode === "tracks" ? 0 : (topRow() - dispPitchExtent().hi - ROLL_AIR) * S.view.rowH;
}
// playback speed slider: 25–200% of the song's own tempo, persists across songs
export function updateSongMetaImpl() { // bpm label shows what you actually hear
  if (!S.song) return;
  const native = Math.round(6e7 / S.song.tempos[0].usq);
  const eff = Math.round(native * S.playRate);
  document.getElementById("songmeta").textContent =
    (S.playRate === 1 ? native + "bpm" : eff + "bpm (native " + native + ")") +
    (S.declaredTs ? " · " + S.declaredTs[0] + "/" + S.declaredTs[1] : "");
}
export async function openDraft(key) {
  const d = await draftRead(key);
  if (!d) { setInfo("⚠ that draft is gone from this device"); return; }
  openDraftDoc(d, key);
}
export function openDraftDoc(d, key) {
  stop(); // a looping chip buffer would otherwise play the OLD song under the new roll
  const parsed = {ppq: d.ppq, timesig: d.timesig,
    ...(d.source ? {source: d.source} : {}), // the file's OWN meter/key history (docs/declared-vs-learner-spec.md) — carried through so Check vs file still works after a reopen
    tempos: d.tempos.map(t => ({...t})),
    tracks: d.tracks.map(tr => ({name: tr.name,
      ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}), // so previewing a draft sounds the way the publish will
      ...(tr.kit ? {kit: true} : {}),
      ...ctlCopy(tr), // channel controllers, likewise
      ...(tr.offset ? {offset: tr.offset} : {}),
      ...(tr.srcIndex !== undefined ? {srcIndex: tr.srcIndex} : {}), // docs/declared-vs-learner-spec.md phase 2: how source.metas reattaches after edits
      notes: tr.notes.map(n => ({...n}))}))};
  setSong(parsed, key); // rollnotes ride the normal sidecar + local-notes path
  S.song.savedStamp = d.savedStamp || 0;
  S.song.pubSig = d.pubSig || null;
  if (S.song.overlayFold) saveDraft(); // an old build's overlay was merged in: the draft takes it now (stamps above first — draftDoc reads them)
  S.currentPath = key;
  rememberLastSong(key);
  reflectSongURL(key);
  updateSongBtn();
}

import { chipActive } from "../audio/chip.js";
import { S } from "../state.js";
import { chipHas } from "../audio/chip.js";
import { voiceType } from "../audio/voices.js";
import { VOICES } from "../audio/voices.js";
import { parseGameVoice } from "../audio/voices.js";
import { resolveGameVault } from "../audio/voices.js";
import { instAlbums } from "../audio/voices.js";
import { instLibrary } from "../audio/voices.js";
import { gameVoiceVault } from "../audio/voices.js";
import { parseSf2Voice } from "../audio/voices.js";
import { sf2Font } from "../audio/voices.js";
import { VOICE_GROUPS } from "../audio/voices.js";
import { songRegionRight } from "./chrome.js";
import { trackToggle } from "./trackbar.js";
import { saveVoices } from "./trackbar.js";
import { sfFileFor } from "../audio/voices.js";
import { ensureAudio } from "../audio/engine.js";
import { sfDecode } from "../audio/voices.js";
import { previewNote } from "../audio/voices.js";
import { isComposition } from "../model/provenance.js";
import { isLocalDraft } from "../model/edits.js";
import { renameTrack } from "./trackbar.js";
import { setInfoImpl as setInfo } from "./chrome.js";
import { updateTrackGains } from "../audio/engine.js";
import { trackPan } from "../audio/engine.js";
import { editableSong } from "../model/song.js";
import { trackIsDrums } from "../model/grid.js";
import { transposeTrack } from "../model/selection.js";
import { trackColor } from "../render/roll.js";
import { renderTrackbar } from "../hooks.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { drawImpl as draw } from "./chrome.js";
import { pushUndo } from "../model/edits.js";
import { saveDraft } from "../model/versions.js";
import { computeSongEnd } from "../model/song.js";
import { renderGameInstNav } from "./sheets.js";
import { gameVoiceId } from "../audio/voices.js";
import { instAudition } from "./sheets.js";
import { gameInstUsedBySong } from "./sheets.js";
import { sf2Registry } from "./sheets.js";
import { resumeAudio } from "../audio/engine.js";
import { openMaster } from "../audio/engine.js";
import { instPlayer } from "../audio/voices.js";
import { instKeys } from "./sheets.js";
import { sf2VoiceId } from "../audio/voices.js";
import { fmtSec } from "../render/tracks.js";
import { clipLen } from "../model/song.js";
import { clipStatusText } from "../render/tracks.js";
import { barTicks } from "../model/rollnotes.js";
import { beatTicks } from "../model/grid.js";
import { setClipDir } from "../audio/clips.js";
import { fmtBarBeat } from "../gen/drummer.js";
import { clipOnsetSec } from "../audio/clips.js";
import { clipTempo } from "../audio/clips.js";
import { setSongTempo } from "../audio/clips.js";
import { clipBeatMap } from "../audio/clips.js";
import { applyBeatMap } from "../audio/clips.js";
import { splitSelectedClipAtCursor } from "../audio/clips.js";
import { deleteClip } from "../audio/clips.js";
import { writeClips } from "../audio/clips.js";
import { keepPitch } from "../audio/clips.js";
import { stretchCache } from "../audio/clips.js";
import { playSec } from "../audio/transport.js";
import { stop } from "../audio/transport.js";
import { play } from "../audio/transport.js";
import { stretchEnsureAll } from "../audio/clips.js";

export function autoVoiceLabel(ti) { // what "auto" actually resolves to for THIS track
  if (chipActive() && S.song.tracks[ti] && chipHas(S.song.tracks[ti].name))
    return "chip — the game's own sound";
  const v = voiceType(ti);
  return (VOICES.find(([id]) => id === v) || [, v])[1];
}
// null = family list; a title = that family's instruments
export const GAME_FAMILY = "Game instruments";
export const SF2_FAMILY = "Soundfonts";
// which game song a game voice was picked from, per device (a UI memory, not
// song state — the voice id itself stays "game:<vault>:<id>")
export function gameVoiceFromAll() { try { return JSON.parse(localStorage.getItem("ff1roll-gamevoicefrom") || "{}"); } catch (e) { return {}; } }
export function gameVoiceFrom(voiceId) { const m = gameVoiceFromAll()[voiceId]; return m && m.path ? m : null; }
export function gameVoiceFromSet(voiceId, sub) {
  const all = gameVoiceFromAll();
  if (sub && sub.path) all[voiceId] = {title: sub.title, path: sub.path}; else delete all[voiceId];
  try { localStorage.setItem("ff1roll-gamevoicefrom", JSON.stringify(all)); } catch (e) { /* private mode */ }
}

// inside a chosen game: null = its menu (all instruments + songs); "all" = the A–Z leaf list; {title, path} = one song's leaf list
export const gameVoiceLabels = new Map();
// "game:…" voice id -> "<Game title> · <nameGuess>", filled as known
export function gameVoiceLabel(v) { // sync read for menu rows; fills in async and refreshes the open menu once known — "fall back to the id" (spec) until then
  if (gameVoiceLabels.has(v)) return gameVoiceLabels.get(v);
  const info = parseGameVoice(v);
  if (!info) return v;
  gameVoiceLabels.set(v, info.instId);
  (async () => {
    const realVault = await resolveGameVault(info.vault); // an old, pre-reorg vault resolves to its album's current one
    const games = await instAlbums();
    const g = games.find(x => x.vault.replace(/\/$/, "") === realVault);
    const lib = await instLibrary(gameVoiceVault(realVault));
    const inst = lib.instruments.find(i => i.id === info.instId);
    gameVoiceLabels.set(v, (g ? g.title : info.vault) + " · " + (inst ? (inst.nameGuess || inst.id) : info.instId));
    if (S.voiceMenuTi >= 0 && document.getElementById("voicemenu").classList.contains("on")) buildVoiceMenu(S.voiceMenuTi);
  })().catch(() => {}); // network hiccup: stays on the id fallback
  return gameVoiceLabels.get(v);
}
// inside SF2_FAMILY: null = pick a font; a slug = that font's presets
export const sf2VoiceLabels = new Map();
// "sf2:…" voice id -> "<font name> · <preset name>", filled as known
export function sf2VoiceLabel(v) { // same "fall back to the id, fill in async" contract as gameVoiceLabel
  if (sf2VoiceLabels.has(v)) return sf2VoiceLabels.get(v);
  const info = parseSf2Voice(v);
  if (!info) return v;
  sf2VoiceLabels.set(v, info.slug + " " + info.bank + ":" + info.program);
  (async () => {
    const font = await sf2Font(info.slug);
    const preset = font.presets.find(p => p.bank === info.bank && p.program === info.program);
    sf2VoiceLabels.set(v, (font.name || info.slug) + " · " + (preset ? preset.name : info.bank + ":" + info.program));
    if (S.voiceMenuTi >= 0 && document.getElementById("voicemenu").classList.contains("on")) buildVoiceMenu(S.voiceMenuTi);
  })().catch(() => {});
  return sf2VoiceLabels.get(v);
}
export function openVoiceMenu(ti, anchor) { // position ONCE from the chip, then show
  const menu = document.getElementById("voicemenu");
  S.voiceMenuTi = ti;
  // open straight into the family holding the track's current voice
  const cur = S.song.tracks[ti].voice || "auto";
  const home = VOICE_GROUPS.find(([, vs]) => vs.some(([id]) => id === cur));
  S.voiceMenuGroup = home ? home[0] : cur.startsWith("game:") ? GAME_FAMILY : cur.startsWith("sf2:") ? SF2_FAMILY : null;
  S.voiceMenuGameVault = null; S.voiceMenuGameSub = null; S.voiceMenuGameSys = null; // the games picker always opens at the systems list, not drilled into one — UNLESS the current voice is a game voice, which drills straight back to it (below)
  S.voiceMenuSf2Slug = null; // same: the soundfonts picker always opens at the fonts list
  buildVoiceMenu(ti);
  if (S.voiceMenuGroup === GAME_FAMILY && cur.startsWith("game:")) openGameVoiceMenuTo(ti, cur); // Josh, 2026-09-29: reopening a track's voice menu should drill straight back to the instrument he picked, not the systems list
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(6, Math.min(r.left, songRegionRight() - 240)) + "px";
  menu.style.top = (r.bottom + 6) + "px";
  menu.classList.add("on");
}
export function buildVoiceMenu(ti) { // content only — picks refresh in place; every
  // pick rebuilds the chip bar (finalizeNotes → renderTrackbar), so the
  // anchor chip is detached by then and repositioning from it jumped the
  // menu to the corner (Josh's iPad report 2026-08-15)
  const menu = document.getElementById("voicemenu");
  menu.innerHTML = "";
  const renderToken = ++S.voiceMenuRenderToken; // invalidates every OTHER in-flight async render on this menu — see its own declaration
  const tr = S.song.tracks[ti];
  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;gap:6px;padding:2px 4px 2px 10px";
  const hlbl = document.createElement("span");
  hlbl.style.cssText = "font-family:var(--mono);font-size:0.6875rem;color:var(--dim);flex:1";
  hlbl.textContent = (tr.name || "track " + (ti + 1)) + (tr.kind === "audio" ? " — recording" : " — voice & color");
  // Hide notes (Chrome density pass, 2026-10-01): moved off the chip itself
  // into the voice menu's own header row — the Mixer keeps its separate H.
  const st = S.trackState[ti] || (S.trackState[ti] = {muted: false, solo: false});
  const vmhide = document.createElement("button");
  vmhide.id = "vmhide";
  vmhide.style.cssText = "min-height:32px;padding:2px 10px;flex:none";
  vmhide.classList.toggle("active", !!st.hidden);
  vmhide.textContent = "Hide notes";
  vmhide.setAttribute("aria-pressed", String(!!st.hidden));
  vmhide.setAttribute("aria-label", "Hide notes — " + (tr.name || "track " + (ti + 1)));
  vmhide.title = "Hide this track's notes (still plays unless muted)";
  vmhide.addEventListener("click", () => { trackToggle(ti, "hidden"); buildVoiceMenu(ti); });
  const close = document.createElement("button");
  close.style.cssText = "min-height:32px;padding:2px 10px;flex:none";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close voice menu");
  close.addEventListener("click", () => menu.classList.remove("on"));
  head.append(hlbl, vmhide, close);
  menu.appendChild(head);
  const cur = tr.voice || "auto";
  const curLabel = cur === "auto" ? "auto: " + autoVoiceLabel(ti)
    : cur.startsWith("game:") ? gameVoiceLabel(cur)
    : cur.startsWith("sf2:") ? sf2VoiceLabel(cur)
    : (VOICES.find(([id]) => id === cur) || [, cur])[1];
  if (tr.kind === "audio" && tr.clips.length) buildClipControls(ti, menu, tr); // a clip has no instrument: placement instead
  else if (S.voiceMenuGroup === null) { // level 1: the instrument families
    for (const [title, vs] of VOICE_GROUPS) {
      const b = document.createElement("button");
      b.className = "fitem";
      const holds = vs.some(([id]) => id === cur);
      b.textContent = title + "  ›" + (holds ? "   (" + curLabel + ")" : "");
      b.addEventListener("click", () => { S.voiceMenuGroup = title; buildVoiceMenu(ti); });
      menu.appendChild(b);
    }
    const gb = document.createElement("button");
    gb.className = "fitem";
    const gholds = cur.startsWith("game:");
    gb.textContent = GAME_FAMILY + "  ›" + (gholds ? "   (" + curLabel + ")" : "");
    gb.addEventListener("click", () => { S.voiceMenuGroup = GAME_FAMILY; S.voiceMenuGameVault = null; S.voiceMenuGameSub = null; S.voiceMenuGameSys = null; buildVoiceMenu(ti); });
    menu.appendChild(gb);
    const sb = document.createElement("button");
    sb.className = "fitem";
    const sholds = cur.startsWith("sf2:");
    sb.textContent = SF2_FAMILY + "  ›" + (sholds ? "   (" + curLabel + ")" : "");
    sb.addEventListener("click", () => { S.voiceMenuGroup = SF2_FAMILY; S.voiceMenuSf2Slug = null; buildVoiceMenu(ti); });
    menu.appendChild(sb);
  } else if (S.voiceMenuGroup === GAME_FAMILY) { // level 2: a game, then that game's used instruments
    buildGameVoicePicker(ti, menu, tr, cur, renderToken);
  } else if (S.voiceMenuGroup === SF2_FAMILY) { // level 2: a loaded soundfont, then its presets
    buildSf2VoicePicker(ti, menu, tr, cur);
  } else { // level 2: one family's instruments
    const back = document.createElement("button");
    back.className = "fitem";
    back.style.color = "var(--dim)";
    back.textContent = "‹ " + S.voiceMenuGroup;
    back.addEventListener("click", () => { S.voiceMenuGroup = null; buildVoiceMenu(ti); });
    menu.appendChild(back);
    const group = VOICE_GROUPS.find(([t]) => t === S.voiceMenuGroup);
    for (const [v, label] of (group ? group[1] : [])) {
      const b = document.createElement("button");
      b.className = "fitem";
      const shown = v === "auto" ? "auto: " + autoVoiceLabel(ti) : label;
      b.textContent = (cur === v ? "✓ " : "   ") + shown;
      b.addEventListener("click", () => {
        tr.voice = v === "auto" ? undefined : v;
        saveVoices();
        const file = sfFileFor(v);
        if (file) { // sampled: preview once its A4 is actually decoded
          ensureAudio();
          sfDecode(file, 69).then(() => previewNote(ti, 69));
        } else previewNote(ti, 69); // synth voices are instant
        buildVoiceMenu(ti); // refresh the ✓ — the menu stays where it is
      });
      menu.appendChild(b);
    }
  }
  if (isComposition() || isLocalDraft()) { // rename lives where the track's other identity does
    const rw = document.createElement("div");
    rw.style.cssText = "padding:8px 10px 0;display:flex;align-items:center;gap:6px";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = tr.name || "";
    inp.style.cssText = "flex:1;min-width:0;min-height:36px";
    inp.setAttribute("aria-label", "Track name");
    const go = document.createElement("button");
    go.textContent = "Rename";
    go.style.cssText = "min-height:36px;flex:none";
    go.addEventListener("click", () => {
      const err = renameTrack(ti, inp.value);
      if (err) { setInfo(err); return; }
      setInfo("track renamed to “" + inp.value.trim() + "” — Save bakes it into the song");
      buildVoiceMenu(ti);
    });
    rw.append(inp, go);
    menu.appendChild(rw);
  }
  const vw = document.createElement("div");
  vw.style.cssText = "padding:8px 10px 0;display:flex;align-items:center;gap:8px";
  const vlbl = document.createElement("span");
  vlbl.style.cssText = "font-family:var(--mono);font-size:0.6875rem;color:var(--dim);flex:none";
  const fader = document.createElement("input");
  fader.type = "range";
  fader.min = "0"; fader.max = "1.5"; fader.step = "0.05";
  fader.value = String(tr.vol === undefined ? 1 : tr.vol);
  fader.style.cssText = "flex:1";
  fader.setAttribute("aria-label", "Track volume");
  const vshow = () => { vlbl.textContent = "vol " + Math.round((+fader.value) * 100) + "%"; };
  vshow();
  fader.addEventListener("input", () => { // live while dragging — hear it immediately
    tr.vol = +fader.value === 1 ? undefined : +fader.value;
    vshow();
    updateTrackGains();
  });
  fader.addEventListener("change", () => { saveVoices(); }); // persist as the track: annotation
  vw.append(vlbl, fader);
  menu.appendChild(vw);
  { // pan: left … right; an import's track starts where the game put its channel (the .mid's CC10)
    const pw = document.createElement("div");
    pw.style.cssText = "padding:6px 10px 0;display:flex;align-items:center;gap:8px";
    const plbl = document.createElement("span");
    plbl.style.cssText = "font-family:var(--mono);font-size:0.6875rem;color:var(--dim);flex:none;min-width:58px";
    const pf = document.createElement("input");
    pf.type = "range"; pf.min = "-1"; pf.max = "1"; pf.step = "0.05";
    pf.value = String(trackPan(ti));
    pf.style.cssText = "flex:1";
    pf.setAttribute("aria-label", "Track pan");
    const pshow = () => { const v = +pf.value; plbl.textContent = "pan " + (Math.abs(v) < 0.025 ? "C" : (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 100)); };
    pshow();
    pf.addEventListener("input", () => { tr.pan = Math.round((+pf.value) * 100) / 100; pshow(); updateTrackGains(); });
    pf.addEventListener("change", () => { saveVoices(); });
    pw.append(plbl, pf);
    menu.appendChild(pw);
  }
  if (editableSong() && !trackIsDrums(ti) && tr.kind !== "audio") { // whole-track octave shifts (Josh, 2026-08-20)
    const ow = document.createElement("div");
    ow.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px";
    const olbl = document.createElement("span");
    olbl.textContent = "octave";
    olbl.style.cssText = "font-size:0.75rem;color:var(--dim)";
    const mk = (txt, dP) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.style.cssText = "flex:1;min-height:38px";
      b.addEventListener("click", () => {
        const k = transposeTrack(ti, dP);
        if (k) setInfo((tr.name || "track") + " " + (dP > 0 ? "up" : "down") + " an octave — " + k + " notes (one undo undoes it)");
      });
      return b;
    };
    ow.append(olbl, mk("▼ 8va", -12), mk("▲ 8va", 12));
    menu.appendChild(ow);
  }
  const sw = document.createElement("div");
  sw.style.cssText = "padding:8px 10px";
  // ONE color control (Josh 2026-08-15: swatch shortcuts were noise) — a
  // full-width picker showing the track's current color as its face
  const custom = document.createElement("input");
  custom.type = "color";
  custom.value = /^#[0-9a-fA-F]{6}$/.test(trackColor(ti)) ? trackColor(ti) : "#888888";
  custom.style.cssText = "display:block;width:100%;height:38px;padding:0;border:2px solid var(--grid);border-radius:7px;background:none";
  custom.setAttribute("aria-label", "Track color");
  custom.addEventListener("input", () => { // no rebuild: it would kill the picker mid-drag
    tr.color = custom.value;
    saveVoices();
    renderTrackbar(); buildScoreModel(); draw();
  });
  sw.appendChild(custom);
  menu.appendChild(sw);
  if (isComposition() && S.song.tracks.length > 1) { // compositions can shed a track
    const del = document.createElement("button");
    del.className = "fitem";
    del.style.color = "#e66767";
    const live = tr.notes.filter(n => !n.gone).length;
    del.textContent = "✕ Delete track" + (live ? " (" + live + " notes)" : "");
    let armed = false;
    del.addEventListener("click", () => {
      if (!armed) { armed = true; del.textContent = "✕ Really delete " + (tr.name || "track") + "? Tap again"; return; }
      pushUndo({kind: "trackInsert", ti, track: S.song.tracks[ti], raw: S.song.rawNotes ? S.song.rawNotes[ti] : null, state: S.trackState[ti]});
      S.song.tracks.splice(ti, 1);
      if (S.song.rawNotes) S.song.rawNotes.splice(ti, 1);
      S.trackState.splice(ti, 1);
      S.selTrack = Math.max(0, Math.min(S.selTrack, S.song.tracks.length - 1));
      S.multiSel = []; S.multiSelKey = new Set(); S.selNote = null;
      menu.classList.remove("on");
      saveDraft();
      renderTrackbar(); buildScoreModel(); updateTrackGains(); computeSongEnd(); draw();
      requestAnimationFrame(renderTrackbar); // second pass: chip wrap settles (iPad left ＋ stranded on row 2)
      setInfo("track deleted — one ⟲ (⌘Z) brings it back; Save is what makes it permanent");
    });
    menu.appendChild(del);
  }
}
export function buildGameVoicePicker(ti, menu, tr, cur, renderToken) { // GAME_FAMILY: renderGameInstNav shared with File → 🎛 Instruments…; a tap assigns + auditions
  const nav = {sys: S.voiceMenuGameSys, game: S.voiceMenuGameVault, sub: S.voiceMenuGameSub};
  const curInfo = parseGameVoice(cur);
  // an OLD annotation's game: voice has no console folder (Josh's Ambush
  // report, 2026-09-29) — compare resolved vaults + instrument ids, never
  // the raw voice string against a freshly-built one (gameVoiceId always
  // uses the album's CURRENT vault, which an old voice string never
  // matches). resolvedGameVaultSync stays synchronous here on purpose — see
  // its own comment for the render race an earlier, awaited version of this
  // reopened.
  const curVault = curInfo ? resolvedGameVaultSync(curInfo.vault) : null;
  const isCurrentVoice = (g, inst) => !!curInfo && curInfo.instId === inst.id && g.vault.replace(/\/$/, "") === curVault;
  renderGameInstNav(menu, nav, {
    rowFactory: (label, onClick, dim) => {
      const b = document.createElement("button");
      b.className = "fitem";
      if (dim) b.style.color = "var(--dim)";
      b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    },
    instrumentLabel: (label, inst, g) => (isCurrentVoice(g, inst) ? "✓ " : "   ") + label,
    gamesListLabel: GAME_FAMILY,
    backLabelAtTop: "Instruments",
    onBackAtTop: () => { S.voiceMenuGroup = null; buildVoiceMenu(ti); },
    onInstrument: (g, lib, inst) => {
      const voiceId = gameVoiceId(g, inst);
      S.song.tracks[ti].voice = voiceId;
      gameVoiceFromSet(voiceId, nav.sub); // remember the song it came from, for the drill-down next time
      gameVoiceLabels.set(voiceId, g.title + " · " + (inst.nameGuess || inst.id)); // known now — no id-fallback flash
      saveVoices();
      instAudition(g.vault, lib, inst).catch(e => setInfo("⚠ " + e.message)); // audition once, like any other pick
      buildVoiceMenu(ti);
    },
    onNavigate: () => { S.voiceMenuGameSys = nav.sys; S.voiceMenuGameVault = nav.game; S.voiceMenuGameSub = nav.sub; buildVoiceMenu(ti); },
    // every navigation, pick, or family switch calls buildVoiceMenu() again,
    // which bumps voiceMenuRenderToken (see its own declaration) — so this
    // alone is a strictly stronger "has the user left this render" check
    // than comparing sys/game/sub, which only caught a CHANGED nav, not a
    // second concurrent render of the SAME one (the render-race Josh's
    // Ambush report exposed)
    isCurrent: () => S.voiceMenuRenderToken === renderToken,
  }).then(() => {
    if (S.voiceMenuRenderToken !== renderToken) return; // a later render already took over this menu
    // whichever level just drew, if it's the leaf list holding the track's
    // current pick, the ✓ row is marked already (instrumentLabel above) —
    // bring it into view too, so reopening the menu doesn't leave it scrolled
    // off (Josh, 2026-09-29: it "really needs to" drill back to his pick)
    const row = [...menu.querySelectorAll(".fitem")].find(b => b.textContent.startsWith("✓ "));
    if (row && row.scrollIntoView) row.scrollIntoView({block: "nearest"});
  }).catch(e => setInfo("⚠ " + e.message));
}
// Josh, 2026-09-29: picking a Final Fantasy IV instrument, closing the menu,
// then reopening it landed back at the systems list instead of where he'd
// drilled to — "it really needs to" go straight back. Resolves the track's
// current game: voice (through resolveGameVault, so a pre-archive-reorg
// voice with no console folder still matches) to {sys, game, sub: "all"} and
// jumps the (already-open, already at the systems list) menu straight there.
// Async — instAlbums()/resolveGameVault are a network/CATALOG read — so it's
// guarded against the track's voice or the open menu having moved on by the
// time it resolves, the same way gameVoiceLabel's own async fill guards
// against a stale rebuild.
export async function openGameVoiceMenuTo(ti, voiceId) {
  const info = parseGameVoice(voiceId);
  if (!info) return;
  const realVault = await resolveGameVault(info.vault);
  const games = await instAlbums();
  const g = games.find(x => x.vault.replace(/\/$/, "") === realVault);
  if (!g) return; // an unpublished/unknown vault: stay at the systems list rather than drill nowhere
  if (S.voiceMenuTi !== ti || !document.getElementById("voicemenu").classList.contains("on")) return; // the menu moved on
  if ((S.song.tracks[ti].voice || "auto") !== voiceId) return; // the pick changed before this resolved
  // …and into the SONG it was picked from when this device remembers one; an
  // instrument used in exactly one song goes there too; else the A–Z list
  // (Josh: "it would be ideal" to land on the song, not just the album)
  let sub = "all";
  const from = gameVoiceFrom(voiceId);
  if (from && g.songs.some(([, p]) => p === from.path)) sub = from;
  else {
    try {
      const lib = await instLibrary(g.vault), inst = lib.instruments.find(i => i.id === info.instId);
      const rows = inst ? g.songs.filter(([t, p]) => gameInstUsedBySong(inst, t, p)) : [];
      if (rows.length === 1) sub = {title: rows[0][0], path: rows[0][1]};
    } catch (e) { /* library unreachable: the A–Z list */ }
    if (S.voiceMenuTi !== ti || (S.song.tracks[ti].voice || "auto") !== voiceId) return;
  }
  S.voiceMenuGameSys = g.sys; S.voiceMenuGameVault = g; S.voiceMenuGameSub = sub;
  buildVoiceMenu(ti);
}
// SF2_FAMILY's own small 2-level nav (font -> its presets) — the SAME calling
// convention as renderGameInstNav (rowFactory/onNavigate/isCurrent/backLabelAtTop)
// so a caller reads the same way, but its own function: a soundfont has no
// per-song "used in which songs" concept to browse by, only presets, so there is
// no shared level logic to parameterise here, just a shared STYLE.
export async function renderSf2Nav(container, nav, opts) {
  // opts: rowFactory(label, onClick, dim) -> element; presetLabel(label, preset, font) -> label;
  // onPreset(font, slug, preset); onNavigate(); isCurrent(); fontsListLabel (the level-2
  // back button's text); backLabelAtTop/onBackAtTop (leaves this family for its own list)
  const go = () => { const p = opts.onNavigate(); if (p && p.catch) p.catch(e => setInfo("⚠ " + e.message)); };
  if (!nav.slug) { // level 1: which loaded soundfont
    if (opts.backLabelAtTop) container.appendChild(opts.rowFactory("‹ " + opts.backLabelAtTop, opts.onBackAtTop, true));
    const fonts = sf2Registry();
    if (!fonts.length) { container.appendChild(opts.rowFactory("No SoundFonts loaded yet — File → Import… an .sf2.", () => {}, true)); return; }
    for (const f of fonts) container.appendChild(opts.rowFactory((f.name || f.slug) + " ›", () => { nav.slug = f.slug; go(); }));
    return;
  }
  // level 2: that font's presets, bank:program name, natural sort
  container.appendChild(opts.rowFactory("‹ " + opts.fontsListLabel, () => { nav.slug = null; go(); }, true));
  const loading = opts.rowFactory("loading presets…", () => {}, true);
  container.appendChild(loading);
  let font;
  try { font = await sf2Font(nav.slug); }
  catch (err) { if (opts.isCurrent()) { loading.remove(); container.appendChild(opts.rowFactory("⚠ couldn't load: " + err.message, () => {}, true)); } return; }
  if (!opts.isCurrent()) return;
  loading.remove();
  const rows = font.presets.slice()
    .sort((a, b) => (a.bank + ":" + a.program).localeCompare(b.bank + ":" + b.program, undefined, {numeric: true}))
    .map(p => ({preset: p, label: p.bank + ":" + p.program + "  " + p.name}));
  if (!rows.length) { container.appendChild(opts.rowFactory("No presets in " + (font.name || nav.slug) + ".", () => {}, true)); return; }
  for (const {preset, label} of rows) container.appendChild(opts.rowFactory(opts.presetLabel(label, preset, font), () => opts.onPreset(font, nav.slug, preset), false));
}
export async function sf2AuditionPreset(font, preset) { // instAudition's own shape, but no vault fetch — the whole font (every sample it needs) is already decoded
  ensureAudio(); await resumeAudio(); openMaster();
  const P = await instPlayer();
  const keys = instKeys(preset); // a preset has no "kind"/"keysPlayed" of its own: the melodic default (root/fifth/octave around middle C)
  let t = S.audio.currentTime + 0.05;
  for (const key of keys) {
    const pcm = P.playNote(preset, font.samples, {key, vel: 100, hold: 0.3, sampleRate: S.audio.sampleRate, tail: 1.5});
    if (!pcm.length) continue;
    let peak = 0; for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    if (peak > 0.9) for (let i = 0; i < pcm.length; i++) pcm[i] *= 0.9 / peak; // an audition never clips, whatever the driver's own scale
    const buf = S.audio.createBuffer(1, pcm.length, S.audio.sampleRate);
    buf.copyToChannel(pcm, 0);
    const src = S.audio.createBufferSource(); src.buffer = buf; src.connect(S.master); src.start(t);
    t += 0.38;
  }
}
export function buildSf2VoicePicker(ti, menu, tr, cur) { // SF2_FAMILY: renderSf2Nav; a tap assigns + auditions, same contract as buildGameVoicePicker
  const nav = {slug: S.voiceMenuSf2Slug};
  const slug0 = nav.slug; // frozen: a stale async fill from a nav the user already left must not append
  renderSf2Nav(menu, nav, {
    rowFactory: (label, onClick, dim) => {
      const b = document.createElement("button");
      b.className = "fitem";
      if (dim) b.style.color = "var(--dim)";
      b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    },
    presetLabel: (label, preset) => (cur === sf2VoiceId(nav.slug, preset.bank, preset.program) ? "✓ " : "   ") + label,
    fontsListLabel: SF2_FAMILY,
    backLabelAtTop: "Instruments",
    onBackAtTop: () => { S.voiceMenuGroup = null; buildVoiceMenu(ti); },
    onPreset: (font, slug, preset) => {
      const voiceId = sf2VoiceId(slug, preset.bank, preset.program);
      S.song.tracks[ti].voice = voiceId;
      sf2VoiceLabels.set(voiceId, (font.name || slug) + " · " + preset.name); // known now — no id-fallback flash
      saveVoices();
      sf2AuditionPreset(font, preset).catch(e => setInfo("⚠ " + e.message)); // audition once, like any other pick
      buildVoiceMenu(ti);
    },
    onNavigate: () => { S.voiceMenuSf2Slug = nav.slug; buildVoiceMenu(ti); },
    isCurrent: () => S.voiceMenuTi === ti && S.voiceMenuGroup === SF2_FAMILY && S.voiceMenuSf2Slug === slug0,
  }).catch(e => setInfo("⚠ " + e.message));
}
export function buildClipControls(ti, menu, tr) { // the audio track's sheet: what, where, and placement of ONE piece
  const ci = S.selClip && S.selClip.ti === ti && tr.clips[S.selClip.ci] ? S.selClip.ci : 0;
  const c = tr.clips[ci];
  S.selClip = {ti, ci};
  const line = (txt, dim) => {
    const d = document.createElement("div");
    d.style.cssText = "padding:4px 10px;font-family:var(--mono);font-size:0.6875rem;color:" + (dim ? "var(--dim)" : "var(--text)") + ";white-space:normal";
    d.textContent = txt;
    menu.appendChild(d);
    return d;
  };
  line((tr.clips.length > 1 ? "piece " + (ci + 1) + " of " + tr.clips.length + " · " : "") + c.file +
       (c.dur ? " · plays " + fmtSec(clipLen(c)) + " of " + fmtSec(c.dur) : "") + " · " +
       (clipStatusText(c) || (c.where === "folder" ? "in your folder" : c.where === "repo" ? "in the repo" : "on this device only — Save puts it with the song")));
  if (tr.clips.length > 1) { // step between pieces without leaving the sheet
    const pr = document.createElement("div");
    pr.style.cssText = "display:flex;gap:4px;padding:2px 10px";
    for (const [txt, d] of [["‹ prev piece", -1], ["next piece ›", 1]]) {
      const b = document.createElement("button");
      b.textContent = txt;
      b.style.cssText = "flex:1;min-height:34px;font-size:0.75rem";
      b.disabled = ci + d < 0 || ci + d >= tr.clips.length;
      b.addEventListener("click", () => { S.selClip = {ti, ci: ci + d}; buildVoiceMenu(ti); draw(); });
      pr.appendChild(b);
    }
    menu.appendChild(pr);
  }
  const row = (label, btns) => {
    const r = document.createElement("div");
    r.style.cssText = "display:flex;align-items:center;gap:4px;padding:4px 10px";
    const l = document.createElement("span");
    l.style.cssText = "font-size:0.6875rem;color:var(--dim);flex:none;width:64px";
    l.textContent = label;
    r.appendChild(l);
    for (const [txt, fn] of btns) {
      const b = document.createElement("button");
      b.textContent = txt;
      b.style.cssText = "flex:1;min-height:36px;padding:2px 4px;font-size:0.75rem";
      b.addEventListener("click", () => { fn(); buildVoiceMenu(ti); });
      r.appendChild(b);
    }
    menu.appendChild(r);
  };
  const bt = barTicks(), qt = beatTicks();
  const set = patch => setClipDir(ti, ci, patch);
  row("starts " + fmtBarBeat(c.at), [
    ["◀ bar", () => set({at: Math.max(0, c.at - bt)})],
    ["◀ beat", () => set({at: Math.max(0, c.at - qt)})],
    ["beat ▶", () => set({at: c.at + qt})],
    ["bar ▶", () => set({at: c.at + bt})]]);
  row("offset " + c.offset.toFixed(3) + "s", [
    ["−100ms", () => set({offset: Math.max(0, c.offset - 0.1)})],
    ["−10ms", () => set({offset: Math.max(0, c.offset - 0.01)})],
    ["+10ms", () => set({offset: c.offset + 0.01})],
    ["+100ms", () => set({offset: c.offset + 0.1})]]);
  const st = Math.round(S.song.ppq / 4); // a 16th: where "the a of 1" lives
  row("16ths", [
    ["◀ 16th", () => set({at: Math.max(0, c.at - st)})],
    ["16th ▶", () => set({at: c.at + st})]]);
  const align = document.createElement("button");
  align.className = "fitem";
  align.textContent = "⇤ Align first sound to the start";
  align.title = "trims leading silence: the first audible sample lands on the piece's bar.beat (imports do this on arrival)";
  align.disabled = !c.peaks;
  align.addEventListener("click", () => {
    const sec = clipOnsetSec(c);
    if (sec === null) return;
    set({offset: sec, len: c.len ? +Math.max(0.05, c.len - (sec - c.offset)).toFixed(3) : null});
    setInfo("first sound was " + sec.toFixed(3) + "s in — it now lands on " + fmtBarBeat(c.at));
    buildVoiceMenu(ti);
  });
  menu.appendChild(align);
  { // ♩ tempo from this take: candidates appear on request; a tap writes the song's tempo
    const tb = document.createElement("button");
    tb.className = "fitem";
    tb.textContent = "♩ Tempo from this take";
    tb.title = "reads the beat spacing of this piece; tap a candidate to make it the song's tempo (one undo undoes)";
    tb.disabled = !c.peaks || !(isComposition() || isLocalDraft());
    tb.addEventListener("click", () => {
      const t = clipTempo(c);
      const rowEl = document.createElement("div");
      rowEl.style.cssText = "padding:2px 10px 6px";
      if (t.err) { rowEl.style.cssText += ";font-size:0.6875rem;color:var(--dim)"; rowEl.textContent = "♩ " + t.err; }
      else {
        const lbl = document.createElement("div");
        lbl.style.cssText = "font-size:0.6875rem;color:var(--dim);padding-bottom:4px";
        lbl.textContent = "≈ " + t.bpm + " BPM (" + t.level + " read) · song is " + Math.round(6e7 / S.song.tempos[0].usq * 10) / 10 + " · or half / double:";
        rowEl.appendChild(lbl);
        const btns = document.createElement("div");
        btns.style.cssText = "display:flex;gap:4px";
        for (const v of [t.bpm, t.alts[0], t.alts[1]]) {
          const b = document.createElement("button");
          b.textContent = "set " + v;
          b.style.cssText = "flex:1;min-height:36px;font-size:0.75rem" + (v === t.bpm ? ";font-weight:bold" : "");
          b.addEventListener("click", () => { if (setSongTempo(v)) setInfo("song tempo set to " + v + " BPM from " + c.file + " — one undo undoes it"); buildVoiceMenu(ti); });
          btns.appendChild(b);
        }
        rowEl.appendChild(btns);
      }
      tb.replaceWith(rowEl);
    });
    menu.appendChild(tb);
  }
  { // ♩♩ beat map: the grid follows the take, bar by bar; shown first, applied on request
    const bm = document.createElement("button");
    bm.className = "fitem";
    bm.textContent = "♩♩ Map the bars to this take";
    bm.title = "finds the beats in this piece and writes one tempo per bar so every bar line lands on a downbeat it heard (one undo undoes)";
    bm.disabled = !c.peaks || !(isComposition() || isLocalDraft());
    let shift = 0;
    const show = () => {
      const m = clipBeatMap(c, shift);
      const box = document.createElement("div");
      box.style.cssText = "padding:2px 10px 6px";
      if (m.err) { box.style.cssText += ";font-size:0.6875rem;color:var(--dim)"; box.textContent = "♩♩ " + m.err; bm.replaceWith(box); return; }
      const lbl = document.createElement("div");
      lbl.style.cssText = "font-size:0.6875rem;color:var(--dim);padding-bottom:4px;white-space:normal";
      lbl.textContent = "found " + m.bars.length + " bar" + (m.bars.length === 1 ? "" : "s") + " · " + m.bpmRange[0] + "–" + m.bpmRange[1] +
        " BPM (median " + m.median + ", " + m.conf + " read)" + (m.offBars ? " · ⚠ " + m.offBars + " bar" + (m.offBars === 1 ? " looks" : "s look") + " off — try a downbeat shift" : "") +
        " · first downbeat " + m.firstBeatSec.toFixed(2) + "s into the piece" + (m.firstBeatSec > 0.12 ? " (⚠ not at its start — a pickup? shift, or trim the piece to the downbeat)" : "");
      const btns = document.createElement("div");
      btns.style.cssText = "display:flex;gap:4px";
      for (const [txt, fn, bold] of [
        ["◀ downbeat", () => { shift--; redo(); }],
        ["Apply " + m.bars.length + " bars", () => {
          const err = applyBeatMap(ti, ci, m);
          setInfo(err ? err : "bars mapped to " + c.file + ": " + m.bars.length + " tempo changes from bar " + (c.at / barTicks() + 1) + " — one undo undoes them");
          buildVoiceMenu(ti);
        }, true],
        ["downbeat ▶", () => { shift++; redo(); }]]) {
        const b = document.createElement("button");
        b.textContent = txt;
        b.style.cssText = "flex:1;min-height:36px;font-size:0.75rem" + (bold ? ";font-weight:bold" : "");
        b.addEventListener("click", fn);
        btns.appendChild(b);
      }
      box.append(lbl, btns);
      const cur = document.getElementById("beatmapbox");
      if (cur) cur.replaceWith(box); else bm.replaceWith(box);
      box.id = "beatmapbox";
    };
    const redo = () => show();
    bm.addEventListener("click", show);
    menu.appendChild(bm);
  }
  const cutRow = document.createElement("div");
  cutRow.style.cssText = "display:flex;gap:4px;padding:2px 10px";
  for (const [txt, title, fn] of [
    ["✂ Split at cursor", "two pieces from one, at the play cursor (put it inside the piece first)", () => { splitSelectedClipAtCursor(); buildVoiceMenu(ti); }],
    ["🗑 Remove piece", "this piece goes; the track and its other pieces stay", () => { deleteClip(ti, ci); if (tr.clips && tr.clips.length) { S.selClip = {ti, ci: Math.min(ci, tr.clips.length - 1)}; buildVoiceMenu(ti); } else document.getElementById("voicemenu").classList.remove("on"); }]]) {
    const b = document.createElement("button");
    b.textContent = txt; b.title = title;
    b.style.cssText = "flex:1;min-height:36px;font-size:0.75rem";
    b.addEventListener("click", fn);
    cutRow.appendChild(b);
  }
  menu.appendChild(cutRow);
  line("Trim: in Select, drag a piece's left or right edge in the Tracks view (left keeps the sound in place).", true);
  if (/\.(m4a|mp4|aac|mp3)$/i.test(c.file))
    line("m4a/mp3: browsers trim the encoder's lead-in differently, so the same file can start 20–50 ms apart on Safari vs Chrome. Millisecond alignment is honest only for WAV/AIFF.", true);
  const loc = document.createElement("button");
  loc.className = "fitem";
  loc.textContent = (c.local ? "☑" : "☐") + " someone else's recording — never upload it";
  loc.title = "a band's track you play along with stays on this device or in your folder; it is never sent to GitHub";
  loc.addEventListener("click", () => { // the rule is per FILE: every piece of it flips together
    writeClips(ti, tr.clips.map(x => x.file === c.file ? {...x, local: !c.local} : x));
    buildVoiceMenu(ti);
  });
  menu.appendChild(loc);
  const rep = document.createElement("button");
  rep.className = "fitem";
  rep.textContent = "Replace file…";
  rep.addEventListener("click", () => { S.audioReplaceTi = ti; document.getElementById("audioinput").click(); });
  menu.appendChild(rep);
  const kp = document.createElement("button"); // device pref: pitch kept (default) vs tape-style
  kp.className = "fitem";
  kp.textContent = (keepPitch() ? "☑" : "☐") + " keep pitch when the speed changes (off = tape-style, slower = lower)";
  kp.title = "the slowed take is re-rendered so its pitch stays put — a moment to prepare per take; tape-style follows the slider like chip audio";
  kp.addEventListener("click", () => {
    if (keepPitch()) localStorage.setItem("ff1roll-tapestyle", "1"); else localStorage.removeItem("ff1roll-tapestyle");
    stretchCache.clear();
    if (S.playing) { const at = playSec(); stop(); play(at, {noCountIn: true}).catch(() => {}); } else stretchEnsureAll();
    buildVoiceMenu(ti);
  });
  menu.appendChild(kp);
}
// Sync read of resolveGameVault, for the voice menu's per-row "is this the
// current pick" comparison — fills in async and refreshes the open menu once
// known, the SAME "fall back until known" contract as gameVoiceLabel/
// sf2VoiceLabel. Kept synchronous on the CALLER's side deliberately:
// buildGameVoicePicker races against a SECOND buildVoiceMenu() call when the
// menu auto-drills on open (openGameVoiceMenuTo calls buildVoiceMenu once for
// the systems list, then again once it resolves where to drill) — gating
// buildGameVoicePicker's own render on a new top-level await reopened that
// race (an old vault's leaf list appeared ON TOP OF the stale systems list,
// only under the full test suite's timing, not in isolation). The fallback
// (the raw idVault) already matches directly for an ALREADY-current vault —
// the common case — so only an old, pre-reorg vault ever shows unmarked for
// one render before the refresh catches it up.
export const gameVaultResolved = new Map(); // idVault -> resolved current vault
export function resolvedGameVaultSync(idVault) {
  if (gameVaultResolved.has(idVault)) return gameVaultResolved.get(idVault);
  resolveGameVault(idVault).then(v => {
    gameVaultResolved.set(idVault, v);
    if (S.voiceMenuTi >= 0 && document.getElementById("voicemenu").classList.contains("on")) buildVoiceMenu(S.voiceMenuTi);
  }).catch(() => {});
  return idVault;
}

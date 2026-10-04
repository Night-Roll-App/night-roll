import { chipActive } from "../audio/chip.js";
import { S } from "../state.js";
import { chipHas } from "../audio/chip.js";
import { voiceType } from "../audio/voices.js";
import { VOICES } from "../audio/voices.js";

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

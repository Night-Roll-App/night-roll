import { CONSOLE_OF } from "../platform/storage.js";
import { draftKeys } from "../model/versions.js";
import { isCaptureKey } from "../model/provenance.js";
import { S } from "../state.js";
import { titleCaseSlug } from "../model/catalog.js";

// "Replace file…" from a clip sheet targets this track
// Streamed-audio containers Night Roll cannot read as notes, by name only —
// no game table (CLAUDE.md): GENH (vgmstream's generic-header wrapper around
// a raw PCM/ADPCM stream, e.g. Zophar's Ico "PSF2" pack) and Ubisoft's own
// SShd/SSbd stream container (XIII) — both settled against real files,
// docs/plans/ps2.md "Findings (milestone 1)". Neither carries sequence
// (note) data at all, so a mini/lib PSF2 reader would never help here.
export function streamedAudioMagic(b) {
  const s = (o, n) => b.length >= o + n && String.fromCharCode(...b.subarray(o, o + n));
  return s(0, 4) === "GENH" || s(0, 4) === "SShd";
}
export function audioMagic(b) { // wav / aiff / mp3 / m4a-mp4 / flac / ogg by their first bytes
  const s = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  if (b.length < 12) return false;
  if (s(0, 4) === "RIFF" && s(8, 4) === "WAVE") return true;
  if (s(0, 4) === "FORM" && /^AIF[FC]$/.test(s(8, 4))) return true;
  if (s(0, 3) === "ID3") return true;
  if (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) return true; // MPEG frame sync
  if (s(4, 4) === "ftyp") return true;
  if (s(0, 4) === "fLaC" || s(0, 4) === "OggS") return true;
  return false;
}
// SoundFont 2: RIFF + 'sfbk' at byte 8 (a WAV is RIFF + 'WAVE' — the same container,
// a different four-char type tag right after the size, so this must run before
// audioMagic would otherwise be tempted to guess by RIFF alone)
export function sf2Magic(b) {
  if (b.length < 12) return false;
  const s = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  return s(0, 4) === "RIFF" && s(8, 4) === "sfbk";
}
export function impDirFor(kind) { return "albums/" + (CONSOLE_OF[kind] || "imports") + "/"; }
// a capture's folder: albums/<console>/<game>/
export function importDraftKeys() { return draftKeys().filter(isCaptureKey); }
export function impTrackKey(slug, n) { return impDirFor(S.nsfSess && S.nsfSess.chip) + slug + "/track-" + String(n).padStart(2, "0") + ".mid"; }
// display name for a committed import: the typed title verbatim ("Dr. Wily's
// Castle") — a bare slug just gets prettified ("airship" -> "Airship")
export function impDisplayTitle(d, base) {
  const t = d && d.title;
  if (!t) return titleCaseSlug(base);
  return /^[a-z0-9-]+$/.test(t) ? titleCaseSlug(t) : t;
}
// ---- captures as jobs: Capture all and a single row both run inside one;
// the panel keeps painting its rows (hidden or not), the ⏳ list shows the
// same items, and a reload marks a dead run interrupted with its counts.
export function impTrackLabel(e) { return (e && (e.title || e.name)) || ("track " + (e ? e.n : "?")); }

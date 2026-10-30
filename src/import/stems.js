// src/import/stems.js — Stems + notes from a recording (docs/plans/stem-splitter.md
// §5; bridge side vendor/ai/bridge/stems.mjs, contract vendor/ai/../docs/stems.md).
// One recording goes up to the Mac bridge; Demucs splits it into stems and
// Basic Pitch writes each stem's notes; the app fetches ONE file back
// (song.mid) and opens it as a new device-local draft through the same
// localMidiOpen a dropped .mid uses (D5). The stems themselves stay on the Mac
// until he asks for one (D3) — the result sheet plays, adds or downloads them.
// Learning mode (D4): the Mac writes notes and stem names only — no key, meter,
// marker or bend metas — and nothing here labels anything; counts are facts.
// The job is a footer ⏳ job (JOB_KINDS.stems) so the hub can be closed; the
// recording's bytes stay in memory (S.stemsBytes, never persisted) for the
// optional "recording under the notes" attach — nothing downloads twice.
import { S } from "../state.js";
import { JOB_KINDS } from "../model/jobs.js";
import { jobsFind } from "../model/jobs.js";
import { jobProgress } from "../model/jobs.js";
import { jobStart } from "../ui/sheets.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { askHost } from "../ask/host.js";
import { aiUrlOf, aiHeadersOf } from "../../vendor/ai/web/backends.js";
import { localMidiOpen } from "./hub.js";
import { importAudioFiles } from "./hub.js";
import { parseMidi } from "../midi/parse.js";
import { audioMagic } from "./capture.js";
import { forEachClip } from "../audio/clips.js";
import { audioBytesFor } from "../audio/clips.js";
import { openDraft } from "../session/song.js";
import { slugify } from "../model/provenance.js";

export const STEMS_MODELS = ["htdemucs", "htdemucs_6s", "htdemucs_ft"];
export const STEMS_DRUMS = ["kit", "frame", "off"];
export const STEMS_PRESETS = ["default", "clean", "detail"];
export const STEMS_PREFS_KEY = "nr.stems"; // device-local knobs (UI prefs, not song state — CLAUDE.md)
export const STEMS_NOT_INSTALLED = "stems engine not installed — run bridge/stems/install.sh on the Mac"; // the bridge's own sentence, shown as-is
const STEMS_NO_BRIDGE = "connect the Mac bridge in ✦ AI settings first — the split runs there";

export function stemsPrefs() { // {model, drums, preset, onset, frame, min_note_ms, mix, attach}
  let p = {};
  try { p = JSON.parse(localStorage.getItem(STEMS_PREFS_KEY) || "{}") || {}; } catch (err) { p = {}; }
  return {
    model: STEMS_MODELS.includes(p.model) ? p.model : "htdemucs",
    drums: STEMS_DRUMS.includes(p.drums) ? p.drums : "kit",
    preset: STEMS_PRESETS.includes(p.preset) ? p.preset : "default",
    onset: +p.onset || 0, frame: +p.frame || 0, min_note_ms: +p.min_note_ms || 0, // 0 = the preset's own value
    mix: p.mix !== false, // the whole mix as a fifth track (Q3: ON)
    attach: p.attach !== false, // the recording under the notes in the new song (Q4: ON)
  };
}
export function stemsPrefsSave(patch) {
  const p = {...stemsPrefs(), ...(patch || {})};
  try { localStorage.setItem(STEMS_PREFS_KEY, JSON.stringify(p)); } catch (err) { /* private mode */ }
  return p;
}
export function stemsOptions(p) { // the POST body the bridge bounds (cleanOptions) — attach is the app's own, never sent
  p = {...stemsPrefs(), ...(p || {})};
  const o = {model: p.model, mix: p.mix !== false, drums: p.drums, notes: {preset: p.preset}};
  if (+p.onset > 0) o.notes.onset = +p.onset;
  if (+p.frame > 0) o.notes.frame = +p.frame;
  if (+p.min_note_ms > 0) o.notes.min_note_ms = +p.min_note_ms;
  return o;
}
export function stemsStemNames(model) { return model === "htdemucs_6s" ? ["drums", "bass", "vocals", "other", "guitar", "piano"] : ["drums", "bass", "vocals", "other"]; }
export function stemsItems(o) { // the ⏳ rows: upload, separate, one notes row per stem (+ mix), fetch
  const items = [{label: "upload"}, {label: "separate"}];
  for (const s of stemsStemNames(o.model)) if (!(s === "drums" && o.drums === "off")) items.push({label: "notes " + s, key: s});
  if (o.mix !== false) items.push({label: "notes mix", key: "mix"});
  items.push({label: "fetch notes"});
  return items;
}
export function stemsNewId(d) { // yyyymmdd-hhmmss-xxxx — the bridge's strict id (ID_RE), made here, never a path on the Mac
  d = d || new Date();
  const z = (n, w) => String(n).padStart(w || 2, "0");
  const tail = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(2, 6).padEnd(4, "0");
  return z(d.getFullYear(), 4) + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + "-" + tail;
}
export function stemsSlug(name) { return slugify(String(name || "").replace(/\.[^.]+$/, "")) || "recording"; }

// ---- HTTP: every call carries the app's bridge headers + x-nr-app (the
// stems routes require it, like /v1/apns/register); failures become one
// sentence from the bridge's {error:{message}} when it sent one
function stemsHost() { return askHost(); }
export function stemsUrl(path) { const base = aiUrlOf(stemsHost()); return base ? base + path : ""; }
function stemsHeaders(extra) {
  const host = stemsHost();
  return Object.assign({}, aiHeadersOf(host), {"x-nr-app": (host && host.app) || "night-roll"}, extra || {});
}
async function stemsErr(r, fallback) {
  let j = null; try { j = await r.json(); } catch (err) { /* not json */ }
  const msg = (j && j.error && j.error.message) || fallback || ("the bridge answered " + r.status);
  const e = new Error(msg); e.status = r.status; e.body = j; return e;
}
export async function stemsGet(id) { // → {status, body} ; body null on a non-json answer
  const r = await fetch(stemsUrl("/v1/stems/" + id), {headers: stemsHeaders(), cache: "no-store"});
  let body = null; try { body = await r.json(); } catch (err) { /* none */ }
  return {ok: r.ok, status: r.status, body};
}
export async function stemsPost(id, options) {
  const r = await fetch(stemsUrl("/v1/stems/" + id), {method: "POST", headers: stemsHeaders(), body: JSON.stringify(options || {})});
  if (r.ok) return;
  const e = await stemsErr(r);
  if (r.status === 503 && e.body && e.body.install) e.install = true;
  throw e;
}
export function stemsDelete(id) { return fetch(stemsUrl("/v1/stems/" + id), {method: "DELETE", headers: stemsHeaders()}).catch(() => {}); }
export async function stemsFileBytes(id, name) { // one output file (allow-listed on the Mac) → Uint8Array
  const r = await fetch(stemsUrl("/v1/stems/" + id + "/files/" + name), {headers: stemsHeaders()});
  if (!r.ok) throw await stemsErr(r, "could not fetch " + name);
  return new Uint8Array(await r.arrayBuffer());
}

// ---- .aif/.aiff: the Mac's upload takes wav/mp3/m4a/flac/ogg by magic
// (§4.7 open issue 1) — decoded here, every channel kept (the separator wants
// the stereo original, so not monoWavBytes), written as 16-bit PCM WAV
export function stemsIsAiff(b) { const s = (o, n) => String.fromCharCode(...b.subarray(o, o + n)); return b.length >= 12 && s(0, 4) === "FORM" && /^AIF[FC]$/.test(s(8, 4)); }
export function stemsWavBytes(channels, sampleRate) { // channels: Float32Array[] of equal length
  const chs = channels.length, len = channels[0] ? channels[0].length : 0;
  const out = new Uint8Array(44 + len * chs * 2), dv = new DataView(out.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, "RIFF"); dv.setUint32(4, 36 + len * chs * 2, true); str(8, "WAVE"); str(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, chs, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * chs * 2, true); dv.setUint16(32, chs * 2, true); dv.setUint16(34, 16, true);
  str(36, "data"); dv.setUint32(40, len * chs * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < chs; c++) { const v = Math.max(-1, Math.min(1, channels[c][i])); dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2; }
  return out;
}
export async function stemsToWav(bytes) { // Uint8Array (any format the browser decodes) → Uint8Array WAV, channels kept
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) throw new Error("this browser can't decode .aif — export it as WAV first");
  const oac = new OAC(1, 1, 44100);
  const buf = await new Promise((res, rej) => oac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), res, err => rej(err || new Error("decode failed"))));
  const chans = []; for (let c = 0; c < (buf.numberOfChannels || 1); c++) chans.push(buf.getChannelData(c));
  return stemsWavBytes(chans, buf.sampleRate);
}

function stemsSleep(ms) { return S.stemsPollMs <= 0 ? Promise.resolve() : new Promise(r => setTimeout(r, ms)); } // tests set stemsPollMs = 0 (the vm's clock is virtual)

// ---- the job. Throws (one plain sentence) instead of starting when it can't:
// the hub wiring shows the sentence, the Ask action hands it to the model.
export async function stemsJobStart(file, opts) { // file: {name, bytes: Uint8Array, type}; opts: stemsPrefs-shaped overrides → the job record
  const live = jobsFind("stems", null, true);
  if (live) throw new Error("a split is already running: " + live.title + " " + jobProgress(live) + " — ⏳ in the footer shows it; one at a time on the Mac");
  if (!stemsUrl("")) throw new Error(STEMS_NO_BRIDGE);
  let bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
  if (!audioMagic(bytes)) throw new Error(file.name + " isn't an audio file this browser knows (wav, mp3, m4a, aif, flac)");
  if (stemsIsAiff(bytes)) { setInfo("converting " + file.name + " to WAV for the Mac…"); bytes = await stemsToWav(bytes); }
  const p = {...stemsPrefs(), ...(opts || {})};
  const options = stemsOptions(p);
  const id = stemsNewId(), name = file.name, slug = stemsSlug(name), attach = p.attach !== false;
  S.stemsBytes[id] = {name, bytes, type: file.type || ""};
  const items = stemsItems(options);
  const idx = key => items.findIndex(it => it.key === key);
  const job = jobStart("stems", name, items, async api => {
    const cancelRest = from => { for (let j = from; j < items.length; j++) if (api.job.items[j].st !== "done") api.update(j, {st: "cancelled"}); };
    // 1. upload — fetch has no upload progress, so the row is binary
    api.update(0, {st: "running"});
    const up = await fetch(stemsUrl("/v1/stems/" + id + "/input"), {method: "PUT", headers: stemsHeaders({"content-type": "application/octet-stream", "x-nr-name": name}), body: bytes});
    if (!up.ok) throw await stemsErr(up, up.status === 413 ? "the recording is over the Mac's 300 MB cap" : undefined);
    api.update(0, {st: "done", pct: 1});
    if (api.aborted) { cancelRest(1); api.cancel(); return; }
    // 2. start — 503 install:true carries the bridge's own sentence; 409 names the running job
    api.update(1, {st: "running"});
    await stemsPost(id, options);
    // 3. poll until done / error / cancelled
    for (;;) {
      await stemsSleep(S.stemsPollMs);
      if (api.aborted) { await stemsDelete(id); cancelRest(0); api.cancel(); return; }
      let g; try { g = await stemsGet(id); } catch (err) { continue; } // the Mac keeps working while the tailnet blinks
      const st = g.body || {};
      if (!g.ok) { if (g.status === 404) throw new Error("the Mac lost this job — pick the file again"); continue; }
      if (st.status === "error") throw new Error(st.error || "the engine failed");
      if (st.status === "cancelled") { cancelRest(0); api.cancel(); return; }
      stemsApplyStatus(api, items, idx, st);
      if (st.status === "done") break;
    }
    // 4. the notes: song.mid → a new local draft; the recording attached under it when asked
    const fi = items.length - 1;
    api.update(fi, {st: "running"});
    const mid = await stemsFileBytes(id, "song.mid");
    const parsed = parseMidi(mid.buffer, {trust: true, foreign: true});
    const draftName = slug + "-stems.mid";
    localMidiOpen(parsed, draftName);
    if (attach) await stemsAttach(id, draftName);
    api.update(fi, {st: "done", pct: 1});
    const g2 = await stemsGet(id).catch(() => null);
    const counts = (g2 && g2.body && g2.body.counts) || {};
    api.note(stemsCountsText(counts));
    setInfo("stems + notes of " + name + " opened as a new song (" + stemsCountsText(counts) + ") — ⏳ → Open plays each stem");
  }, {stemsId: id, slug, name, options, attach});
  return job;
}
export function stemsDraftKey(draftName) { return "local/" + slugify(draftName.replace(/\.(midi?|smf|kar|rmi)$/i, "")) + ".mid"; } // localMidiOpen's own key rule
async function stemsAttach(id, draftName) { // the recording under the notes: once localMidiOpen's async openDraft has made the new draft the open song (≤ 5 s), the kept bytes go in as an audio track
  const kept = S.stemsBytes[id], key = stemsDraftKey(draftName);
  if (!kept) return;
  for (let i = 0; i < 100 && S.songKey !== key; i++) await stemsSleep(50);
  if (S.songKey !== key) { setInfo("notes opened; the recording didn't attach (the song wasn't open in time) — ⏳ → Open → + Add as track"); return; }
  S.audioReplaceTi = null;
  try { await importAudioFiles([{name: kept.name, bytes: kept.bytes, type: kept.type}]); } catch (err) { setInfo("notes opened; the recording didn't attach: " + err.message); }
}
function stemsApplyStatus(api, items, idx, st) { // the Mac's {stage, stem, pct} onto the ⏳ rows
  const pct = Math.max(0, Math.min(1, +st.pct || 0));
  const doneTo = n => { for (let j = 1; j < n; j++) if (api.job.items[j].st !== "done") api.update(j, {st: "done", pct: 1}); };
  if (st.stage === "separate") { if (api.job.items[1].st !== "running" || api.job.items[1].pct !== pct) api.update(1, {st: "running", pct}); return; }
  if (st.stage === "notes") {
    const i = idx(st.stem);
    if (i > 0) { doneTo(i); api.update(i, {st: "running", pct}); }
    else doneTo(2);
    return;
  }
  if (st.stage === "write" || st.stage === "done" || st.status === "done") doneTo(items.length - 1);
}
export function stemsCountsText(counts) { // "drums 600 · bass 94 · vocals 379 · other 1219 · mix 1209" — facts, no labels
  const parts = [];
  for (const k of ["drums", "bass", "vocals", "other", "guitar", "piano", "mix"]) if (counts && counts[k] !== undefined && counts[k] !== null) parts.push(k + " " + counts[k]);
  return parts.length ? parts.join(" · ") : "no counts";
}

// Retry (⏳ row ↻): the input is still on the Mac — POST again, no re-upload
export async function stemsJobRetry(job) {
  if (!job.stemsId) { setInfo("pick the file again"); return null; }
  const live = jobsFind("stems", null, true);
  if (live) { setInfo("a split is already running: " + live.title + " — one at a time on the Mac"); return null; }
  const g = await stemsGet(job.stemsId).catch(() => null);
  if (!g || (!g.ok && !(g.body && g.body.input))) { setInfo(job.name + ": the Mac no longer has the recording — pick the file again"); return null; }
  return stemsRerun(job, job.options);
}
function stemsRerun(job, options) { // a new ⏳ row on the same input (the result sheet's Re-run, Retry); counts come from the new run
  const id = job.stemsId, items = stemsItems(options), idx = key => items.findIndex(it => it.key === key);
  const kept = S.stemsBytes[id];
  return jobStart("stems", job.name, items, async api => {
    api.update(0, {st: "done", pct: 1}); // the upload is the Mac's copy
    api.update(1, {st: "running"});
    await stemsPost(id, options);
    for (;;) {
      await stemsSleep(S.stemsPollMs);
      if (api.aborted) { await stemsDelete(id); for (let j = 1; j < items.length; j++) if (api.job.items[j].st !== "done") api.update(j, {st: "cancelled"}); api.cancel(); return; }
      let g; try { g = await stemsGet(id); } catch (err) { continue; }
      const st = g.body || {};
      if (!g.ok) { if (g.status === 404) throw new Error("the Mac lost this job — pick the file again"); continue; }
      if (st.status === "error") throw new Error(st.error || "the engine failed");
      if (st.status === "cancelled") { api.cancel(); return; }
      stemsApplyStatus(api, items, idx, st);
      if (st.status === "done") break;
    }
    const fi = items.length - 1;
    api.update(fi, {st: "running"});
    const mid = await stemsFileBytes(id, "song.mid");
    const draftName = job.slug + "-stems-" + options.model + "-" + options.notes.preset + ".mid"; // its own draft beside the first run's, so he compares both
    localMidiOpen(parseMidi(mid.buffer, {trust: true, foreign: true}), draftName);
    if (job.attach && kept) await stemsAttach(id, draftName);
    api.update(fi, {st: "done", pct: 1});
    const g2 = await stemsGet(id).catch(() => null);
    api.note(stemsCountsText(g2 && g2.body && g2.body.counts));
  }, {stemsId: id, slug: job.slug, name: job.name, options, attach: job.attach});
}

// ---- the result sheet (⏳ → Open): the knobs, the counts, one row per stem
export function stemsSheetOpen(job) {
  S.stemsShown = job.id;
  const p = stemsPrefs();
  document.getElementById("stemstitle").textContent = (job.name || job.title) + "  ·  " + ({running: "⏳ " + jobProgress(job), done: "✓ done", failed: "✗ " + (job.err || "failed"), cancelled: "✕ cancelled"}[job.state] || job.state);
  const o = job.options || stemsOptions(p);
  stemsSheetFill(o, p);
  document.getElementById("stemsresult").innerHTML = "";
  document.getElementById("stemssheet").classList.add("on");
  if (job.stemsId) stemsResultLoad(job).catch(err => { document.getElementById("stemsresult").textContent = "⚠ " + err.message; });
}
function stemsSheetFill(o, p) { // knobs from the job's own options (what made these notes), the attach toggle from the pref
  document.getElementById("stemsmodel").value = o.model || "htdemucs";
  document.getElementById("stemsdrums").value = o.drums || "kit";
  document.getElementById("stemspreset").value = (o.notes && o.notes.preset) || "default";
  document.getElementById("stemsonset").value = (o.notes && o.notes.onset) || "";
  document.getElementById("stemsframe").value = (o.notes && o.notes.frame) || "";
  document.getElementById("stemsminnote").value = (o.notes && o.notes.min_note_ms) || "";
  document.getElementById("stemsmix").checked = o.mix !== false;
  document.getElementById("stemsattach").checked = p.attach !== false;
}
export function stemsSheetRead() { // the knobs as stemsPrefs-shaped values; also saved as the device's defaults
  const v = id => document.getElementById(id).value;
  return stemsPrefsSave({
    model: STEMS_MODELS.includes(v("stemsmodel")) ? v("stemsmodel") : "htdemucs",
    drums: STEMS_DRUMS.includes(v("stemsdrums")) ? v("stemsdrums") : "kit",
    preset: STEMS_PRESETS.includes(v("stemspreset")) ? v("stemspreset") : "default",
    onset: +v("stemsonset") || 0, frame: +v("stemsframe") || 0, min_note_ms: +v("stemsminnote") || 0,
    mix: !!document.getElementById("stemsmix").checked, attach: !!document.getElementById("stemsattach").checked,
  });
}
async function stemsResultLoad(job) {
  const box = document.getElementById("stemsresult");
  box.textContent = "asking the Mac…";
  const g = await stemsGet(job.stemsId);
  if (S.stemsShown !== job.id) return;
  box.innerHTML = "";
  if (!g.ok || !g.body) { box.textContent = g.status === 404 ? "the Mac no longer has this job (inputs are kept 7 days, notes 30)" : "⚠ " + ((g.body && g.body.error && g.body.error.message) || ("the bridge answered " + g.status)); return; }
  const st = g.body;
  S.stemsStatus = st;
  const line = document.createElement("div");
  line.className = "status";
  line.textContent = st.status + (st.status === "running" ? " · " + (st.stage || "") + (st.stem ? " " + st.stem : "") + " " + Math.round((+st.pct || 0) * 100) + "%" : "") + (st.counts ? " · notes: " + stemsCountsText(st.counts) : "") + (st.error ? " · " + st.error : "");
  box.appendChild(line);
  const files = new Set((st.files || []).map(f => f.name));
  for (const stem of [...stemsStemNames(st.options && st.options.model), "mix"]) {
    if (!files.has(stem + ".wav")) continue;
    const row = document.createElement("div");
    row.className = "row stemrow";
    const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = stem + (st.counts && st.counts[stem] !== undefined ? " · " + st.counts[stem] + " notes" : ""); row.appendChild(lbl);
    const btn = (label, fn) => { const b = document.createElement("button"); b.textContent = label; b.addEventListener("click", () => fn(b).catch(err => setInfo("⚠ " + err.message))); row.appendChild(b); };
    btn("▶ Play", b => stemsPlay(job.stemsId, stem, b));
    btn("+ Add as track", async () => { if (!S.song) throw new Error("open the song first"); setInfo("fetching " + stem + ".wav…"); const bytes = await stemsFileBytes(job.stemsId, stem + ".wav"); S.audioReplaceTi = null; await importAudioFiles([{name: stem + ".wav", bytes, type: "audio/wav"}]); });
    btn("↓ Download", async () => { setInfo("fetching " + stem + ".wav…"); const bytes = await stemsFileBytes(job.stemsId, stem + ".wav"); stemsDownload(bytes, job.slug + "-" + stem + ".wav"); });
    box.appendChild(row);
  }
}
async function stemsPlay(id, stem, b) { // stream = fetch → blob URL on an <audio>; the auth header rules out a plain src
  const cur = S.stemsAudio;
  if (cur && cur.stem === stem && cur.id === id) { cur.el.pause(); if (cur.url) URL.revokeObjectURL(cur.url); S.stemsAudio = null; b.textContent = "▶ Play"; return; }
  if (cur) { cur.el.pause(); if (cur.url) URL.revokeObjectURL(cur.url); S.stemsAudio = null; }
  b.textContent = "…";
  const bytes = await stemsFileBytes(id, stem + ".wav");
  const url = URL.createObjectURL(new Blob([bytes], {type: "audio/wav"}));
  const el = document.createElement("audio");
  el.src = url;
  el.addEventListener("ended", () => { if (S.stemsAudio && S.stemsAudio.el === el) { URL.revokeObjectURL(url); S.stemsAudio = null; b.textContent = "▶ Play"; } });
  S.stemsAudio = {id, stem, el, url};
  b.textContent = "■ Stop";
  await el.play();
}
function stemsDownload(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], {type: "audio/wav"}));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function stemsOpenSongClip() { // the open song's first recording — the bytes the Ask action and the hub's second button split
  let clip = null;
  forEachClip(c => { if (!clip && c && c.file) clip = c; });
  return clip;
}
export async function stemsSplitOpenSong(opts) { // → the job; throws with the reason
  if (!S.song) throw new Error("no song is open");
  const clip = stemsOpenSongClip();
  if (!clip) throw new Error("this song has no recording — File → Import → New song from a recording first, or pick a file in Stems + notes");
  const r = await audioBytesFor(S.songKey, clip.file);
  if (!r) throw new Error("the recording " + clip.file + " isn't on this device — open the song once online, or pick the file");
  return stemsJobStart({name: clip.file, bytes: new Uint8Array(r.bytes), type: ""}, opts);
}

export function initStems1() {
  JOB_KINDS.stems = {
    label: j => "Stems · " + j.title,
    open: j => stemsSheetOpen(j),
    retry: j => { stemsJobRetry(j).catch(err => setInfo("⚠ " + err.message)); },
  };
  const status = t => { document.getElementById("importhubstatus").textContent = t; };
  document.getElementById("ihStems").addEventListener("click", () => {
    if (!stemsUrl("")) { status(STEMS_NO_BRIDGE); return; }
    status("choose ONE recording — the Mac splits it into stems and writes their notes…");
    document.getElementById("stemsinput").click();
  });
  document.getElementById("stemsinput").addEventListener("change", async e => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    if (files.length > 1) { status("one recording at a time — the Mac runs one split at a time; pick the first again"); return; }
    try {
      const f = files[0];
      await stemsJobStart({name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), type: f.type});
      status("splitting " + f.name + " on the Mac — ⏳ in the footer shows progress; this panel can be closed. The new song opens when it's done.");
      document.getElementById("importhub").classList.remove("on");
    } catch (err) { status("⚠ " + err.message); }
  });
  document.getElementById("ihStemsOpen").addEventListener("click", async () => {
    try {
      const job = await stemsSplitOpenSong();
      status("splitting " + job.name + " on the Mac — ⏳ in the footer shows progress.");
      document.getElementById("importhub").classList.remove("on");
    } catch (err) { status("⚠ " + err.message); }
  });
  document.getElementById("fileimporthub").addEventListener("click", () => { // the second button only when the open song has a recording
    document.getElementById("ihStemsOpen").style.display = S.song && stemsOpenSongClip() ? "" : "none";
  });
  document.getElementById("stemsclose").addEventListener("click", () => { document.getElementById("stemssheet").classList.remove("on"); S.stemsShown = null; });
  document.getElementById("stemsopen").addEventListener("click", () => {
    const job = S.jobs.find(j => j.id === S.stemsShown);
    if (!job || !job.slug) { setInfo("no song from this job yet"); return; }
    document.getElementById("stemssheet").classList.remove("on");
    openDraft(stemsDraftKey(job.slug + "-stems.mid"));
  });
  document.getElementById("stemsrerun").addEventListener("click", async () => {
    const job = S.jobs.find(j => j.id === S.stemsShown);
    const p = stemsSheetRead();
    if (!job || !job.stemsId) { setInfo("saved as the defaults for the next split"); return; }
    if (jobsFind("stems", null, true)) { setInfo("a split is already running — one at a time on the Mac"); return; }
    document.getElementById("stemssheet").classList.remove("on");
    try { stemsRerun({...job, attach: p.attach}, stemsOptions(p)); setInfo("re-running " + job.name + " with these settings — ⏳ shows progress"); }
    catch (err) { setInfo("⚠ " + err.message); }
  });
}

// src/import/stems.js — Stems + notes from a recording (docs/plans/stem-splitter.md
// §5; bridge side vendor/ai/bridge/stems.mjs, contract vendor/ai/../docs/stems.md).
// One recording goes up to the Mac bridge; Demucs splits it into stems and
// Basic Pitch writes each stem's notes; the app fetches ONE file back
// (song.mid) and opens it as a new device-local draft through the same
// localMidiOpen a dropped .mid uses (D5). The stems themselves stay on the Mac
// until he asks for one (D3) — the result sheet plays, adds or downloads them.
// Learning mode (D4): the Mac writes notes and stem names only — no key, meter,
// marker or bend metas — and nothing here labels anything; counts are facts.
// The job is a footer ⏳ job (JOB_KINDS.stems) so the hub can be closed. One
// runner serves three ways in (stemsRun's mode): start = upload + POST, rerun =
// POST on the Mac's kept input, resume = neither — after a reload the Mac is
// asked first and never told to start again (a re-POST would 409 or run twice).
import { S } from "../state.js";
import { JOB_KINDS } from "../model/jobs.js";
import { jobsFind } from "../model/jobs.js";
import { jobProgress } from "../model/jobs.js";
import { jobStart } from "../ui/sheets.js";
import { jobsDismiss } from "../ui/sheets.js";
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
import { draftStoreKey } from "../platform/storage.js";

export const STEMS_MODELS = ["htdemucs", "htdemucs_6s", "htdemucs_ft"];
export const STEMS_DRUMS = ["kit", "frame", "off"];
export const STEMS_PRESETS = ["default", "clean", "detail"];
export const STEMS_PREFS_KEY = "nr.stems"; // device-local knobs (UI prefs, not song state — CLAUDE.md)
export const STEMS_NOT_INSTALLED = "stems engine not installed — run bridge/stems/install.sh on the Mac"; // the bridge's own sentence, shown as-is
export const STEMS_POLL_GIVE_UP = 15; // consecutive unreachable polls (≈ 30 s at 2 s) before the row fails; the Mac keeps working and ↻ resumes
const STEMS_NO_BRIDGE = "connect the Mac bridge in ✦ AI settings first — the split runs there";
const STEMS_UNREACHABLE = "can't reach the Mac bridge — is it running, and is this device on the tailnet?";

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
export function stemsDraftKey(draftName) { return "local/" + slugify(draftName.replace(/\.(midi?|smf|kar|rmi)$/i, "")) + ".mid"; } // localMidiOpen's own key rule
export function stemsFreeDraftName(base) { // "take-stems" → "take-stems.mid", else "take-stems-2.mid"… — never over a draft he may have edited (untitledKey's rule)
  for (let n = 1; ; n++) {
    const name = base + (n === 1 ? "" : "-" + n) + ".mid";
    if (!localStorage.getItem(draftStoreKey(stemsDraftKey(name)))) return name;
  }
}

// ---- HTTP: every call carries the app's bridge headers + x-nr-app (the
// stems routes require it, like /v1/apns/register); failures become one
// sentence from the bridge's {error:{message}} when it sent one
function stemsHost() { return askHost(); }
export function stemsUrl(path) { const base = aiUrlOf(stemsHost()); return base ? base + path : ""; }
function stemsHeaders(extra) {
  const host = stemsHost();
  return Object.assign({}, aiHeadersOf(host), {"x-nr-app": (host && host.app) || "night-roll"}, extra || {});
}
export function stemsNetErr(err) { // a fetch's own "Failed to fetch" / "Load failed" (Safari) in plain words; everything else as it came
  const m = String(err && err.message || err);
  if (err && err.name === "AbortError") return new Error("cancelled");
  return /failed to fetch|load failed|networkerror|network request failed/i.test(m) ? new Error(STEMS_UNREACHABLE) : (err instanceof Error ? err : new Error(m));
}
async function stemsErr(r, fallback) {
  let j = null; try { j = await r.json(); } catch (err) { /* not json */ }
  const msg = (j && j.error && j.error.message) || fallback || ("the bridge answered " + r.status);
  const e = new Error(msg); e.status = r.status; e.body = j; return e;
}
export async function stemsGet(id) { // → {ok, status, body}; body null on a non-json answer; throws when unreachable
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

// ---- the recording's bytes. A picked File stays a Blob: fetch streams it to
// the PUT and only its first bytes are read for the magic check; the Ask
// action hands Uint8Array bytes it already has. .aif/.aiff: the Mac's upload
// takes wav/mp3/m4a/flac/ogg by magic (§4.7 open issue 1) — decoded here,
// every channel kept (the separator wants the stereo original, so not
// monoWavBytes), written as 16-bit PCM WAV; the one case the whole file is read.
const stemsIsBlob = x => typeof Blob !== "undefined" && x instanceof Blob;
async function stemsHead(body, n) { // the first n bytes of a Blob or Uint8Array
  if (stemsIsBlob(body)) return new Uint8Array(await body.slice(0, n).arrayBuffer());
  return body.subarray(0, n);
}
async function stemsAll(body) { return stemsIsBlob(body) ? new Uint8Array(await body.arrayBuffer()) : body; }
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

// ---- starting. Throws (one plain sentence) instead of starting when it can't:
// the hub wiring shows the sentence, the Ask action hands it to the model.
export async function stemsJobStart(file, opts) { // file: {name, type, blob: Blob} (a picked File) or {name, type, bytes: Uint8Array}; opts: stemsPrefs-shaped overrides → the job record
  const live = jobsFind("stems", null, true);
  if (live) throw new Error("a split is already running: " + live.title + " " + jobProgress(live) + " — ⏳ in the footer shows it; one at a time on the Mac");
  if (!stemsUrl("")) throw new Error(STEMS_NO_BRIDGE);
  let body = file.blob || (file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes));
  const head = await stemsHead(body, 16);
  if (!audioMagic(head)) throw new Error(file.name + " isn't an audio file this browser knows (wav, mp3, m4a, aif, flac)");
  if (stemsIsAiff(head)) { setInfo("converting " + file.name + " to WAV for the Mac…"); body = await stemsToWav(await stemsAll(body)); }
  const p = {...stemsPrefs(), ...(opts || {})};
  const options = stemsOptions(p);
  const id = stemsNewId(), name = file.name, slug = stemsSlug(name);
  S.stemsBytes[id] = {name, type: file.type || "", body};
  return jobStart("stems", name, stemsItems(options), api => stemsRun(api, "start"), {stemsId: id, slug, name, options, attach: p.attach !== false, draftKey: null});
}
// Re-run (the result sheet's button, ↻ on a failed row the Mac still has the
// input for): POST again on the kept input — no re-upload; its own ⏳ row and
// its own draft beside the first, so he compares both. The recording's bytes
// were freed with the first job, so nothing attaches here (the sheet's
// + Add as track does it on demand).
function stemsRerun(job, options) {
  return jobStart("stems", job.name, stemsItems(options), api => stemsRun(api, "rerun"),
    {stemsId: job.stemsId, slug: job.slug, name: job.name, options, attach: false, draftKey: null, draftBase: job.slug + "-stems-" + options.model + "-" + options.notes.preset});
}
// Resume (after a reload: jobsLoad marked the row "interrupted"; or ↻ on it):
// ask the Mac first — done → fetch the notes and finish; running → poll on;
// never POST (it would 409 or start a second separation). A job the Mac no
// longer runs (404 with the input kept, error, cancelled) is only re-POSTed
// when `allowPost` (the ↻ tap); the boot-time pass leaves the row for ↻.
export async function stemsResume(job, allowPost) {
  if (!job.stemsId) { setInfo(job.title + ": pick the file again"); return null; }
  if (jobsFind("stems", null, true)) { setInfo("a split is already running — one at a time on the Mac"); return null; }
  let g;
  try { g = await stemsGet(job.stemsId); } catch (err) { setInfo(job.name + ": " + stemsNetErr(err).message + " — ↻ on the ⏳ row tries again"); return null; }
  // the same guards again, after the await: the boot pass and a ↻ tap on the same row can both be in flight — the second finds the row gone or a runner live and does nothing
  if (jobsFind("stems", null, true) || !S.jobs.some(j => j.id === job.id)) return null;
  const st = (g.body || {});
  if (g.ok && (st.status === "running" || st.status === "done")) {
    jobsDismiss(job.id);
    return jobStart("stems", job.name, stemsItems(job.options || stemsOptions()), api => stemsRun(api, "resume"),
      {stemsId: job.stemsId, slug: job.slug, name: job.name, options: job.options || stemsOptions(), attach: !!job.attach && !!S.stemsBytes[job.stemsId], draftKey: job.draftKey || null});
  }
  const inputKept = (g.ok && st.status) || (g.status === 404 && st.input); // uploaded / error / cancelled, or "uploaded, not started"
  if (!inputKept) { setInfo(job.name + ": the Mac no longer has the recording — pick the file again"); return null; }
  if (!allowPost) { setInfo(job.name + ": the Mac isn't running it" + (st.error ? " (" + st.error + ")" : "") + " — ↻ on the ⏳ row starts it again from the kept recording"); return null; }
  jobsDismiss(job.id);
  return stemsRerun(job, job.options || stemsOptions());
}
export function stemsResumeInterrupted() { // boot: every stems row the reload left "interrupted" asks the Mac; nothing is re-POSTed
  for (const j of S.jobs.slice()) if (j.kind === "stems" && j.state === "interrupted" && j.stemsId) stemsResume(j, false).catch(() => {});
}

// ---- the runner. mode: start (PUT + POST), rerun (POST), resume (poll only).
async function stemsRun(api, mode) {
  const job = api.job, id = job.stemsId, items = job.items, name = job.name;
  const idx = key => items.findIndex(it => it.key === key);
  const fi = items.length - 1;
  const mark = (st, from) => { for (let j = from || 0; j < items.length; j++) if (items[j].st !== "done") api.update(j, {st}); };
  const kept = S.stemsBytes[id];
  try {
    // 1. upload — fetch has no upload progress, so the row is binary; ✕ aborts the request itself
    if (mode === "start") {
      api.update(0, {st: "running"});
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      const watch = ctl ? setInterval(() => { if (api.aborted) ctl.abort(); }, 250) : 0;
      let up;
      try { up = await fetch(stemsUrl("/v1/stems/" + id + "/input"), {method: "PUT", headers: stemsHeaders({"content-type": "application/octet-stream", "x-nr-name": name}), body: kept ? kept.body : new Uint8Array(), ...(ctl ? {signal: ctl.signal} : {})}); }
      finally { if (watch) clearInterval(watch); }
      if (!up.ok) throw await stemsErr(up, up.status === 413 ? "the recording is over the Mac's 300 MB cap" : undefined);
    }
    api.update(0, {st: "done", pct: 1});
    if (api.aborted) { if (mode === "start") await stemsDelete(id); mark("cancelled", 1); api.cancel(); return; } // ✕ right after the upload landed: tell the Mac, so the input doesn't sit there a week
    // 2. start — 503 install:true carries the bridge's own sentence; 409 names the running job
    api.update(1, {st: "running"});
    if (mode !== "resume") await stemsPost(id, job.options);
    // 3. poll until done / error / cancelled; unreachable polls are counted, not fatal, until STEMS_POLL_GIVE_UP in a row
    let errs = 0;
    for (;;) {
      await stemsSleep(S.stemsPollMs);
      if (api.aborted) { await stemsDelete(id); mark("cancelled"); api.cancel(); return; }
      let g;
      try { g = await stemsGet(id); }
      catch (err) { if (++errs >= STEMS_POLL_GIVE_UP) throw new Error(STEMS_UNREACHABLE + " (" + errs + " tries) — the Mac keeps working; ↻ on this row resumes"); continue; }
      const st = g.body || {};
      if (!g.ok) { if (g.status === 404) throw new Error("the Mac lost this job — pick the file again"); if (++errs >= STEMS_POLL_GIVE_UP) throw new Error("the bridge keeps answering " + g.status + " — ↻ on this row resumes"); continue; }
      errs = 0; // only a good answer resets the count: a bridge stuck on 500/401 reaches the give-up too
      if (st.status === "error") throw new Error(st.error || "the engine failed");
      if (st.status === "cancelled") { mark("cancelled"); api.cancel(); return; }
      stemsApplyStatus(api, items, idx, st);
      if (st.status === "done") break;
    }
    // 4. the notes: song.mid → a new local draft on a key nobody holds; the recording attached under it when asked
    api.update(fi, {st: "running"});
    const mid = await stemsFileBytes(id, "song.mid");
    const parsed = parseMidi(mid.buffer, {trust: true, foreign: true});
    const draftName = stemsFreeDraftName(job.draftBase || (job.slug + "-stems"));
    job.draftKey = stemsDraftKey(draftName);
    localMidiOpen(parsed, draftName);
    const skipped = job.attach && kept ? await stemsAttach(kept, job.draftKey) : null;
    api.update(fi, {st: "done", pct: 1}); // persists draftKey too
    const g2 = await stemsGet(id).catch(() => null);
    const counts = (g2 && g2.body && g2.body.counts) || {};
    api.note(stemsCountsText(counts) + (skipped ? " · " + skipped : "")); // the sheet's title line shows the note, so a skipped attach is said there too
    stemsHubRefresh();
    setInfo("stems + notes of " + name + " opened as a new song (" + stemsCountsText(counts) + ")" + (skipped ? " — " + skipped : " — ⏳ → Open plays each stem"));
  } catch (err) {
    if (api.aborted) { // ✕ while the PUT was in flight (the abort rejects the fetch): a cancelled row, not a failed one; the Mac drops a half-written .part itself
      mark("cancelled");
      if (mode === "start") await stemsDelete(id);
      api.cancel();
      return;
    }
    mark("failed");
    throw stemsNetErr(err);
  } finally {
    delete S.stemsBytes[id]; // the recording's bytes are only needed until the attach; a failed row keeps nothing (↻ uses the Mac's copy)
  }
}
// The recording under the notes: once localMidiOpen's async openDraft has made
// THIS job's draft the open song (≤ 5 s), the bytes go in as an audio track.
// The key is checked again right before the import — after the byte read, the
// last await — so a song he switched to in that window never gets it (the
// native review found this; the recording lands on the exact draft or nowhere).
// → null when attached, else the one sentence the note and the sheet carry.
export async function stemsAttach(kept, key) {
  const skip = why => "recording not attached (" + why + ") — ⏳ → Open → + Add as track puts it under the notes";
  for (let i = 0; i < 100 && S.songKey !== key; i++) await stemsSleep(50);
  if (S.songKey !== key) return skip("the new song wasn't open in time");
  let bytes;
  try { bytes = await stemsAll(kept.body); } catch (err) { return skip("couldn't read the recording"); }
  if (S.songKey !== key || !S.song) return skip("another song was opened meanwhile");
  S.audioReplaceTi = null;
  try { await importAudioFiles([{name: kept.name, bytes, type: kept.type}]); } catch (err) { return skip(err.message); }
  return null;
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

// ---- the result sheet (⏳ → Open): the knobs, the counts, one row per stem
export function stemsSheetOpen(job) {
  stemsStopAudio();
  S.stemsShown = job.id;
  const p = stemsPrefs();
  document.getElementById("stemstitle").textContent = (job.name || job.title) + "  ·  " + ({running: "⏳ " + jobProgress(job), done: "✓ done" + (job.note ? " — " + job.note : ""), failed: "✗ " + (job.err || "failed"), cancelled: "✕ cancelled", interrupted: "⚠ interrupted — ↻ in ⏳ asks the Mac"}[job.state] || job.state);
  stemsSheetFill(job.options || stemsOptions(p), p);
  document.getElementById("stemsresult").innerHTML = "";
  document.getElementById("stemssheet").classList.add("on");
  if (job.stemsId) stemsResultLoad(job).catch(err => { document.getElementById("stemsresult").textContent = "⚠ " + stemsNetErr(err).message; });
}
export function stemsSheetClose() { stemsStopAudio(); document.getElementById("stemssheet").classList.remove("on"); S.stemsShown = null; }
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
    const btn = (label, fn) => { // fn runs synchronously inside the click — ▶ Play's <audio> nudge must happen in the gesture itself, not a microtask later
      const b = document.createElement("button"); b.textContent = label;
      b.addEventListener("click", () => { let p; try { p = fn(b); } catch (err) { setInfo("⚠ " + stemsNetErr(err).message); return; } Promise.resolve(p).catch(err => setInfo("⚠ " + stemsNetErr(err).message)); });
      row.appendChild(b); return b;
    };
    const play = btn("▶ Play", b => stemsPlayToggle(job.stemsId, stem, b));
    if (S.stemsAudio && S.stemsAudio.id === job.stemsId && S.stemsAudio.stem === stem) { S.stemsAudio.btn = play; play.textContent = S.stemsAudio.url ? "■ Stop" : "…"; }
    btn("+ Add as track", async () => { if (!S.song) throw new Error("open the song first"); setInfo("fetching " + stem + ".wav…"); const bytes = await stemsFileBytes(job.stemsId, stem + ".wav"); S.audioReplaceTi = null; await importAudioFiles([{name: stem + ".wav", bytes, type: "audio/wav"}]); });
    btn("↓ Download", async () => { setInfo("fetching " + stem + ".wav…"); const bytes = await stemsFileBytes(job.stemsId, stem + ".wav"); stemsDownload(bytes, job.slug + "-" + stem + ".wav"); });
    box.appendChild(row);
  }
}
// ▶ Play: the <audio> is made and nudged (play() on an empty element) INSIDE the
// tap — iOS Safari only lets an element play that a gesture touched; the real
// src (fetch → blob URL — the auth header rules out a plain src) follows the
// await. One stem at a time; the row's label follows what is really happening.
function stemsPlayToggle(id, stem, b) {
  const cur = S.stemsAudio;
  if (cur && cur.id === id && cur.stem === stem) { stemsStopAudio(); return Promise.resolve(); }
  stemsStopAudio();
  const el = document.createElement("audio");
  el.preload = "auto";
  if (typeof el.play === "function") { const unlock = el.play(); if (unlock && unlock.catch) unlock.catch(() => { /* no src yet: expected */ }); }
  S.stemsAudio = {id, stem, el, url: null, btn: b};
  b.textContent = "…";
  if (el.addEventListener) {
    el.addEventListener("ended", () => { if (S.stemsAudio && S.stemsAudio.el === el) stemsStopAudio(); });
    el.addEventListener("pause", () => { if (S.stemsAudio && S.stemsAudio.el === el && S.stemsAudio.url && !el.ended) stemsStopAudio(); });
  }
  return (async () => {
    const bytes = await stemsFileBytes(id, stem + ".wav");
    if (!S.stemsAudio || S.stemsAudio.el !== el) return; // stopped or swapped while fetching
    const url = URL.createObjectURL(new Blob([bytes], {type: "audio/wav"}));
    S.stemsAudio.url = url;
    el.src = url;
    await el.play();
    if (S.stemsAudio && S.stemsAudio.el === el && S.stemsAudio.btn) S.stemsAudio.btn.textContent = "■ Stop";
  })().catch(err => { if (S.stemsAudio && S.stemsAudio.el === el) stemsStopAudio(); throw err; });
}
export function stemsStopAudio() {
  const a = S.stemsAudio;
  if (!a) return;
  S.stemsAudio = null;
  try { if (a.el && typeof a.el.pause === "function") a.el.pause(); } catch (err) { /* already gone */ }
  if (a.url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(a.url);
  if (a.btn) a.btn.textContent = "▶ Play";
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
export function stemsHubRefresh() { // the hub's second button only when the open song has a recording
  document.getElementById("ihStemsOpen").style.display = S.song && stemsOpenSongClip() ? "" : "none";
}

export function initStems1() {
  JOB_KINDS.stems = {
    label: j => "Stems · " + j.title,
    open: j => stemsSheetOpen(j),
    retry: j => { stemsResume(j, true).catch(err => setInfo("⚠ " + stemsNetErr(err).message)); }, // ↻: ask the Mac first; a re-POST only when it isn't running this one
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
      await stemsJobStart({name: f.name, type: f.type, blob: f});
      status("splitting " + f.name + " on the Mac — ⏳ in the footer shows progress; this panel can be closed. The new song opens when it's done.");
      document.getElementById("importhub").classList.remove("on");
    } catch (err) { status("⚠ " + stemsNetErr(err).message); }
  });
  document.getElementById("ihStemsOpen").addEventListener("click", async () => {
    try {
      const job = await stemsSplitOpenSong();
      status("splitting " + job.name + " on the Mac — ⏳ in the footer shows progress.");
      document.getElementById("importhub").classList.remove("on");
    } catch (err) { status("⚠ " + stemsNetErr(err).message); }
  });
  document.getElementById("fileimporthub").addEventListener("click", stemsHubRefresh); // the hub's one open path (hub.js); a song change shows on the next open
  document.getElementById("stemsclose").addEventListener("click", stemsSheetClose);
  document.getElementById("stemsopen").addEventListener("click", () => {
    const job = S.jobs.find(j => j.id === S.stemsShown);
    if (!job || !job.draftKey) { setInfo(job && job.state === "running" ? "the notes are still coming" : "no song from this job yet — ↻ in ⏳ asks the Mac"); return; }
    stemsSheetClose();
    openDraft(job.draftKey);
  });
  document.getElementById("stemsrerun").addEventListener("click", () => {
    const job = S.jobs.find(j => j.id === S.stemsShown);
    const p = stemsSheetRead();
    if (!job || !job.stemsId) { setInfo("saved as the defaults for the next split"); return; }
    if (jobsFind("stems", null, true)) { setInfo("a split is already running — one at a time on the Mac"); return; }
    stemsSheetClose();
    stemsRerun({...job, attach: p.attach}, stemsOptions(p));
    setInfo("re-running " + job.name + " with these settings — ⏳ shows progress");
  });
  // after a reload: jobsLoad (initSheets9, later in main.js) has marked the rows; boot's own song open goes first
  setTimeout(stemsResumeInterrupted, 2000);
}

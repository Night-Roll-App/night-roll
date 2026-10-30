// bridge/stems.mjs — stem separation + notes on the Mac, as a bridge job (docs/stems.md).
// Routes under /v1/stems/* (mounted by server.mjs before its /v1/jobs match): an app uploads one audio file,
// starts a job, polls it, fetches song.mid and the stem WAVs. The work is bridge/py/nr_stems.py in a python venv
// (bridge/stems/install.sh); without that venv POST answers 503 {install: true} and the apps show its sentence.
//
// Rules this file keeps:
// - Auth is the bridge's: tailnet-only, a token when one is set. Every /v1/stems route also wants x-nr-app (400
//   without it, like /v1/apns/register) so a stray tailnet browser cannot start work.
// - The client never names a path. <id> is /^\d{8}-\d{6}-[a-z0-9]{4}$/; the stored extension comes from the
//   magic bytes alone (wav, mp3, m4a, flac, ogg); x-nr-name is a display slug; file names are an allow-list.
// - One id = one upload at a time (409), one job on the Mac at a time (409): RAM and his CPU.
// - The child is spawned detached (its own process group) under taskpolicy -c utility with OMP_NUM_THREADS=4; job.json
//   records pid + pgid, and EVERY kill (cancel, timeout, startup cleanup) is a process-group kill — torch spawns
//   helpers that a kill of the leader alone would orphan.
// - job.json is written on every change; at startup a job still "running" is killed by pgid and marked
//   error "bridge restarted".
// - sweep(now) takes the clock as an argument so a test drives it without waiting.
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";

export const ID_RE = /^\d{8}-\d{6}-[a-z0-9]{4}$/;
export const FILE_RE = /^(?:(?:song|drums|bass|vocals|other|guitar|piano|mix)\.(?:mid|wav)|notes\.json)$/;
export const MODELS = ["htdemucs", "htdemucs_6s", "htdemucs_ft"];
export const STEMS_MAX = 300 * 1024 * 1024; // the same cap as /v1/takes: a 10-min stereo WAV is ~100 MB
export const TIMEOUT_MS = 40 * 60 * 1000; // htdemucs_ft on a 10-min file under taskpolicy -c utility
export const KEEP_WAV_MS = 7 * 86400e3, KEEP_MID_MS = 30 * 86400e3, CAP_BYTES = 10 * 1024 * 1024 * 1024;
export const NOT_INSTALLED = "stems engine not installed — run bridge/stems/install.sh on the Mac";
export const RESTARTED = "bridge restarted";
const TASKPOLICY = "/usr/sbin/taskpolicy";
// The CPU clamp a job runs under. Measured 2026-10-30 on the M1 Max: `-b` (background QoS) pins torch to the two
// efficiency cores and throttles it to ~25% of one core while anything is on screen — a 3-min song would take hours.
// `-c utility` keeps the performance cores available below interactive work (his audio thread) and is the default.
export const POLICIES = {utility: ["-c", "utility"], background: ["-b"], none: null};
const TYPES = {".wav": "audio/wav", ".mid": "audio/midi", ".json": "application/json"};

// The stored extension comes from the file's own first bytes — never from the client's name.
export function audioExt(head) {
  if (head.length < 12) return null;
  const s = (a, b) => head.toString("latin1", a, b);
  if (s(0, 4) === "RIFF" && s(8, 12) === "WAVE") return "wav";
  if (s(0, 4) === "fLaC") return "flac";
  if (s(0, 4) === "OggS") return "ogg";
  if (s(4, 8) === "ftyp") return "m4a";
  if (s(0, 3) === "ID3" || (head[0] === 0xFF && (head[1] & 0xE6) === 0xE2)) return "mp3"; // ID3 tag, or an MPEG-1/2 layer-3 frame sync
  return null;
}
export function slugOf(name) { return String(name || "").toLowerCase().replace(/\.[a-z0-9]{1,5}$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "recording"; }

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
// The options the apps may send, each bounded; anything else is dropped. The script gets them as flags.
export function cleanOptions(b) {
  b = b && typeof b === "object" ? b : {};
  const notes = b.notes && typeof b.notes === "object" ? b.notes : {};
  const range = o => o && typeof o === "object" ? {fmin: num(o.fmin, 0, 0, 20000), fmax: num(o.fmax, 0, 0, 20000)} : null;
  const perStem = {};
  for (const k of ["bass", "vocals", "other", "guitar", "piano", "mix"]) { const r = b.perStem && range(b.perStem[k]); if (r) perStem[k] = r; }
  return {
    model: MODELS.includes(b.model) ? b.model : "htdemucs",
    mix: b.mix !== false,
    drums: ["kit", "frame", "off"].includes(b.drums) ? b.drums : "kit",
    notes: {preset: ["clean", "default", "detail"].includes(notes.preset) ? notes.preset : "default", onset: num(notes.onset, 0, 0, 1), frame: num(notes.frame, 0, 0, 1), min_note_ms: num(notes.min_note_ms, 0, 0, 5000), fmin: num(notes.fmin, 0, 0, 20000), fmax: num(notes.fmax, 0, 0, 20000)},
    perStem,
    fast: b.fast === true,
    device: ["auto", "cpu", "mps"].includes(b.device) ? b.device : "auto", // auto = Metal when torch has it (measured 4x faster, same stems), else cpu
  };
}

export function createStems({dir, py, script, noTaskpolicy = false, policy = "utility", timeoutMs = TIMEOUT_MS, max = STEMS_MAX, log = console.log, now = Date.now}) {
  const clamp = POLICIES[policy] === undefined ? POLICIES.utility : POLICIES[policy];
  fs.mkdirSync(dir, {recursive: true});
  const jobs = new Map(); // id → job (in memory while the bridge runs; job.json is the record)
  const uploading = new Set(); // ids with a .part being written
  const jobDir = id => path.join(dir, id);
  const jobFile = id => path.join(jobDir(id), "job.json");
  const installed = () => !!(py && script && fs.existsSync(py) && fs.existsSync(script));
  const readJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (err) { return null; } };
  const inputOf = id => { let fs_; try { fs_ = fs.readdirSync(jobDir(id)); } catch (err) { return null; } const f = fs_.find(n => /^input\.(wav|mp3|m4a|flac|ogg)$/.test(n)); return f ? path.join(jobDir(id), f) : null; };
  const filesOf = id => { let names = []; try { names = fs.readdirSync(jobDir(id)); } catch (err) { /* none */ } return names.filter(n => FILE_RE.test(n)).sort().map(n => { let bytes = 0; try { bytes = fs.statSync(path.join(jobDir(id), n)).size; } catch (err) { /* gone */ } return {name: n, bytes}; }); };

  function save(job) {
    const f = jobFile(job.id), {child, subs, timer, ...rec} = job; // never the live handles
    try { fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f + ".tmp", JSON.stringify(rec)); fs.renameSync(f + ".tmp", f); } catch (err) { log("stems job.json " + job.id + ": " + err.message); }
    for (const s of job.subs || []) { try { s(); } catch (err) { /* a poller that went away */ } }
  }
  function load(id) {
    let job = jobs.get(id);
    if (job) return job;
    const rec = readJson(jobFile(id));
    if (!rec) return null;
    job = {...rec, subs: new Set(), child: null, timer: null};
    jobs.set(id, job);
    return job;
  }
  function view(job) {
    const {child, subs, timer, pid, pgid, stderr, cancelling, ...v} = job;
    return {...v, files: filesOf(job.id)};
  }
  const running = () => [...jobs.values()].find(j => j.status === "running") || null;
  let starting = null; // the id whose POST body is being read: a second POST in that window is 409 too

  function killGroup(job, sig) { // a group kill by the recorded pgid; ESRCH = already gone
    if (!job.pgid) return false;
    try { process.kill(-job.pgid, sig); return true; } catch (err) { if (err.code !== "ESRCH") log("stems kill " + job.id + ": " + err.message); return false; }
  }
  function end(job, status, error) {
    if (job.status !== "running") return;
    if (job.timer) { clearTimeout(job.timer); job.timer = null; }
    job.status = status; job.ended = now(); if (error) job.error = error; else delete job.error;
    if (status === "done") job.pct = 1;
    job.child = null;
    save(job);
    log(`stems ${job.id} ${status}${error ? ": " + String(error).split("\n")[0].slice(0, 120) : ""}`);
  }

  // At startup: a job left "running" by the last bridge process is dead to us — kill its group, mark it.
  function startupCleanup() {
    let ids = []; try { ids = fs.readdirSync(dir).filter(n => ID_RE.test(n)); } catch (err) { /* empty */ }
    for (const id of ids) {
      const job = load(id);
      if (!job || job.status !== "running") continue;
      killGroup(job, "SIGKILL");
      job.status = "error"; job.error = RESTARTED; job.ended = now(); job.pid = null; job.pgid = null;
      save(job);
    }
  }

  function start(job, options) {
    const input = inputOf(job.id);
    const base = [py, ...(/^python/.test(path.basename(py)) ? ["-I"] : []), script, "--in", input, "--out", jobDir(job.id), "--model", options.model, "--name", job.name, "--json",
      "--drums", options.drums, ...(options.mix ? [] : ["--no-mix"]), "--preset", options.notes.preset, "--device", options.device];
    for (const k of ["onset", "frame", "min_note_ms", "fmin", "fmax"]) if (options.notes[k]) base.push("--" + k.replace(/_/g, "-"), String(options.notes[k]));
    if (Object.keys(options.perStem).length) base.push("--per-stem", JSON.stringify(options.perStem));
    const useTaskpolicy = !options.fast && !noTaskpolicy && clamp && fs.existsSync(TASKPOLICY);
    const [cmd, ...args] = useTaskpolicy ? [TASKPOLICY, ...clamp, ...base] : base;
    const env = {OMP_NUM_THREADS: "4", PYTORCH_ENABLE_MPS_FALLBACK: "1", HF_HUB_OFFLINE: "1"}; // a minimal env, not the bridge's: the child needs no tokens or secrets
    for (const k of ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "HF_HOME", "HF_HUB_CACHE", "XDG_CACHE_HOME"]) if (process.env[k]) env[k] = process.env[k];
    let child;
    try { child = spawn(cmd, args, {detached: true, stdio: ["ignore", "pipe", "pipe"], env}); } catch (err) { return err; }
    Object.assign(job, {status: "running", stage: "separate", pct: 0, stages: [], started: now(), ended: null, counts: null, options, pid: child.pid, pgid: child.pid, child, stderr: []});
    delete job.error; delete job.cancelling; // a Retry after a cancel is a fresh run
    save(job);
    let buf = "", stageAt = now();
    child.stdout.on("data", d => {
      buf += d;
      const lines = buf.split("\n"); buf = lines.pop();
      for (const l of lines) {
        let m; try { m = JSON.parse(l); } catch (err) { continue; } // the engine's own prints are not ours
        if (!m || typeof m !== "object" || Array.isArray(m)) continue;
        if (m.done) { job.counts = m.counts || null; continue; }
        if (m.stage) {
          if (m.stage !== job.stage) { job.stages.push({name: job.stage, secs: Math.round((now() - stageAt) / 1000)}); stageAt = now(); }
          job.stage = m.stage; job.pct = num(m.pct, job.pct, 0, 1); job.stem = m.stem || null;
          save(job);
        }
      }
    });
    child.stderr.on("data", d => { job.stderr.push(...String(d).split("\n")); if (job.stderr.length > 40) job.stderr = job.stderr.slice(-40); });
    child.on("error", err => end(job, "error", "could not start the engine: " + err.message));
    child.on("exit", (code, sig) => {
      if (job.status !== "running") return;
      if (job.cancelling) return end(job, "cancelled");
      if (code === 0) { job.stages.push({name: job.stage, secs: Math.round((now() - stageAt) / 1000)}); job.stage = "done"; return end(job, "done"); }
      end(job, "error", (job.stderr.filter(Boolean).slice(-6).join("\n") || ("the engine exited " + (sig || code))).trim());
    });
    job.timer = setTimeout(() => { if (job.status !== "running") return; killGroup(job, "SIGKILL"); end(job, "error", "took longer than " + Math.round(timeoutMs / 60000) + " min"); }, timeoutMs);
    job.timer.unref && job.timer.unref();
    return null;
  }

  function cancel(job) {
    if (job.status !== "running") return;
    job.cancelling = true;
    killGroup(job, "SIGTERM");
    const hard = setTimeout(() => { if (job.status === "running") { killGroup(job, "SIGKILL"); end(job, "cancelled"); } }, 5000);
    hard.unref && hard.unref();
  }

  const etaMin = job => { const el = now() - (job.started || now()); return job.pct > 0.05 ? Math.max(1, Math.round(el * (1 - job.pct) / job.pct / 60000)) : null; };

  // GET /v1/status carries this; the web status line says "separating <name> 42%".
  function statusField() {
    const r = running();
    return {running: r ? 1 : 0, ...(r ? {id: r.id, name: r.name, stage: r.stage, pct: r.pct} : {})};
  }

  // Disk discipline (the Mac is 90% full): inputs + WAVs go after 7 days, mids + notes + job.json after 30, and
  // the whole tree stays under 10 GB (oldest jobs first). `now` is a parameter so the test needs no clock tricks.
  function sweep(at = now()) {
    let ids = []; try { ids = fs.readdirSync(dir).filter(n => ID_RE.test(n)); } catch (err) { return {removed: 0}; }
    let removed = 0;
    const rm = f => { try { fs.unlinkSync(f); removed++; } catch (err) { /* gone */ } };
    const ages = [];
    for (const id of ids) {
      const d = jobDir(id), rec = readJson(path.join(d, "job.json")), t = (rec && (rec.ended || rec.started || rec.uploaded)) || 0, live = rec && rec.status === "running" && jobs.get(id) && jobs.get(id).child;
      let names = []; try { names = fs.readdirSync(d); } catch (err) { continue; }
      if (!live && t && at - t > KEEP_WAV_MS) for (const n of names) if (/\.(wav|mp3|m4a|flac|ogg|part)$/.test(n)) rm(path.join(d, n));
      if (!live && t && at - t > KEEP_MID_MS) { for (const n of names) rm(path.join(d, n)); try { fs.rmdirSync(d); } catch (err) { /* not empty */ } jobs.delete(id); continue; }
      let bytes = 0; try { for (const n of fs.readdirSync(d)) bytes += fs.statSync(path.join(d, n)).size; } catch (err) { /* mid-sweep */ }
      ages.push({id, t: t || at, bytes, live});
    }
    let total = ages.reduce((s, a) => s + a.bytes, 0);
    for (const a of ages.sort((x, y) => x.t - y.t)) { // oldest first until under the cap; a running job is never touched
      if (total <= CAP_BYTES) break;
      if (a.live) continue;
      try { for (const n of fs.readdirSync(jobDir(a.id))) rm(path.join(jobDir(a.id), n)); fs.rmdirSync(jobDir(a.id)); } catch (err) { /* partial */ }
      jobs.delete(a.id); total -= a.bytes;
    }
    return {removed};
  }

  // Routes. Returns true when it took the request. `json(res, code, obj)` is the server's own (cors + content-type).
  async function handle(req, res, url, ctx) {
    try { return await route(req, res, url, ctx); } catch (err) { // never let a stems request take the bridge down
      log("stems: " + (err.stack || err.message));
      if (!res.headersSent) ctx.json(res, 500, {error: {message: "stems: " + err.message}}); else try { res.end(); } catch (e) { /* gone */ }
      return true;
    }
  }
  async function route(req, res, url, {json}) {
    const m = url.pathname.match(/^\/v1\/stems(?:\/([^/]+))?(?:\/(input|files))?(?:\/([^/]+))?$/);
    if (!m) return false;
    if (!String(req.headers["x-nr-app"] || "").trim()) { json(res, 400, {error: {message: "x-nr-app header is required"}}); return true; }
    const [, id, sub, name] = m;
    if (!id) { // GET /v1/stems — the recent jobs for a Jobs → Open sheet
      if (req.method !== "GET") { json(res, 405, {error: {message: "GET only"}}); return true; }
      let ids = []; try { ids = fs.readdirSync(dir).filter(n => ID_RE.test(n)); } catch (err) { /* none */ }
      const rows = ids.map(load).filter(Boolean).sort((a, b) => (b.started || 0) - (a.started || 0)).slice(0, 20)
        .map(j => { const inp = inputOf(j.id); let bytes = 0; try { bytes = inp ? fs.statSync(inp).size : 0; } catch (err) { /* gone */ } return {id: j.id, name: j.name, status: j.status, started: j.started, ended: j.ended, bytes}; });
      json(res, 200, {jobs: rows, running: statusField().running, installed: installed()});
      return true;
    }
    if (!ID_RE.test(id)) { json(res, 400, {error: {message: "bad id (yyyymmdd-hhmmss-xxxx)"}}); return true; }

    if (sub === "input" && !name && req.method === "PUT") return await upload(req, res, id, json);
    if (sub === "files" && name && req.method === "GET") {
      if (!FILE_RE.test(name)) { json(res, 404, {error: {message: "no such file"}}); return true; }
      const f = path.join(jobDir(id), name);
      let st; try { st = fs.statSync(f); } catch (err) { json(res, 404, {error: {message: "no such file"}}); return true; }
      res.setHeader("access-control-allow-origin", "*"); res.setHeader("access-control-expose-headers", "content-length");
      res.writeHead(200, {"content-type": TYPES[path.extname(name)] || "application/octet-stream", "content-length": st.size, "cache-control": "no-cache"});
      fs.createReadStream(f).pipe(res);
      return true;
    }
    if (sub || name) { json(res, 404, {error: {message: "not found"}}); return true; }

    const job = load(id);
    if (req.method === "GET") {
      if (!job) { json(res, 404, {error: {message: inputOf(id) ? "uploaded, not started" : "no such job"}, input: !!inputOf(id)}); return true; }
      const wait = Math.min(30, Math.max(0, +url.searchParams.get("wait") || 0));
      if (wait && job.status === "running") { // long poll: answer on the next change or after `wait` s
        await new Promise(r => { const sub = () => { job.subs.delete(sub); clearTimeout(t); r(); }; const t = setTimeout(sub, wait * 1000); job.subs.add(sub); req.on("close", sub); });
      }
      json(res, 200, view(job));
      return true;
    }
    if (req.method === "DELETE") {
      if (!job) { json(res, 404, {error: {message: "no such job"}}); return true; }
      cancel(job);
      json(res, 200, {ok: true, status: job.status === "running" ? "cancelling" : job.status});
      return true;
    }
    if (req.method === "POST") {
      const input = inputOf(id);
      if (!input) { json(res, 404, {error: {message: "no input uploaded for this id"}}); return true; }
      if (!installed()) { json(res, 503, {error: {message: NOT_INSTALLED}, install: true}); return true; }
      const busy = () => running() || (starting ? load(starting) || {id: starting, name: starting} : null);
      const refuse = other => { json(res, 409, {error: {message: other.id === id ? "this separation is already running" : "a separation is running: " + other.name + (etaMin(other) ? "; it finishes in about " + etaMin(other) + " min" : "")}, running: other.id}); return true; };
      let other = busy(); if (other) return refuse(other);
      starting = id;
      try {
        let raw = ""; for await (const c of req) { raw += c; if (raw.length > 64 * 1024) { json(res, 413, {error: {message: "options too big"}}); return true; } }
        let b = {}; try { b = raw ? JSON.parse(raw) : {}; } catch (err) { json(res, 400, {error: {message: "bad JSON"}}); return true; }
        other = running(); if (other) return refuse(other); // a job that started while this body streamed in
        const options = cleanOptions(b);
        const j = job || {id, name: slugOf(path.basename(input)), subs: new Set()};
        if (!job) jobs.set(id, j);
        if (j.name === "input") j.name = id; // a name never arrived
        const err = start(j, options);
        if (err) { json(res, 500, {error: {message: "could not start the engine: " + err.message}}); return true; }
        log(`stems ${id} start ${options.model} (${j.name})`);
        json(res, 200, {id, status: "running"});
        return true;
      } catch (err) { log("stems " + id + " start: " + err.message); json(res, 500, {error: {message: "could not start: " + err.message}}); return true; } finally { if (starting === id) starting = null; }
    }
    json(res, 405, {error: {message: "GET, POST, PUT input or DELETE"}});
    return true;
  }

  async function upload(req, res, id, json) {
    if (uploading.has(id)) { json(res, 409, {error: {message: "this id is already uploading"}}); return true; }
    const job = load(id);
    if (job && job.status === "running") { json(res, 409, {error: {message: "this separation is running; upload under a new id"}}); return true; }
    uploading.add(id);
    const d = jobDir(id), part = path.join(d, "input.part");
    let out = null, n = 0, werr = null, head = Buffer.alloc(0), ext = null, pending = [];
    const drop = () => { if (!out) return; const o = out; const rm = () => { try { fs.unlinkSync(part); } catch (err) { /* never created */ } }; if (o.closed) rm(); else { o.once("close", rm); o.destroy(); } };
    const done = (code, body) => { uploading.delete(id); json(res, code, body); return true; };
    const notAudio = {error: {message: "not an audio file (wav, mp3, m4a, flac or ogg)"}};
    try {
      for await (const c of req) {
        n += c.length;
        if (n > max) { drop(); return done(413, {error: {message: "recording too big (" + Math.round(max / 1048576) + " MB is the most)"}}); }
        if (!ext) { // nothing touches the disk until the first bytes say this is audio
          head = Buffer.concat([head, c]).subarray(0, 16); pending.push(c);
          if (head.length < 12) continue;
          ext = audioExt(head); if (!ext) return done(400, notAudio);
          fs.mkdirSync(d, {recursive: true}); out = fs.createWriteStream(part); out.on("error", err => { werr = err; });
          for (const p of pending) if (!out.write(p)) await new Promise(r => out.once("drain", r));
          pending = []; continue;
        }
        if (werr) throw werr;
        if (!out.write(c)) await new Promise(r => out.once("drain", r));
      }
      if (!ext) return done(400, notAudio);
      await new Promise(r => out.end(r));
      if (werr) throw werr;
      const dest = path.join(d, "input." + ext), have = inputOf(id);
      let haveSize = -1; try { haveSize = have ? fs.statSync(have).size : -1; } catch (err) { /* new */ }
      if (haveSize === n && have === dest) { drop(); return done(200, {id, bytes: n, skipped: true}); }
      if (haveSize >= 0) { drop(); return done(409, {error: {message: "a different recording is already stored under this id"}}); }
      fs.renameSync(part, dest);
      const name = slugOf(req.headers["x-nr-name"] || id), rec = job || {id, subs: new Set()};
      Object.assign(rec, {name, status: rec.status || "uploaded", uploaded: now(), bytes: n, ext});
      jobs.set(id, rec); save(rec);
      log(`stems ${id} input.${ext} (${n} bytes, ${name})`);
      return done(200, {id, bytes: n, ext, name});
    } catch (err) { // a dropped connection or a disk/fs error: the id is released, the bridge stays up
      drop(); log("stems " + id + " upload: " + err.message);
      return done(err.code && /^E[A-Z]+$/.test(err.code) && err.syscall ? 500 : 400, {error: {message: err.syscall ? "could not store the upload: " + err.message : "upload broke off"}});
    }
  }

  return {handle, installed, statusField, sweep, startupCleanup, running: () => running(), jobsDir: dir};
}

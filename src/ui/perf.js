// src/ui/perf.js (layer 4) — docs/split-phase2-plan.md step 12: the ?perf=1
// on-device performance HUD (fps, stalls, self-profiler attribution via
// prof() in src/state.js, the ⏺ session report) and the ?dpr= override.
// Nothing here runs without the URL flag; both inits are no-ops otherwise.
import { PERF_FLAGS } from "../platform/base.js";
import { songRegionRight } from "./chrome.js";
import { S } from "../state.js";
import { playSec } from "../audio/transport.js";
import { PERF_NOSCENE } from "../platform/base.js";

export function initPerf1() {
  if (PERF_FLAGS.get("dpr")) { // override the source, not the call sites — every
    const forced = +PERF_FLAGS.get("dpr") || 1; // dpr read in the app picks it up
    try { Object.defineProperty(window, "devicePixelRatio", {get: () => forced, configurable: true}); }
    catch (err) { /* locked down: the flag simply does nothing */ }
  }
}

// first touch anywhere: create + warm the context inside a user gesture
// ?perf=1 — on-device performance HUD (iPad has no Activity Monitor): fps,
// worst frame gap, long-task count/max over the last second. ⏺ records a
// session and prints a report Josh can copy out — the iPad has no profiler,
// so attribution has to come from the app's own instrumentation.
export function initPerf2() {
  if (typeof location !== "undefined" && document.body && new URLSearchParams(location.search).get("perf")) (() => {
    const el = document.createElement("div");
    // right:8px from the viewport would sit under the right dock (window
    // manager, build steps 1-2) when it's open — offset from the song
    // region's own right edge instead, same 8px gutter
    el.style.cssText = "position:fixed;right:" + (window.innerWidth - songRegionRight() + 8) + "px;bottom:64px;z-index:9999;background:rgba(0,0,0,.75);" +
      "color:#7fdc7f;font:11px monospace;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre";
    document.body.appendChild(el);
    let frames = 0, worst = 0, last = performance.now(), longs = 0, longMax = 0;
    let lagWorst = 0, lagExp = performance.now() + 50;
    setInterval(() => { const n = performance.now(); // event-loop stall probe: fires
      lagWorst = Math.max(lagWorst, n - lagExp);     // even when rAF is throttled
      lagExp = n + 50; }, 50);
    try {
      new PerformanceObserver(l => { for (const e of l.getEntries()) { longs++; longMax = Math.max(longMax, e.duration); } })
        .observe({entryTypes: ["longtask"]});
    } catch (err) { /* webkit: no longtask — fps + gap still tell the story */ }
    // frame-delta histogram: separates "uniformly throttled" (one fat bucket)
    // from "mostly fine with spikes" (bimodal) — the two have different causes
    const BUCKETS = [8, 17, 25, 34, 50, 100, 200, Infinity];
    const hist = BUCKETS.map(() => 0);
    // S.perfRec (src/state.js): null when idle, else the in-flight recording
    // session object. Was a closure-local `rec` here; prof() (which now runs
    // from wherever each profiled function is actually defined, not from
    // inside this HUD) needs to read/write the exact same flag, so it moved
    // to S.
    // loop-wrap detection without touching app code: playSec() runs backwards
    // when the transport wraps a cycle. If the stalls land ON wraps it is the
    // transport's re-schedule; if they land anywhere, it is GC or the platform.
    let prevSec = null, lastWrap = -1e9;
    const loop = t => {
      frames++;
      const dt = t - last;
      worst = Math.max(worst, dt);
      last = t;
      if (S.perfRec) {
        S.perfRec.frames++;
        hist[BUCKETS.findIndex(b => dt <= b)]++;
        try {
          const ps = typeof S.playing !== "undefined" && S.playing ? playSec() : null;
          if (ps !== null && prevSec !== null && ps < prevSec - 0.05) { S.perfRec.wraps++; lastWrap = t; }
          prevSec = ps;
        } catch (err) { /* transport not running: wrap census simply stays empty */ }
        if (dt > 50) { // a stall worth attributing
          S.perfRec.blocks++;
          S.perfRec.blockMs += dt;
          if (t - lastWrap < 250) S.perfRec.blocksAtWrap++;
          S.perfRec.secBlocks++;
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    // self-profiler: WebKit has no longtask attribution — wrap the app's own
    // hot functions and report top offenders (ms spent in the last second)
    const acct = S.perfAcct;   // rolling, cleared every second for the HUD line — shared with prof() (src/state.js)
    const total = S.perfTotal;  // session totals: {ms, calls} — shared with prof() (src/state.js)
    // self-profiler (step 7, docs/split-plan.md §2.4): each profiled function
    // now wraps ITSELF at its own definition site via prof() (src/state.js —
    // "name = prof(\"name\", name);", right after the function declaration,
    // wherever that declaration now lives). The old wrap() installed this
    // centrally by patching globalThis[name], which only ever worked while
    // every profiled name was a classic <script> global; the first function
    // this step moved out of app.js (secToTick, step 3) silently broke it —
    // attribution kept reporting nothing, with no error. acct/total below are
    // the SAME shared objects prof()'s wrapped calls write into (S.perfAcct/
    // S.perfTotal), not a fresh local pair, so this HUD still reads them live.
    // second pass: the edit entry points also mark the timeline, so the report
    // shows the exact second an edit landed and what it changed
    setTimeout(() => ["saveEdits", "selEditApply", "insertTime"].forEach(name => {
      const fn = typeof globalThis[name] === "function" ? globalThis[name] : null;
      if (!fn) return;
      globalThis[name] = function () {
        const r = fn.apply(this, arguments);
        if (S.perfRec) S.perfRec.marks.push("  ==== EDIT (" + name + ") @" + S.perfRec.sec + "s  " + snapshot());
        return r;
      };
    }), 1);
    // audio-node census: a leaked graph costs time in the realtime render thread,
    // where no page-side profiler can see it. Patched on the prototype so the
    // app's own code stays untouched; 'ended' via addEventListener so an app
    // .onended assignment is not clobbered.
    const nodes = {osc: 0, gain: 0, buf: 0, filt: 0, ended: 0, stopped: 0, disc: 0};
    let livePeak = 0;
    const liveNow = () => nodes.osc + nodes.buf - nodes.ended; // stop() and 'ended'
    // fire for the same node — counting both double-subtracts and reads negative
    try {
      const P = (typeof BaseAudioContext !== "undefined" ? BaseAudioContext : AudioContext).prototype;
      const src = (m, key) => {
        const f = P[m];
        if (!f) return;
        P[m] = function () {
          const n = f.apply(this, arguments);
          nodes[key]++;
          livePeak = Math.max(livePeak, liveNow());
          try {
            n.addEventListener("ended", () => { nodes.ended++; });
            const st = n.stop;
            if (st) n.stop = function () { nodes.stopped++; return st.apply(this, arguments); };
          } catch (err) { /* node type without stop/ended: creation count still counts */ }
          return n;
        };
      };
      src("createOscillator", "osc");
      src("createBufferSource", "buf");
      for (const [m, k] of [["createGain", "gain"], ["createBiquadFilter", "filt"]]) {
        const f = P[m];
        if (f) P[m] = function () { nodes[k]++; return f.apply(this, arguments); };
      }
      const dc = AudioNode.prototype.disconnect;
      AudioNode.prototype.disconnect = function () { nodes.disc++; return dc.apply(this, arguments); };
    } catch (err) { /* no WebAudio in this context: the rest of the report stands */ }
    // Josh's Safari recording: ff1-battle ran 131s with zero stalls in every
    // second, then graveyard-2 degraded from the second he edited a note and
    // never recovered. Per-frame JS is identical either side of that line, so
    // the edit changes the DATA. Snapshot what it changes, at the boundary.
    const snapshot = () => {
      const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (err) { return d; } };
      const all = g(() => S.song.tracks.reduce((a, t) => a + t.notes.length, 0), -1);
      const gone = g(() => S.song.tracks.reduce((a, t) => a + t.notes.filter(n => n.gone).length, 0), -1);
      const added = g(() => S.song.tracks.reduce((a, t) => a + t.notes.filter(n => n.added).length, 0), -1);
      return "notes " + all + " (gone " + gone + ", added " + added + ")" +
             "  roll " + g(() => S.rollnotes.length, -1) +
             "  sched " + g(() => S.schedEvents.length, -1) +
             "  undo " + g(() => S.editUndo.length, -1) + "/" + g(() => S.editRedo.length, -1) +
             "  sceneValid " + g(() => String(S.sceneValid), "?") +
             "  songEndTick " + g(() => Math.round(S.songEndTick), -1);
    };
    const dims = id => {
      const c = document.getElementById(id);
      return c ? c.width + "x" + c.height : "—";
    };
    const lsReport = () => {
      let bytes = 0, keys = 0;
      const per = [];
      try {
        for (const k of Object.keys(localStorage)) {
          const n = (k.length + (localStorage.getItem(k) || "").length) * 2; // UTF-16
          bytes += n; keys++; per.push([k, n]);
        }
      } catch (err) { return "unavailable"; }
      per.sort((a, b) => b[1] - a[1]);
      return Math.round(bytes / 1024) + " KB in " + keys + " keys; top: " +
        per.slice(0, 4).map(([k, n]) => k + " " + Math.round(n / 1024) + "KB").join(", ");
    };
    const report = () => {
      const secs = (performance.now() - S.perfRec.t0) / 1000;
      const L = [];
      L.push("NIGHT ROLL PERF REPORT");
      L.push("build " + (document.lastModified || "?") + "   session " + secs.toFixed(1) + "s");
      L.push("song at stop " + (typeof S.songKey !== "undefined" ? S.songKey : "?") +
             "   tracks " + (typeof S.song !== "undefined" && S.song ? S.song.tracks.length : 0) +
             "   notes " + (typeof S.song !== "undefined" && S.song
               ? S.song.tracks.reduce((a, t) => a + t.notes.filter(n => !n.gone).length, 0) : 0) +
             "   view " + (typeof S.viewMode !== "undefined" ? S.viewMode : "?") +
             "   playing " + (typeof S.playing !== "undefined" ? !!S.playing : "?"));
      L.push("ua " + navigator.userAgent);
      L.push("dpr " + (window.devicePixelRatio || 1) +
             "   win " + innerWidth + "x" + innerHeight +
             "   screen " + screen.width + "x" + screen.height);
      L.push("flags dpr=" + (PERF_FLAGS.get("dpr") || "off") +
             "  scene=" + (PERF_NOSCENE ? "0 (cache disabled)" : "on"));
      L.push("state at stop: " + snapshot());
      L.push("canvas roll " + dims("roll") + "   inst " + dims("instcanvas") +
             "   instOpen " + (typeof S.instOpen !== "undefined" ? S.instOpen : "?") +
             "   fall " + (typeof S.fallOn !== "undefined" ? S.fallOn : "?") +
             "   scene " + (typeof S.sceneCanvas !== "undefined" && S.sceneCanvas
               ? S.sceneCanvas.width + "x" + S.sceneCanvas.height : "none"));
      try {
        L.push("audio sr " + S.audio.sampleRate + "  baseLatency " +
               Math.round((S.audio.baseLatency || 0) * 1000) + "ms  state " + S.audio.state);
      } catch (err) { L.push("audio —"); }
      L.push("");
      L.push("--- frames ---");
      L.push("frames " + S.perfRec.frames + "   avg fps " + (S.perfRec.frames / secs).toFixed(1) +
             "   worst frame " + Math.round(S.perfRec.worst) + "ms   worst lag " + Math.round(S.perfRec.lag) + "ms");
      L.push("longtasks " + S.perfRec.longs + (S.perfRec.longMax ? " (max " + Math.round(S.perfRec.longMax) + "ms)" : ""));
      // the discriminator: a blocked main thread stalls the 50ms timer AND the
      // frame; a throttled rAF starves frames while the timer stays on time
      // average fps is the WRONG test: Josh's 271s recording averaged 56.9 while
      // stalling 185ms, because it ran clean for two minutes before degrading.
      // Judge by stall density and by whether the probe timer went late with it.
      const perMin = S.perfRec.blocks / Math.max(1, secs / 60);
      L.push("shape " + (S.perfRec.frames / secs < 20 && S.perfRec.lag < 50
          ? "frames starved, event loop on time — rAF THROTTLED (environment/backgrounded)"
        : perMin < 2 ? "healthy (no meaningful stalls)"
        : S.perfRec.lag > 100 ? "main thread BLOCKED — " + Math.round(perMin) + " stalls/min, probe timer late too"
        : "stalls present — " + Math.round(perMin) + "/min, probe timer on time (paint or compositor side)"));
      L.push("frame deltas  " + BUCKETS.map((b, i) =>
        (b === Infinity ? ">200" : "<=" + b) + ":" + hist[i]).join("  "));
      L.push("");
      const segs = Object.entries(S.perfRec.bySong);
      if (segs.length > 1) { // only interesting when a song switch actually happened
        L.push("--- per song (the A/B) ---");
        for (const [k, v] of segs)
          L.push(k.padEnd(46) + String(v.secs).padStart(4) + "s  avg fps " +
                 (v.frames / v.secs).toFixed(1).padStart(6) +
                 "  worst " + String(Math.round(v.worst)).padStart(4) + "ms" +
                 "  lag " + String(Math.round(v.lag)).padStart(4) + "ms");
        L.push("NOTE: attribution below is the WHOLE session, not per song.");
        L.push("");
      }
      L.push("--- attribution (session totals) ---");
      const rows = Object.entries(total).sort((a, b) => b[1].ms - a[1].ms).filter(([, v]) => v.ms >= 1);
      if (!rows.length) L.push("(nothing measurable)");
      for (const [n, v] of rows)
        L.push(n.padEnd(20) + String(Math.round(v.ms)).padStart(7) + "ms " +
               String(Math.round(v.ms / (secs * 10))).padStart(4) + "%   calls " + v.calls);
      L.push("NOTE: drawFull nests inside playbackFrame — percentages overlap.");
      L.push("");
      L.push("--- audio nodes ---");
      L.push("created osc " + nodes.osc + "  buf " + nodes.buf + "  gain " + nodes.gain +
             "  filt " + nodes.filt);
      L.push("ended " + nodes.ended + "  stopped " + nodes.stopped + "  disconnect " + nodes.disc +
             "   live(est) " + liveNow() + "   peak " + livePeak);
      L.push("");
      L.push("--- stalls (>50ms frames) ---");
      L.push("count " + S.perfRec.blocks + "   mean " +
             (S.perfRec.blocks ? Math.round(S.perfRec.blockMs / S.perfRec.blocks) : 0) + "ms" +
             "   loop wraps " + S.perfRec.wraps +
             "   stalls within 250ms of a wrap " + S.perfRec.blocksAtWrap +
             (S.perfRec.blocks ? " (" + Math.round(S.perfRec.blocksAtWrap / S.perfRec.blocks * 100) + "%)" : ""));
      L.push("read: high % = the transport's loop re-schedule; low % = GC/platform.");
      L.push("");
      L.push("--- growth (first vs last, and the slope) ---");
      if (S.perfRec.growth.length > 1) {
        const a = S.perfRec.growth[0], b = S.perfRec.growth[S.perfRec.growth.length - 1];
        const span = Math.max(1, b.s - a.s);
        for (const k of ["dom", "nodes", "live", "sched", "roll", "undo"])
          L.push(k.padEnd(8) + String(a[k]).padStart(8) + " -> " + String(b[k]).padStart(8) +
                 "   " + ((b[k] - a[k]) / span).toFixed(1) + "/s");
        L.push("(nodes is cumulative and SHOULD climb; live/dom/sched/roll/undo should not)");
      } else L.push("(too short)");
      L.push("");
      L.push("--- storage ---");
      L.push(lsReport());
      L.push("");
      L.push("--- per second (fps / worst / lag / hottest) ---");
      for (const s of S.perfRec.marks) L.push(s);
      return L.join("\n");
    };
    const sheet = text => {
      const bg = document.createElement("div");
      bg.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.85);" +
        "display:flex;flex-direction:column;gap:8px;padding:12px;box-sizing:border-box";
      const ta = document.createElement("textarea");
      ta.readOnly = true;
      ta.value = text;
      ta.style.cssText = "flex:1;width:100%;box-sizing:border-box;background:#111;color:#7fdc7f;" +
        "font:11px monospace;border:1px solid #444;border-radius:6px;padding:8px";
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px";
      const mk = (label, fn) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.style.cssText = "flex:1;padding:10px;font:13px monospace;background:#222;color:#eee;" +
          "border:1px solid #555;border-radius:6px";
        b.addEventListener("click", fn);
        return b;
      };
      row.append(mk("Copy", () => {
        ta.select();
        const done = () => { row.firstChild.textContent = "Copied ✓"; };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {
          try { document.execCommand("copy"); done(); } catch (err) {}
        });
        else { try { document.execCommand("copy"); done(); } catch (err) {} }
      }), mk("Close", () => bg.remove()));
      bg.append(ta, row);
      document.body.appendChild(bg);
    };
    const btn = document.createElement("button");
    // same right-dock offset as the HUD panel above
    btn.style.cssText = "position:fixed;right:" + (window.innerWidth - songRegionRight() + 8) + "px;bottom:8px;z-index:9999;background:rgba(0,0,0,.8);" +
      "color:#e66767;font:13px monospace;padding:8px 12px;border-radius:6px;border:1px solid #555";
    btn.textContent = "⏺ rec";
    btn.addEventListener("click", () => {
      if (S.perfRec) { const t = report(); S.perfRec = null; btn.textContent = "⏺ rec"; btn.style.color = "#e66767"; sheet(t); return; }
      hist.fill(0);
      for (const k in total) delete total[k];
      for (const k in nodes) nodes[k] = 0;
      livePeak = 0;
      S.perfRec = {t0: performance.now(), frames: 0, worst: 0, lag: 0, longs: 0, longMax: 0,
             marks: [], sec: 0, bySong: {}, song: null,
             wraps: 0, blocks: 0, blockMs: 0, blocksAtWrap: 0, secBlocks: 0, growth: []};
      btn.textContent = "⏹ stop";
      btn.style.color = "#7fdc7f";
    });
    document.body.appendChild(btn);
    setInterval(() => {
      const entries = Object.entries(acct).sort((a, b) => b[1] - a[1]);
      const top = entries.slice(0, 3).map(([n, ms]) => n + " " + Math.round(ms)).join("  ");
      el.textContent = "fps " + frames + "  worst " + Math.round(worst) + "ms  lag " + Math.round(lagWorst) + "ms\n" +
                       "longtasks " + longs + (longMax ? " (max " + Math.round(longMax) + "ms)" : "") +
                       "\nhot: " + (top || "—") +
                       "\nbuild " + (document.lastModified || "?") +
                       (S.perfRec ? "\nREC " + Math.round((performance.now() - S.perfRec.t0) / 1000) + "s" : "");
      if (S.perfRec) {
        S.perfRec.sec++;
        S.perfRec.worst = Math.max(S.perfRec.worst, worst);
        S.perfRec.lag = Math.max(S.perfRec.lag, lagWorst);
        S.perfRec.longs += longs;
        S.perfRec.longMax = Math.max(S.perfRec.longMax, longMax);
        // song switches mid-recording are the point: airship-vs-his-song in ONE
        // session is a controlled A/B no bisect can match. Segment by songKey so
        // the seconds do not blend into one pile.
        const key = (typeof S.songKey !== "undefined" && S.songKey) || "(none)";
        if (key !== S.perfRec.song) { S.perfRec.song = key; S.perfRec.marks.push("  ---- song -> " + key + " ----"); }
        const seg = S.perfRec.bySong[key] || (S.perfRec.bySong[key] = {secs: 0, frames: 0, worst: 0, lag: 0});
        seg.secs++; seg.frames += frames;
        seg.worst = Math.max(seg.worst, worst); seg.lag = Math.max(seg.lag, lagWorst);
        S.perfRec.marks.push(String(S.perfRec.sec).padStart(4) + "s  fps " + String(frames).padStart(3) +
                       "  worst " + String(Math.round(worst)).padStart(4) +
                       "  lag " + String(Math.round(lagWorst)).padStart(4) +
                       "  blk " + String(S.perfRec.secBlocks).padStart(2) +
                       "  " + (entries[0] ? entries[0][0] + " " + Math.round(entries[0][1]) : "—"));
        S.perfRec.secBlocks = 0;
        // growth probe: the stalls lengthen over a session, so SOMETHING is
        // being retained. Sample the candidates rather than guess at them.
        const g = num => { try { return num(); } catch (err) { return -1; } };
        S.perfRec.growth.push({
          s: S.perfRec.sec,
          dom: document.getElementsByTagName("*").length,
          nodes: nodes.osc + nodes.buf + nodes.gain + nodes.filt,
          live: nodes.osc + nodes.buf - nodes.ended,
          sched: g(() => S.schedEvents.length),
          roll: g(() => S.rollnotes.length),
          undo: g(() => S.editUndo.length + S.editRedo.length),
        });
      }
      frames = 0; worst = 0; longs = 0; longMax = 0; lagWorst = 0;
      for (const k in acct) acct[k] = 0;
    }, 1000);
  })();
}

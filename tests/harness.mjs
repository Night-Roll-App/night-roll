// Test harness: extracts the inline <script> from index.html and runs it in a
// Node vm with a minimal DOM stub, so the app can stay a single file with no
// build step. Top-level `let`/`const` bindings persist in the context's global
// lexical scope, so later run() calls can read and assign them like a second
// <script> tag would.
//
// Event injection (2026-08-23): elements/document/window RECORD their
// listeners and expose dispatchEvent, so vm tests can drive the real pointer
// handlers with plain objects — the handlers only read data properties
// (clientX, pointerType, …), never PointerEvent internals. Timers are a fake
// clock (app.tick(ms) fires them and advances performance.now()), which makes
// the 230ms hold-to-grab dwell deterministic. WebAudio is the same inert fake
// the e2e suite injects. None of this touches index.html.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function noop() {}

function ctx2dStub() {
  // canvas 2d context: any property settable, any method a no-op
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: (t, k, v) => ((t[k] = v), true),
  });
}

function listenable(el) {
  const listeners = new Map(); // type -> Set(handler)
  el.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  el.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  el.dispatchEvent = (evt) => {
    evt.target ??= el;
    evt.currentTarget ??= el; // no bubbling in this stub, so it's always the dispatching element — real DOM's meaning for a direct (non-delegated) listener
    evt.preventDefault ??= noop;
    evt.stopPropagation ??= noop;
    for (const fn of [...(listeners.get(evt.type) || [])]) fn(evt);
  };
  return el;
}

function makeClassList() {
  const set = new Set();
  return {
    add: (...ks) => ks.forEach(k => set.add(k)),
    remove: (...ks) => ks.forEach(k => set.delete(k)),
    toggle: (k, force) => {
      const on = force === undefined ? !set.has(k) : !!force;
      on ? set.add(k) : set.delete(k);
      return on;
    },
    contains: (k) => set.has(k),
  };
}

// a plain {} let every existing test read/write style.paddingRight etc.
// directly, but the window manager (build steps 1-2) sets CSS custom
// properties (--dr-w) via the real setProperty()/getPropertyValue() API —
// unlike a normal IDL property, those are NOT reflected by a bare object
// key, so the stub needs the same three methods a real CSSStyleDeclaration
// has, backed by the same plain object every other style read/write uses.
function makeStyle() {
  const store = {};
  return new Proxy(store, {
    get: (t, k) => (k === "setProperty" ? (name, v) => { t[name] = v; }
      : k === "getPropertyValue" ? (name) => (t[name] !== undefined ? String(t[name]) : "")
      : k === "removeProperty" ? (name) => { const old = t[name]; delete t[name]; return old === undefined ? "" : String(old); }
      : t[k]),
    set: (t, k, v) => ((t[k] = v), true),
  });
}

function makeEl() {
  // real attribute store (2026-09-30, VoiceOver first pass): aria-label/
  // aria-pressed/role/etc. are set via setAttribute in app code, not as IDL
  // properties like textContent/value, so a vm test asserting on them needs
  // setAttribute to actually stick rather than the old no-op — nothing
  // before this read attributes back (no .getAttribute( in index.html), so
  // this is purely additive.
  const attrs = new Map();
  const el = listenable({
    children: [],
    style: makeStyle(),
    dataset: {},
    classList: makeClassList(),
    value: "",
    textContent: "",
    placeholder: "",
    disabled: false,
    tabIndex: 0,
    width: 0,
    height: 0,
    clientWidth: 800,
    clientHeight: 600,
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
    hasAttribute(k) { return attrs.has(k); },
    removeAttribute(k) { attrs.delete(k); },
    setPointerCapture: noop,
    releasePointerCapture: noop,
    focus: noop,
    appendChild(c) { el.children.push(c); c._parent = el; return c; },
    append(...cs) { el.children.push(...cs); cs.forEach(c => { if (c) c._parent = el; }); },
    querySelectorAll: () => [],
    cloneNode: () => makeEl(),
    getContext: () => ctx2dStub(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  });
  // a real innerHTML assignment replaces the whole subtree — the Mixer (and
  // anything else that queries .children after a re-render, e.g. `wrap.innerHTML
  // = ""; tracks.forEach(t => wrap.appendChild(...))`) needs that reflected here
  // too, not just the string kept for its own sake; a bare data property left
  // .children stale across a second render
  let _innerHTML = "";
  Object.defineProperty(el, "innerHTML", {
    get: () => _innerHTML,
    set: (v) => { _innerHTML = v; el.children = []; },
  });
  // <select>.options (2026-09-30, the ✎ Edit sheet's folder picker):
  // index.html reads `.options` on every <select> stub (findsel, fsfolder,
  // the AI model/target pickers) — a live alias onto the same .children
  // array appendChild already fills, same as a real HTMLOptionsCollection
  // for every use this app makes of it (.length, indexing, spreading).
  Object.defineProperty(el, "options", { get: () => el.children });
  el.select = noop; // input.select(): nothing to select in a stub
  el.click = () => el.dispatchEvent({ type: "click" });
  el.remove = () => { if (el._parent) { const i = el._parent.children.indexOf(el); if (i >= 0) el._parent.children.splice(i, 1); } };
  return el;
}

// inert WebAudio (ported from tests/e2e/helpers.mjs — keep the two in step)
function fakeAudio(clock) {
  const param = () => ({ value: 0, setValueAtTime() {}, cancelScheduledValues() {},
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() { return node(); }, disconnect() {}, start() {}, stop() {},
    gain: param(), frequency: param(), buffer: null, type: "sine", playbackRate: param(), // chipStart/chipStreamScheduleChunk set this on a buffer source
    addEventListener() {}, setPeriodicWave() {} });
  return class FakeCtx {
    constructor() { this.state = "running"; this.sampleRate = 44100; this.destination = node(); }
    get currentTime() { return clock.now() / 1000; }
    resume() { return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBufferSource() { return node(); }
    createBuffer(ch, len) { return { numberOfChannels: ch, length: len, getChannelData: () => new Float32Array(len || 1), copyToChannel() {} }; }
    createStereoPanner() { const n = node(); n.pan = param(); return n; }
    createPeriodicWave() { return {}; }
    // the "strings" and "bell" voices filter; without this a preview on them throws
    createBiquadFilter() { const n = node(); n.frequency = param(); n.Q = param(); n.detune = param(); return n; }
    createDynamicsCompressor() { const n = node(); n.threshold = param(); n.knee = param();
      n.ratio = param(); n.attack = param(); n.release = param(); return n; }
    createMediaStreamDestination() { return { stream: {} }; }
    decodeAudioData() { return Promise.resolve({ getChannelData: () => new Float32Array(1),
      duration: 0.01, length: 1, sampleRate: 44100 }); }
    // the Mixer's per-track/master meters (ensureMixerMeters): silence in,
    // silence out — getByteTimeDomainData fills the DC midpoint (128), same
    // as a real analyser reading true silence, so mixerMeterRms() reads 0
    createAnalyser() {
      const n = node();
      n.fftSize = 2048;
      n.frequencyBinCount = 1024;
      n.getByteTimeDomainData = (buf) => buf.fill(128);
      n.getByteFrequencyData = (buf) => buf.fill(0);
      return n;
    }
  };
}

// OfflineAudioContext is real (and cheap — no audio device) in every browser
// the app actually ships to, so it's on by default here too: renderSongOffline
// (Download audio's offline bounce) picks it up the same way live code does. A
// test that needs the "no OfflineAudioContext" fallback branch deletes
// window.OfflineAudioContext/webkitOfflineAudioContext for its own duration
// and restores it after. Not mirrored to tests/e2e/helpers.mjs: headless
// Chromium's own OfflineAudioContext already works with no audio device, so
// e2e never needed a fake one.
function fakeOfflineAudio(FakeCtx) {
  return class FakeOfflineCtx extends FakeCtx {
    constructor(channels = 2, length = 1, sampleRate = 44100) {
      super();
      this._channels = channels; this._length = Math.max(1, length); this.sampleRate = sampleRate;
    }
    startRendering() {
      const {_channels: numberOfChannels, _length: length, sampleRate} = this;
      return Promise.resolve({ numberOfChannels, length, sampleRate,
        getChannelData: () => new Float32Array(length) });
    }
  };
}

export function createApp(opts = {}) {
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
  const m = html.match(/<script>\n([\s\S]*?)<\/script>/); // inline script only (vendor tag has src=)
  if (!m) throw new Error("inline <script> not found in index.html");
  if (opts.edition) m[1] = m[1].replace('const EDITION = "web";', 'const EDITION = "' + opts.edition + '";'); // the product build's one-line change (tools/package.mjs)

  const elements = new Map();
  const store = new Map();
  // Learning/Normal mode (P0): the existing suite predates modes and exercises
  // Learning behavior throughout, so createApp() with NO explicit storage
  // pins ff1roll-mode=learning up front — same effect as "this device already
  // has Night Roll prefs" without depending on the migration heuristic. A
  // test that wants to exercise the migration itself (or Normal mode) passes
  // its own `storage`, which skips this default entirely.
  if (!opts.storage) store.set("ff1roll-mode", "learning");
  for (const [k, v] of Object.entries(opts.storage || {})) store.set(k, String(v)); // keys present BEFORE boot: the migrations run against them

  // fake clock: setTimeout/performance.now share one timeline; tick(ms) fires
  // due timers in order (the dwell tests depend on exact ordering)
  let vnow = 0, timerId = 1;
  const timers = new Map(); // id -> {at, fn}
  const clock = { now: () => vnow };
  function tick(ms) {
    const until = vnow + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= until && (!next || t.at < next.t.at)) next = { id, t };
      if (!next) break;
      vnow = Math.max(vnow, next.t.at);
      timers.delete(next.id);
      next.t.fn();
    }
    vnow = until;
  }

  const documentEl = listenable({
    documentElement: makeEl(),
    // NO `body` and NO `querySelectorAll` here, on purpose: several boot-time
    // blocks (sheetDrag's `!document.body` check; SHEET_TOP's own
    // `typeof document.querySelectorAll === "function"` check, explicitly
    // commented "vm harness stubs document") use their ABSENCE as the
    // "are we in the vm harness" sentinel. Giving document a real body
    // silently turned both on and crashed boot on MutationObserver /
    // unstubbed querySelector — this cost real time to trace, so: don't.
    getElementById(id) {
      // .id matches a real DOM element's own id attribute — the window
      // manager's Phase B tab groups read an element's `.id` back (to match
      // it against wm[side].ids) the same way a real browser would
      if (!elements.has(id)) { const el = makeEl(); el.id = id; elements.set(id, el); }
      return elements.get(id);
    },
    createElement: () => makeEl(),
    createTextNode: (t) => ({ text: t }),
  });
  const windowEl = listenable({ devicePixelRatio: 1 });
  const FakeCtx = fakeAudio(clock);
  windowEl.AudioContext = FakeCtx;
  windowEl.webkitAudioContext = FakeCtx;
  const FakeOfflineCtx = fakeOfflineAudio(FakeCtx);
  windowEl.OfflineAudioContext = FakeOfflineCtx;
  windowEl.webkitOfflineAudioContext = FakeOfflineCtx;

  const sandbox = {
    console,
    document: documentEl,
    window: windowEl,
    // Proxy so Object.keys(localStorage) enumerates stored keys, like the real
    // thing (draftKeys/dirtySongs scan that way)
    localStorage: new Proxy({
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    }, {
      ownKeys: (t) => [...Object.keys(t), ...store.keys()],
      getOwnPropertyDescriptor: (t, k) => store.has(k)
        ? { enumerable: true, configurable: true, value: store.get(k) }
        : Object.getOwnPropertyDescriptor(t, k),
    }),
    getComputedStyle: () => ({ getPropertyValue: () => "#000" }),
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
    // intervals are a no-op unless a test opts in (opts.intervals): most suites
    // would otherwise run every app poller; the transport tests need the scheduler
    setInterval: opts.intervals ? (fn, ms = 0) => { const id = timerId++; const step = Math.max(1, ms);
      const arm = at => timers.set(id, { at, fn: () => { arm(at + step); fn(); } }); arm(vnow + step); return id; } : () => 0,
    clearInterval: opts.intervals ? (id) => timers.delete(id) : noop,
    setTimeout: (fn, ms = 0) => { const id = timerId++; timers.set(id, { at: vnow + ms, fn }); return id; },
    clearTimeout: (id) => timers.delete(id),
    performance: { now: () => vnow },
    Event: class { constructor(type) { this.type = type; } },
    fetch: () => Promise.reject(new Error("no network in tests")),
    navigator: {},
    TextDecoder,
    TextEncoder,
    atob: (b) => Buffer.from(b, "base64").toString("binary"),
    URL,
    Blob,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    Math, JSON, // share so test-side values compare cleanly
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(m[1], context, { filename: "index.html<script>" });
  return {
    context,
    /** Evaluate code inside the app's global scope; returns the result. */
    run: (code) => vm.runInContext(code, context),
    /** The in-memory localStorage backing store (for asserting persistence). */
    store,
    /** Advance the fake clock, firing due setTimeout callbacks in order. */
    tick,
    /** Element stub by id (same instance the app holds). */
    el: (id) => documentEl.getElementById(id),
    /** Dispatch a plain event object on an element / document / window. */
    dispatch: (id, evt) => documentEl.getElementById(id).dispatchEvent(evt),
    docDispatch: (evt) => documentEl.dispatchEvent(evt),
    winDispatch: (evt) => windowEl.dispatchEvent(evt),
  };
}

/** Plain pointer-event object: the app's handlers only read data properties.
 *  Coordinates are canvas-space (the stubbed rect sits at 0,0). */
export function pev(type, props = {}) {
  return {
    type,
    clientX: 0, clientY: 0,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    altKey: false, shiftKey: false, metaKey: false, ctrlKey: false,
    preventDefault: noop,
    stopPropagation: noop,
    ...props,
  };
}

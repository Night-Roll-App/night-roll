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

function makeEl() {
  const el = listenable({
    children: [],
    style: {},
    dataset: {},
    classList: makeClassList(),
    value: "",
    textContent: "",
    innerHTML: "",
    placeholder: "",
    disabled: false,
    tabIndex: 0,
    width: 0,
    height: 0,
    clientWidth: 800,
    clientHeight: 600,
    setAttribute: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    focus: noop,
    appendChild(c) { el.children.push(c); return c; },
    append(...cs) { el.children.push(...cs); },
    querySelectorAll: () => [],
    cloneNode: () => makeEl(),
    getContext: () => ctx2dStub(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  });
  el.click = () => el.dispatchEvent({ type: "click" });
  return el;
}

// inert WebAudio (ported from tests/e2e/helpers.mjs — keep the two in step)
function fakeAudio(clock) {
  const param = () => ({ value: 0, setValueAtTime() {}, cancelScheduledValues() {},
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() { return node(); }, disconnect() {}, start() {}, stop() {},
    gain: param(), frequency: param(), buffer: null, type: "sine",
    addEventListener() {}, setPeriodicWave() {} });
  return class FakeCtx {
    constructor() { this.state = "running"; this.sampleRate = 44100; this.destination = node(); }
    get currentTime() { return clock.now() / 1000; }
    resume() { return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBufferSource() { return node(); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len || 1) }; }
    createPeriodicWave() { return {}; }
    // the "strings" and "bell" voices filter; without this a preview on them throws
    createBiquadFilter() { const n = node(); n.frequency = param(); n.Q = param(); n.detune = param(); return n; }
    createDynamicsCompressor() { const n = node(); n.threshold = param(); n.knee = param();
      n.ratio = param(); n.attack = param(); n.release = param(); return n; }
    createMediaStreamDestination() { return { stream: {} }; }
    decodeAudioData() { return Promise.resolve({ getChannelData: () => new Float32Array(1),
      duration: 0.01, length: 1, sampleRate: 44100 }); }
  };
}

export function createApp(opts = {}) {
  const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
  const m = html.match(/<script>\n([\s\S]*?)<\/script>/); // inline script only (vendor tag has src=)
  if (!m) throw new Error("inline <script> not found in index.html");
  if (opts.edition) m[1] = m[1].replace('const EDITION = "web";', 'const EDITION = "' + opts.edition + '";'); // the product build's one-line change (tools/package.mjs)

  const elements = new Map();
  const store = new Map();

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
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeEl());
      return elements.get(id);
    },
    createElement: () => makeEl(),
    createTextNode: (t) => ({ text: t }),
  });
  const windowEl = listenable({ devicePixelRatio: 1 });
  const FakeCtx = fakeAudio(clock);
  windowEl.AudioContext = FakeCtx;
  windowEl.webkitAudioContext = FakeCtx;

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
    setInterval: () => 0,
    clearInterval: noop,
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

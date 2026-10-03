// Shared setup for the gesture specs: load the app, spin up a scratch
// composition, seed notes, and translate ticks/pitches to canvas pixels.
// No token is ever stored — every repo-write path stays inert by design.
export async function openApp(page) {
  // Learning/Normal mode (P0): a genuinely fresh browser profile (empty
  // localStorage, the e2e default) would migrate to Normal — these specs
  // predate modes and assume Learning's "nothing volunteered" defaults
  // throughout, so pin it before the app's own boot-time migration ever runs.
  await page.addInitScript(() => { try { localStorage.setItem("ff1roll-mode", "learning"); } catch (e) {} });
  // module split (docs/split-plan.md §4 step 0b, §3.4): app globals are now
  // ES module top-level bindings, invisible to a bare identifier in an
  // injected page.evaluate/waitForFunction script unless src/devtools.js's
  // exposeGlobals() has mirrored them onto window — gated on this flag so
  // production never pays for it. Must be set before src/main.js's own
  // top-level code runs, hence addInitScript (runs before any page script).
  await page.addInitScript(() => { window.__NR_EXPOSE = true; });
  // headless chromium stalls ~20s constructing a real AudioContext (no audio
  // device) — one stall per pointerdown that previews a note. Gesture tests
  // don't need sound: stub the whole WebAudio surface with inert fakes.
  await page.addInitScript(() => {
    const param = () => ({ value: 0, setValueAtTime(v) { this.value = v; }, cancelScheduledValues() {},
      linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; } });
    const node = () => ({ connect() { return node(); }, disconnect() {}, start() {}, stop() {},
      gain: param(), frequency: param(), buffer: null, type: "sine", playbackRate: param(), // chipStart/chipStreamScheduleChunk set this on a buffer source
      addEventListener() {}, setPeriodicWave() {} });
    class FakeCtx {
      constructor() { this.state = "running"; this.sampleRate = 44100; this.destination = node(); this._t0 = performance.now(); }
      get currentTime() { return (performance.now() - this._t0) / 1000; }
      resume() { return Promise.resolve(); }
      close() { this.state = "closed"; return Promise.resolve(); }
      createGain() { return node(); }
      createOscillator() { return node(); }
      createBufferSource() { return node(); }
      createBuffer(ch, len, sr) { return { getChannelData: () => new Float32Array(len || 1) }; }
      createPeriodicWave() { return {}; }
      createBiquadFilter() { const n = node(); n.frequency = param(); n.Q = param(); n.detune = param(); return n; }
      createDynamicsCompressor() { const n = node(); n.threshold = param(); n.knee = param(); n.ratio = param(); n.attack = param(); n.release = param(); return n; }
      decodeAudioData(buf) { return Promise.resolve({ getChannelData: () => new Float32Array(1), duration: 0.01, length: 1, sampleRate: 44100 }); }
      createAnalyser() { // the Mixer's meters (see tests/harness.mjs's own copy — kept in step)
        const n = node();
        n.fftSize = 2048; n.frequencyBinCount = 1024;
        n.getByteTimeDomainData = (buf) => buf.fill(128);
        n.getByteFrequencyData = (buf) => buf.fill(0);
        return n;
      }
    }
    window.AudioContext = FakeCtx;
    window.webkitAudioContext = FakeCtx;
  });
  // block EVERYTHING off-localhost: the NSF arriving from the public archive
  // triggers the in-page 6502/APU render — seconds of synchronous main-thread
  // emulation that lands at a random moment (network timing) and wedges
  // whatever spec is mid-evaluate (the 30-44s "random spec hangs"). Tests run
  // on synthesized voices and never need the network.
  await page.route(/^(?!.*localhost)/, r => r.abort());
  await page.goto("/index.html");
  // app globals are top-level `let` — not window properties; probe bare identifiers
  await page.waitForFunction(() => { try { return !!song; } catch (e) { return false; } }, null, { timeout: 15000 });
}

export async function newComposition(page, name = "e2e-scratch") {
  await page.evaluate(async n => {
    for (const k of Object.keys(localStorage)) if (k.includes("e2e-scratch") || k.includes("untitled")) localStorage.removeItem(k);
    createComposition(120, 4, 4); // Untitled until Save names it and picks its folder (2026-09-27)
    await saveSongAs("compositions/nightroll", n);
  }, name);
}

export async function seedChord(page) { // C major at bar 1, quarter notes
  await page.evaluate(() => {
    song.tracks[0].notes.push(
      { t: 0, d: 480, p: 60, v: 80 }, { t: 0, d: 480, p: 64, v: 80 }, { t: 0, d: 480, p: 67, v: 80 });
    draw();
  });
}

export async function selectAll(page) {
  await page.evaluate(() => {
    multiSel = song.tracks[0].notes.map((_, ni) => ({ ti: 0, ni }));
    multiSelKey = new Set(multiSel.map(s => "0:" + s.ni));
    draw();
  });
}

// canvas-pixel position of a tick/pitch on the roll (viewport coordinates)
export async function noteXY(page, tick, pitch, ti = 0) {
  return page.evaluate(([tk, p, t]) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: r.left + RULER_W + (tk / song.ppq) * view.pxq - view.x,
      y: r.top + RULER_H + (topRow() - noteRow(t, p)) * view.rowH - view.y + view.rowH / 2,
    };
  }, [tick, pitch, ti]);
}

export async function drag(page, from, to, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export async function notes(page, ti = 0) {
  return page.evaluate(t =>
    song.tracks[t].notes.filter(n => !n.gone).map(n => ({ t: n.t, d: n.d, p: n.p, v: n.v })), ti);
}

export async function cleanup(page) {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.includes("e2e-scratch")) localStorage.removeItem(k);
  });
}

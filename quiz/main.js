// quiz/main.js — the page's entry: wiring only. Loads the bank (docs/
// learning/quizzes.md, falling back to the root copy — whichever the tidy has
// left), the device-local progress blobs, and hands everything to ui.js.
//
// Storage: two keys of the quiz's own (ff1roll-quiz-srs, ff1roll-quiz-prefs).
// The app never evicts or reads them (askEvictOthers touches ff1roll-ask-*,
// hasExistingNightRollPrefs checks lastsong/cfg/ghtoken/notes-/draft-), and
// every access is in try/catch: with storage blocked the page still works,
// it just forgets between visits — the footer says so.
import { parseBank, fetchBank } from "./bank.js";
import { parseSrs, emptySrs } from "./srs.js";
import { makeTone } from "./tone.js";
import { initQuizUi } from "./ui.js";

const KEY_SRS = "ff1roll-quiz-srs", KEY_PREFS = "ff1roll-quiz-prefs";
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (err) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (err) { return false; } },
  ok() { try { const t = "ff1roll-quiz-probe"; localStorage.setItem(t, "1"); localStorage.removeItem(t); return true; } catch (err) { return false; } },
};

async function boot() {
  const root = document.getElementById("app"), status = document.getElementById("status"), nav = document.getElementById("nav");
  let bank = null, bankPath = null, bankError = null;
  try {
    const got = await fetchBank((p, init) => fetch(p, init));
    bank = parseBank(got.text);
    bankPath = got.path;
  } catch (err) {
    bankError = String(err && err.message || err);
  }
  const srs = parseSrs(store.get(KEY_SRS)) || emptySrs();
  let prefs = {};
  try { prefs = JSON.parse(store.get(KEY_PREFS) || "{}") || {}; } catch (err) { prefs = {}; }
  if (typeof prefs !== "object" || Array.isArray(prefs)) prefs = {};
  // vendor/vexflow.js is a classic script loaded before this module; absent
  // (a 404, a blocked script) the staff drill explains instead of throwing
  const VF = (() => { try { return Vex.Flow && Vex.Flow.Stave ? Vex.Flow : null; } catch (err) { return null; } })();
  initQuizUi({
    root, status, nav, bank, bankPath, bankError, srs, prefs,
    saveSrs: () => store.set(KEY_SRS, JSON.stringify(srs)),
    savePrefs: () => store.set(KEY_PREFS, JSON.stringify(prefs)),
    tone: makeTone(), VF, rnd: Math.random, now: () => Date.now(), storageOk: store.ok(),
  });
}

boot().catch(err => {
  const root = document.getElementById("app");
  root.textContent = "";
  const p = document.createElement("p");
  p.className = "error";
  p.textContent = "The quiz page failed to start: " + (err && err.stack || err);
  root.append(p);
});

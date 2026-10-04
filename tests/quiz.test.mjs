// tests/quiz.test.mjs — the standalone quiz page (quiz/, docs/plans/
// 2026-10-04-quiz.md). The pure modules are loaded as real ES modules in a
// vm (the same way tests/harness.mjs loads src/), with a stub localStorage:
// quiz/drills.js reaches src/theory/key.js, whose import of src/state.js
// reads prefs at evaluation time. The rest is source-text: the import
// whitelist that keeps the page isolated from the app, the Learning-mode
// scan, no native dialogs, the theme tokens in step with css/app.css, and
// quiz/ absent from the iPad package.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync, readdirSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plain = x => JSON.parse(JSON.stringify(x)); // vm-realm objects fail deepStrictEqual on prototype alone
const read = rel => readFileSync(path.join(ROOT, rel), "utf8");
const QUIZ_JS = readdirSync(path.join(ROOT, "quiz")).filter(f => f.endsWith(".js")).sort();

// ---- a minimal module loader: vm.SourceTextModule per file, relative
// imports resolved against the importer's path, one context for all --------
const context = vm.createContext({
  console,
  localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
});
const modules = new Map();
function moduleAt(abs) {
  if (!modules.has(abs)) modules.set(abs, new vm.SourceTextModule(readFileSync(abs, "utf8"), {context, identifier: abs}));
  return modules.get(abs);
}
async function importQuiz(rel) {
  const m = moduleAt(path.join(ROOT, rel));
  if (m.status === "unlinked") await m.link((spec, ref) => moduleAt(path.resolve(path.dirname(ref.identifier), spec)));
  if (m.status !== "evaluated") await m.evaluate();
  return m.namespace;
}
const bankMd = () => existsSync(path.join(ROOT, "docs/learning/quizzes.md")) ? read("docs/learning/quizzes.md") : read("quizzes.md");

// ---- bank ----------------------------------------------------------------

test("quiz bank: the real quizzes.md parses — every list item outside Protocol is a question, marks are read not written, ids are stable", async () => {
  const {parseBank, bankId} = await importQuiz("quiz/bank.js");
  const md = bankMd();
  const b = parseBank(md);
  // independent count: `##`/`###` headings, and `- ` items in the sections after Protocol's
  const lines = md.split("\n");
  const headings = lines.filter(l => /^#{2,3} /.test(l));
  let inProto = false, items = 0, marks = {" ": 0, x: 0, "~": 0};
  for (const l of lines) {
    if (/^## /.test(l)) inProto = /^## protocol/i.test(l);
    if (inProto) continue;
    const m = l.match(/^- (?:\[([ x~])\] )?/);
    if (m) { items++; if (m[1]) marks[m[1]]++; }
  }
  assert.equal(b.sections.length, headings.length);
  assert.equal(b.questions.length, items);
  assert.ok(b.questions.length >= 40, "the bank has its 40-odd questions");
  assert.equal(b.bankSections.length, b.sections.filter(s => !s.protocol).length);
  assert.ok(b.sections.some(s => s.protocol), "Protocol is recognised");
  assert.equal(b.questions.filter(q => q.mark === "good").length, marks.x);
  assert.equal(b.questions.filter(q => q.mark === "shaky").length, marks["~"]);
  assert.equal(b.questions.filter(q => q.mark === "new").length, marks[" "]);
  assert.ok(!b.questions.some(q => /^Ask ~5|^Mix recall|^Plain language/.test(q.text)), "Protocol's own bullets are not questions");
  // a continued item is one question; its text is one line
  const vii = b.questions.find(q => q.text.startsWith('Read "V/ii" aloud'));
  assert.ok(vii && vii.text.includes("which chord is it in G major?"));
  assert.ok(!b.questions.some(q => /\n/.test(q.text)));
  assert.equal(new Set(b.questions.map(q => q.id)).size, b.questions.length, "ids unique");
  assert.equal(bankId("Read  \"V/ii\"   aloud"), bankId('read "v/ii" aloud'), "id ignores case and spacing");
  assert.match(vii.id, /^q[0-9a-f]{8}$/);
  for (const q of b.questions) assert.equal(q.section, b.sections.find(s => s.questions.includes(q)).title);
});

test("quiz bank: a trailing 'Answered …' parenthetical is a note kept apart from the question; a trailing paren that asks something stays", async () => {
  const {splitNote, parseBank} = await importQuiz("quiz/bank.js");
  assert.deepEqual(plain(splitNote("Which note proves minor? (Answered: Db — and D natural proves major.)")),
    {text: "Which note proves minor?", note: "Answered: Db — and D natural proves major."});
  assert.deepEqual(plain(splitNote("Held two bars? (graveyard 8–9 — his ear called it \"more sinister\"; why?)")),
    {text: "Held two bars? (graveyard 8–9 — his ear called it \"more sinister\"; why?)", note: ""});
  assert.deepEqual(plain(splitNote("Define the seventh-side resolution (your coinage). Why?")), {text: "Define the seventh-side resolution (your coinage). Why?", note: ""});
  const b = parseBank(bankMd());
  const pivot = b.questions.find(q => q.text.startsWith("The C major triad is a pivot chord"));
  assert.ok(pivot && pivot.note.startsWith("Answered instantly"), "the logged answer is in .note, not .text");
  assert.ok(!pivot.text.includes("IV and V"));
});

test("quiz bank: fetchBank tries docs/learning first and falls back to the root; both missing rejects", async () => {
  const {fetchBank, BANK_PATHS} = await importQuiz("quiz/bank.js");
  assert.deepEqual(plain(BANK_PATHS), ["../docs/learning/quizzes.md", "../quizzes.md"]);
  const calls = [];
  const f404 = async p => { calls.push(p); return p.includes("docs/learning") ? {ok: false, status: 404} : {ok: true, text: async () => "# Quiz Bank\n"}; };
  const r = await fetchBank(f404);
  assert.equal(r.path, "../quizzes.md"); assert.equal(r.text, "# Quiz Bank\n"); assert.deepEqual(calls, plain(BANK_PATHS));
  const first = await fetchBank(async () => ({ok: true, text: async () => "x"}));
  assert.equal(first.path, BANK_PATHS[0]);
  await assert.rejects(fetchBank(async () => { throw new Error("offline"); }), /quiz bank not found.*offline/);
});

// ---- Leitner -------------------------------------------------------------

test("quiz srs: got promotes one box (capped), shaky lands in box 1, missed in box 0; due follows the box interval", async () => {
  const S = await importQuiz("quiz/srs.js");
  const srs = S.emptySrs(), now = 1_000_000_000_000, id = "q00000001";
  assert.equal(S.entry(srs, id, "new").box, 0);
  assert.equal(S.entry(srs, id, "shaky").box, 1);
  assert.equal(S.entry(srs, id, "good").box, 2);
  let e = S.grade(srs, id, "got", now, "new");
  assert.equal(e.box, 1); assert.equal(e.due, now + S.DAY); assert.equal(e.streak, 1); assert.equal(e.seen, 1);
  for (let i = 0; i < 10; i++) e = S.grade(srs, id, "got", now, "new");
  assert.equal(e.box, S.BOXES - 1, "capped at the top box"); assert.equal(e.due, now + S.BOX_DAYS[S.BOXES - 1] * S.DAY);
  e = S.grade(srs, id, "shaky", now, "new");
  assert.equal(e.box, 1); assert.equal(e.streak, 0);
  e = S.grade(srs, id, "missed", now, "new");
  assert.equal(e.box, 0); assert.equal(e.due, now, "box 0 is due again now");
  assert.throws(() => S.grade(srs, id, "meh", now), /unknown result/);
  assert.ok(S.isDue({box: 0, due: 0, last: 0}, now), "never asked = due");
  assert.ok(!S.isDue({box: 2, due: now + 1, last: now}, now));
});

test("quiz srs: pickNext takes the lowest box, then the longest since asked; excludes this sitting's ids; null when nothing is due", async () => {
  const S = await importQuiz("quiz/srs.js");
  const now = 2_000_000_000_000, day = S.DAY;
  const qs = [{id: "qaaaaaaa1", mark: "good"}, {id: "qaaaaaaa2", mark: "new"}, {id: "qaaaaaaa3", mark: "new"}, {id: "qaaaaaaa4", mark: "shaky"}];
  const srs = S.emptySrs();
  // q2 asked yesterday and missed (box 0, due now); q3 never asked (box 0); q4 box 1; q1 box 2
  S.grade(srs, "qaaaaaaa2", "missed", now - day, "new");
  const order = [];
  const seen = new Set();
  for (let i = 0; i < 5; i++) { const q = S.pickNext(srs, qs, now, () => 0.5, seen); if (!q) break; order.push(q.id); seen.add(q.id); }
  assert.deepEqual(plain(order), ["qaaaaaaa3", "qaaaaaaa2", "qaaaaaaa4", "qaaaaaaa1"], "never-asked before asked-yesterday within box 0; then box 1, box 2");
  assert.equal(S.pickNext(srs, qs, now, Math.random, seen), null);
  // after a 'got' on every question nothing is due until tomorrow
  for (const q of qs) S.grade(srs, q.id, "got", now, q.mark);
  assert.equal(S.dueCount(srs, qs, now), 0);
  assert.ok(S.dueCount(srs, qs, now + 2 * day) >= 1);
  assert.deepEqual(plain(S.boxHistogram(srs, qs)), [0, 2, 1, 1, 0]);
});

test("quiz srs: a stored blob is parsed defensively — garbage, wrong shapes and out-of-range boxes never throw", async () => {
  const S = await importQuiz("quiz/srs.js");
  assert.deepEqual(plain(S.parseSrs("not json")), plain(S.emptySrs()));
  assert.deepEqual(plain(S.parseSrs("[1,2]")), plain(S.emptySrs()));
  const p = S.parseSrs(JSON.stringify({v: 1, q: {q0000000a: {box: 9, due: "x", last: 5, seen: 2, streak: 1}, bad: {box: 1}, q0000000b: null}}));
  assert.deepEqual(plain(Object.keys(p.q)), ["q0000000a"]);
  assert.deepEqual(plain(p.q.q0000000a), {box: 0, due: 0, last: 5, seen: 2, streak: 1});
});

// ---- drills --------------------------------------------------------------

test("quiz drills: 500 draws per kind and level — every drill is valid (answer among unique choices, notes match) and coverage is uniform", async () => {
  const D = await importQuiz("quiz/drills.js");
  const {CHORD_QUALS, LETTER_PC} = await importQuiz("src/theory/chords.js");
  const {keyNameToSf} = await importQuiz("src/theory/key.js");
  const N = 500;
  for (const {kind} of D.DRILLS) for (let level = 1; level <= D.MAX_LEVEL; level++) {
    const rnd = D.makeRng(kind.length * 1000 + level);
    const seen = new Map();
    for (let i = 0; i < N; i++) {
      const d = D.genDrill(kind, level, rnd);
      const where = kind + " L" + level + " #" + i;
      assert.equal(d.kind, kind, where); assert.equal(d.level, level, where);
      assert.ok(d.prompt && d.prompt.length > 10, where + " prompt");
      const values = d.choices.map(c => c.value);
      assert.equal(new Set(values).size, values.length, where + " choices unique");
      assert.ok(d.choices.every(c => c.label && c.value !== undefined), where + " labels");
      assert.ok(values.includes(d.answer), where + " answer among choices");
      assert.ok(D.checkAnswer(d, d.answer), where + " its own answer checks true");
      assert.ok(values.filter(v => v !== d.answer).every(v => !D.checkAnswer(d, v)), where + " every other choice checks false");
      if (kind.startsWith("interval")) {
        const iv = D.INTERVALS.find(x => x.short === d.answer);
        assert.equal(d.notes[1] - d.notes[0], iv.semis, where + " semitones");
        assert.ok(d.notes[0] >= 48 && d.notes[1] <= 84, where + " range");
        assert.ok(D.cumulative(D.INTERVAL_LEVELS, level).includes(d.answer), where + " in the level's set");
        assert.ok(d.play.length && d.play.every(e => e.notes.length && e.dur > 0), where + " playable");
      } else if (kind === "chord-ear") {
        const tmpl = CHORD_QUALS.find(([q]) => q === d.answer)[1];
        assert.deepEqual(plain(d.notes.map(n => n - d.notes[0])), plain(tmpl), where + " template");
        assert.ok(D.cumulative(D.CHORD_LEVELS, level).includes(d.answer), where);
      } else if (kind === "degree-ear") {
        assert.ok(level >= 2 || d.mode === "major", where + " level 1 is major only");
        const steps = d.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
        assert.equal(d.notes[1] - d.notes[0], steps[+d.answer - 1], where);
      } else if (kind === "keysig") {
        assert.ok(Math.abs(d.sf) <= D.KEYSIG_RANGE[level - 1], where + " sf within the level");
        assert.equal(D.drillKeySf(d), d.sf, where + " the app's own key reader agrees");
        assert.ok(level >= 3 || d.mode === "major", where);
        // every CHOICE is a real key / real count, in the level's range
        for (const c of d.choices) {
          if (/^-?\d+$/.test(c.value)) assert.ok(Math.abs(+c.value) <= D.KEYSIG_RANGE[level - 1], where);
          else assert.ok(Math.abs(keyNameToSf(c.value)) <= D.KEYSIG_RANGE[level - 1], where + " choice " + c.value);
        }
      } else if (kind === "spelling") {
        assert.equal(D.drillKeySf(d), d.sf, where);
        assert.ok(d.noteAnswer && d.enharmonicOk === false, where + " a key-spelling drill does not accept the enharmonic twin");
        const pc = (LETTER_PC[d.answer[0]] + (d.answer[1] === "#" ? 1 : d.answer[1] === "b" ? -1 : 0) + 12) % 12;
        // the twin, when offered, names the same pitch class with another letter
        for (const c of d.choices) if (c.value !== d.answer && D.notePc(c.value) === pc) assert.notEqual(c.value[0], d.answer[0], where);
      }
      const drawn = d.sf !== undefined ? d.sf : d.answer; // a key drill draws its SIGNATURE uniformly; the note names that follow are not uniform by nature
      seen.set(drawn, (seen.get(drawn) || 0) + 1);
    }
    // uniform: every answer in the working set shows up, none rarer than a third of its share
    const expected = N / seen.size;
    for (const [k, n] of seen) assert.ok(n >= expected / 3, kind + " L" + level + ": " + k + " drawn " + n + " of " + N + " (" + seen.size + " kinds)");
    const setSize = kind.startsWith("interval") ? D.cumulative(D.INTERVAL_LEVELS, level).length
      : kind === "chord-ear" ? D.cumulative(D.CHORD_LEVELS, level).length
      : kind === "degree-ear" ? 7 : 2 * D.KEYSIG_RANGE[level - 1] + 1;
    if (setSize) assert.equal(seen.size, setSize, kind + " L" + level + " covers its whole set");
  }
});

test("quiz drills: note answers accept ♭/b and ♯/# spellings and case; the enharmonic twin passes only when the drill says so", async () => {
  const D = await importQuiz("quiz/drills.js");
  const d = {kind: "spelling", noteAnswer: true, enharmonicOk: false, answer: "Ab", choices: []};
  assert.ok(D.checkAnswer(d, "Ab")); assert.ok(D.checkAnswer(d, "A♭")); assert.ok(D.checkAnswer(d, "ab")); assert.ok(D.checkAnswer(d, " A b "));
  assert.ok(!D.checkAnswer(d, "G#")); assert.ok(!D.checkAnswer(d, "G♯")); assert.ok(!D.checkAnswer(d, "A")); assert.ok(!D.checkAnswer(d, "")); assert.ok(!D.checkAnswer(d, "H"));
  assert.ok(D.checkAnswer({...d, enharmonicOk: true}, "G#"), "the twin passes when the drill allows it");
  assert.ok(!D.checkAnswer({...d, enharmonicOk: true}, "A"));
  // plain (non-note) answers compare as strings
  assert.ok(D.checkAnswer({answer: "P5"}, "P5")); assert.ok(!D.checkAnswer({answer: "P5"}, "p5"));
  assert.equal(D.normalizeNote("e♭"), "Eb"); assert.equal(D.normalizeNote("F#4"), "F#"); assert.equal(D.normalizeNote("x"), null);
  assert.equal(D.pretty("Eb"), "E♭"); assert.equal(D.pretty("F#"), "F♯"); assert.equal(D.pretty("Bbm"), "B♭m"); assert.equal(D.pretty("B"), "B");
  assert.equal(D.sfLabel(0), "no sharps or flats"); assert.equal(D.sfLabel(1), "1 sharp"); assert.equal(D.sfLabel(-3), "3 flats");
  assert.equal(D.keyLabel(-3, "minor"), "C minor"); assert.equal(D.keyLabel(6, "major"), "F♯ major"); assert.equal(D.keyName(-7, "minor"), "Abm"); assert.equal(D.keyName(7, "minor"), "A#m");
  assert.deepEqual([0, 4, 5, 9, 10, 14, 99].map(D.levelFor), [1, 1, 2, 2, 3, 3, 3]);
  assert.throws(() => D.genDrill("nope"), /unknown kind/);
  const r1 = D.makeRng(7), r2 = D.makeRng(7);
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()], "seeded rng repeats");
});

// ---- isolation (source text) ---------------------------------------------

test("quiz isolation: quiz/*.js imports only each other and the three pure app modules; nothing from audio/ui-chrome/session/ask/model/platform", () => {
  const allowed = new Set(["../src/theory/chords.js", "../src/theory/key.js", "../src/ui/piano.js"]);
  for (const f of QUIZ_JS) {
    const src = read("quiz/" + f);
    for (const m of src.matchAll(/(?:^|\n)\s*import\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const spec = m[1] || m[2];
      assert.ok(/^\.\/[\w-]+\.js$/.test(spec) || allowed.has(spec), "quiz/" + f + " imports " + spec);
    }
  }
  // pure means pure: the allowed app modules reach nothing beyond state.js (key.js) and chords.js
  for (const rel of ["src/theory/chords.js", "src/theory/key.js", "src/ui/piano.js"]) {
    const imports = [...read(rel).matchAll(/^import .* from "([^"]+)";/gm)].map(m => m[1]);
    assert.ok(imports.every(s => /^\.\.?\/(state|chords|theory\/chords)\.js$/.test(s)), rel + " imports " + imports.join(", "));
  }
  assert.ok(!QUIZ_JS.some(f => read("quiz/" + f).includes("/vendor/")), "vexflow comes in as the page's classic <script> global, never an import");
});

test("quiz isolation: Learning mode — the quiz never reads Josh's songs, drafts or notes, and never opens albums/", () => {
  for (const f of QUIZ_JS) {
    const src = read("quiz/" + f);
    for (const bad of ["ff1roll-notes", "ff1roll-draft", "ff1roll-lastsong", "albums/", "S.song", "rollnotes", "compositions"])
      assert.ok(!src.includes(bad), "quiz/" + f + " mentions " + bad);
  }
  // the device-local keys are the quiz's own, so nothing in the app can evict or read them
  const all = QUIZ_JS.map(f => read("quiz/" + f)).join("\n");
  const keys = [...all.matchAll(/["'](ff1roll-[\w-]+)["']/g)].map(m => m[1]);
  assert.ok(keys.length === 0 || keys.every(k => k.startsWith("ff1roll-quiz-")), "storage keys: " + [...new Set(keys)].join(", "));
});

test("quiz isolation: no native dialogs anywhere under quiz/", () => {
  for (const f of readdirSync(path.join(ROOT, "quiz"))) {
    const src = read("quiz/" + f);
    assert.doesNotMatch(src, /\b(?:window\.)?(alert|confirm|prompt)\s*\(/, "quiz/" + f);
  }
});

test("quiz isolation: not in the iPad package — tools/package.mjs copies only its TOP_DIRS/TOP_FILES, and quiz is in neither; not under src/ (check.mjs rule 8 would force it into the app's manifests)", () => {
  const pkg = read("tools/package.mjs");
  const dirs = JSON.parse(pkg.match(/const TOP_DIRS = (\[[^\]]*\]);/)[1]);
  const files = JSON.parse(pkg.match(/const TOP_FILES = (\[[^\]]*\]);/)[1]);
  assert.ok(!dirs.includes("quiz") && !files.some(f => f.startsWith("quiz")), "package copies " + dirs.join(","));
  assert.ok(!existsSync(path.join(ROOT, "src/quiz")));
  assert.ok(!read("index.html").includes("quiz/"), "the app does not link the page (isolation is the point; docs/quiz.md says where it WOULD go)");
  assert.ok(!read("sw.js").match(/PRECACHE = \[[^\]]*quiz/), "never precached");
});

test("quiz page: index.html is its own document (doctype, charset, viewport), no manifest, no SW registration, classic vexflow then the module entry; quiz.css carries css/app.css's tokens verbatim", () => {
  if (!existsSync(path.join(ROOT, "quiz/index.html"))) return; // U2 lands the page; U1 is the core alone
  const html = read("quiz/index.html");
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1/);
  assert.doesNotMatch(html, /rel="manifest"|serviceWorker/);
  assert.match(html, /<link rel="stylesheet" href="quiz\.css">/);
  assert.doesNotMatch(html, /app\.css/, "does not link the app's stylesheet (65 KB of layout that would fight the page)");
  assert.ok(html.indexOf('<script src="../vendor/vexflow.js"></script>') < html.indexOf('<script type="module" src="main.js"></script>'), "vexflow's global exists before main.js runs");
  const tokens = css => Object.fromEntries([...css.match(/:root\s*\{([\s\S]*?)\}/)[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  const app = tokens(read("css/app.css")), quiz = tokens(read("quiz/quiz.css"));
  for (const t of ["bg", "panel", "panel2", "text", "dim", "accent", "gold", "grid", "mono", "sans"])
    assert.equal(quiz[t], app[t], "--" + t + " drifted from css/app.css");
  assert.ok(!html.includes("../src/"), "the page's only module graph entry is main.js");
});

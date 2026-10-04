#!/usr/bin/env node
// A move commit only MOVES code: every line it removes from src/ must come
// back somewhere in src/, and nothing new appears — apart from import lines,
// `export` keywords, the generated e2e footer, devtools' namespace list,
// comment placement, and (docs/split-phase2-plan.md §1 M4.3) the structural
// lines move.mjs --init produces (an `export function <InitName>() {`
// header, its closing `}`, and the bare `<InitName>();` stub it leaves at
// the original spot) and, with `--hook X,Y`, a hook commit's own sanctioned
// shape (see classifyDiff below). Catches move.mjs's known slips (a bogus
// same-file self-import; two statements joined onto one line), which
// check.mjs can't.
//   node tools/split/verbatim.mjs [--hook X,Y] <rev>     (default HEAD) — compares rev~1..rev
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const norm = l => l.trim().replace(/^export\s+/, "").replace(/\s+\/\/\s.*$/, "").trim();
const isNamespaceListLine = l => /^[\w$]+(,\s*[\w$]+)*,?\s*(\};)?$/.test(l); // devtools' namespace list lines
const HOOK_FILE_RE = /(^|\/)(hooks|wire)\.js$/;

// move.mjs --init's own structural shapes (§1 M4.3) — unambiguous by exact
// text, tolerated unconditionally (both when added by a fresh --init move
// and when removed by later reverting one). Matched against norm()'d text,
// which already strips a leading "export " — so no "export " here either.
const INIT_HEADER = /^function (init[A-Za-z_$][\w$]*)\(\) \{$/;
const INIT_STUB = /^(init[A-Za-z_$][\w$]*)\(\);$/;

// ---- --hook X,Y tolerance (§1 M4.3's "gains ... --hook X,Y" bullet) -------
// For a listed name X: `function X(` -> `function XImpl(` (export/async
// variants handled by norm() already stripping "export "/async stays in the
// matched text) and `X = prof("X", X)` -> `XImpl = prof("X", XImpl)` (the
// label STRING stays "X", unchanged — only the two bare identifiers rename)
// are RENAMES, not moves: the removed and added text can never match
// verbatim by construction, so the normal lost/extra comparison must not see
// either side of the pair at all.
function renamedFunctionLine(line, name) {
  const re = new RegExp(`\\bfunction\\s+${name}(\\s*\\()`);
  if (!re.test(line)) return null;
  return line.replace(re, `function ${name}Impl$1`);
}
function renamedProfLine(line, name) {
  const re = new RegExp(`^${name}\\s*=\\s*prof\\("${name}",\\s*${name}\\);?$`);
  if (!re.test(line)) return null;
  return `${name}Impl = prof("${name}", ${name}Impl);`;
}

/** Classifies a unified diff's src/ hunks into "lost" (removed with no
 *  surviving counterpart) and "extra" (added with no removed counterpart)
 *  line sets. Pure — string in, data out — so it's unit-testable on
 *  constructed diff text, without needing real git history.
 *  `opts.hookNames`: `--hook X,Y` mode (see the file header comment). */
export function classifyDiff(diffText, opts = {}) {
  const hookNames = opts.hookNames || null;
  const rem = new Map(), add = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  let curFile = null;
  for (const line of diffText.split("\n")) {
    const dm = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (dm) { curFile = dm[2]; continue; }
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;
    if (line[0] !== "-" && line[0] !== "+") continue;
    // --hook: a hook commit may change src/hooks.js and src/wire.js freely
    // (every line in either is new machinery, not moved code).
    if (hookNames && curFile && HOOK_FILE_RE.test(curFile)) continue;
    const text = norm(line.slice(1));
    // a multi-line import's closing line (`} from "./x.js";`) is an import
    // line too — wire.js keeps its impl imports in that shape, and
    // re-pointing one (phase 2 step 10: recFinishImpl app.js → input/record.js)
    // changes exactly that line; the opener is caught by "import " above.
    if (!text || text.startsWith("import ") || /^\} from "[^"]+";$/.test(text) || text.startsWith("//") || text.includes("__nrExpose$")) continue;
    if (line[0] === "-") bump(rem, text); else bump(add, text);
  }

  if (hookNames) {
    for (const name of hookNames) {
      for (const [removedLine, count] of [...rem]) {
        if (!count) continue;
        const renamedFn = renamedFunctionLine(removedLine, name);
        if (renamedFn && (add.get(renamedFn) || 0) > 0) {
          const n = Math.min(count, add.get(renamedFn));
          rem.set(removedLine, count - n); add.set(renamedFn, add.get(renamedFn) - n);
          continue;
        }
        const renamedProf = renamedProfLine(removedLine, name);
        if (renamedProf && (add.get(renamedProf) || 0) > 0) {
          const n = Math.min(count, add.get(renamedProf));
          rem.set(removedLine, count - n); add.set(renamedProf, add.get(renamedProf) - n);
        }
      }
    }
    // a single new `installHooks();` call stub is always tolerated.
    if (add.has("installHooks();")) add.set("installHooks();", 0);
    // src/state.js's own new literal field (docs/split-phase2-plan.md §1
    // M1's code sketch: `hooks: {},` in S's initial object literal) is
    // genuinely new text, not moved from anywhere — the one state.js change
    // an H commit makes, tolerated unconditionally rather than joined onto
    // whatever line happens to precede it (the same AUDIO_STRIP_H-shaped
    // call docs/split-plan.md's Deviations (11) made for a line that is
    // truly new, not a move a differ could ever match against a removed
    // counterpart).
    if (add.has("hooks: {},")) add.set("hooks: {},", 0);
  }

  // The init-wrapper header/stub are unambiguous by shape — zero them out
  // unconditionally. Their closing `}` isn't (every OTHER block's own
  // closing brace trims to the identical "}"), so only as many extra/lost
  // bare `}` as there are net new/removed headers are tolerated, never more.
  let netHeaders = 0;
  for (const [k, c] of add) if (INIT_HEADER.test(k)) { netHeaders += c; add.set(k, 0); }
  for (const [k, c] of rem) if (INIT_HEADER.test(k)) { netHeaders -= c; rem.set(k, 0); }
  for (const [k] of add) if (INIT_STUB.test(k)) add.set(k, 0);
  for (const [k] of rem) if (INIT_STUB.test(k)) rem.set(k, 0);
  if (netHeaders > 0) add.set("}", Math.max(0, (add.get("}") || 0) - netHeaders));
  else if (netHeaders < 0) rem.set("}", Math.max(0, (rem.get("}") || 0) + netHeaders));

  const only = (a, b) => [...a].filter(([k, n]) => n > (b.get(k) || 0) && !isNamespaceListLine(k)).map(([k]) => k);
  return { lost: only(rem, add), extra: only(add, rem) };
}

/** The same-file self-import bug (tools/split/move.mjs, docs/split-plan.md's
 *  Deviations (8)-(13)): a bare `import { X } from "./thisFile.js";` inside
 *  thisFile.js itself. `fileContents`: Map<relPath, sourceTextAtRev>. Pure. */
export function findSelfImports(fileContents) {
  const out = [];
  for (const [f, src] of fileContents) {
    const base = f.split("/").pop();
    for (const m of src.matchAll(/^import .* from "\.\/([^"]+)";/gm)) if (m[1] === base) out.push(`${f}: ${m[0]}`);
  }
  return out;
}

// ---- CLI -------------------------------------------------------------------

function isMain() {
  try { return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]); }
  catch { return false; }
}

if (isMain()) {
  const argv = process.argv.slice(2);
  let hookNames = null, rev = "HEAD";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--hook") hookNames = argv[++i].split(",").map(s => s.trim()).filter(Boolean);
    else rev = argv[i];
  }
  const diff = execFileSync("git", ["diff", `${rev}~1`, rev, "--", "src/"], { encoding: "utf8", maxBuffer: 1 << 28 });
  const { lost, extra } = classifyDiff(diff, { hookNames });

  const changedFiles = execFileSync("git", ["diff", "--name-only", `${rev}~1`, rev, "--", "src/"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const fileContents = new Map();
  for (const f of changedFiles) {
    try { fileContents.set(f, execFileSync("git", ["show", `${rev}:${f}`], { encoding: "utf8" })); } catch { /* deleted at rev — nothing to scan */ }
  }
  const selfImports = findSelfImports(fileContents);

  for (const k of lost) console.log("lost:  " + k.slice(0, 160));
  for (const k of extra) console.log("extra: " + k.slice(0, 160));
  for (const s of selfImports) console.log("self-import: " + s);
  if (lost.length || extra.length || selfImports.length) { console.log(`✖ ${rev} is not a pure move`); process.exit(1); }
  console.log(`✔ ${rev}: every moved line arrived intact`);
}

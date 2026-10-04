// Generates docs/HELP.md from the help sheet, so the in-app help and the repo
// manual are the same text by construction. Two inputs since docs/plans/
// 2026-10-04-help-out.md: the sections (dt/dd prose) are help/help.html, the
// tab labels (and their order) are index.html's #helptabs.
// Usage: node tools/build_help.mjs   (writes docs/HELP.md; moved from the root
// in the 2026-10-04 repo tidy — the app links it by its GitHub URL)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function decode(t) {
  return t
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function inline(t) {
  return decode(
    t.replace(/<b>([\s\S]*?)<\/b>/g, "**$1**")
     .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
     .replace(/<[^>]+>/g, "")
  ).replace(/\s+/g, " ").trim();
}

export function buildHelp(html, helpHtml) {
  const sheet = html.slice(html.indexOf('id="helpsheet"'), html.indexOf('id="filesheet"')) + "\n" + helpHtml;
  const tabs = {};
  // [^>]* (2026-09-30, VoiceOver first pass): the tabs now carry role="tab"
  // aria-selected="…" between data-hs and the closing '>' — tolerate any
  // attributes there instead of requiring data-hs to be the last one.
  for (const m of sheet.matchAll(/<button data-hs="(\w+)"[^>]*>([\s\S]*?)<\/button>/g))
    tabs[m[1]] = inline(m[2]);
  const secs = [...sheet.matchAll(/<div class="hsec" data-hsec="(\w+)">([\s\S]*?)\n    <\/div>/g)];
  const order = Object.keys(tabs); // tab-bar order, not DOM order
  secs.sort((a, b) => order.indexOf(a[1]) - order.indexOf(b[1]));

  let out = "# Night Roll — Manual\n\n" +
    "<!-- GENERATED from help/help.html (sections) and index.html's help tabs by tools/build_help.mjs — do not edit by hand. -->\n" +
    "\nEverything here is also in the app: File → Help.\n";
  for (const [, key, body] of secs) {
    out += `\n## ${tabs[key] || key}\n`;
    for (const m of body.matchAll(/<h3>([\s\S]*?)<\/h3>|<dt>([\s\S]*?)<\/dt>|<dd>([\s\S]*?)<\/dd>/g)) {
      if (m[1] !== undefined) out += `\n### ${inline(m[1])}\n`;
      else if (m[2] !== undefined) out += `\n**${inline(m[2])}**\n`;
      else out += `${inline(m[3])}\n`;
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const md = buildHelp(readFileSync(join(ROOT, "index.html"), "utf8"), readFileSync(join(ROOT, "help", "help.html"), "utf8"));
  writeFileSync(join(ROOT, "docs", "HELP.md"), md);
  console.log(`docs/HELP.md written (${md.length} chars)`);
}

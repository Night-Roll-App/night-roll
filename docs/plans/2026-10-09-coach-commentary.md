# Coach commentary on Josh's annotations — design (2026-10-09)

Status: **design, awaiting Josh's rulings (questions at the end).** Advisor
draft, unsteered: Josh's words + the repo's constraints only.

## The problem, in plain words

Josh annotates a song (chords, sections, keys, song notes, the Analysis
sheet), then hands it to his composition coach. She should be able to:

1. **open** that analysis on her own device, hearing the music and seeing
   his chord bands, sections and notes exactly where he put them;
2. **comment on one specific thing** — "this chord at bar 5 is not G7/B,
   listen to the bass again" — or on a bar he left blank, or on the song
   as a whole;
3. maybe **add her own text notes**;

and Josh should **see her comments on the annotation they are about,
answer them, and fix (or keep) his annotation himself.**

Today the app has no accounts and no server (README.md: "no account, no
server and no build step"); the only shared place is GitHub. Josh's songs
and annotations already live in the public repo Night-Roll-App/night-roll
(`cfg()` defaults, src/platform/storage.js:206-207), so his analyses are
already readable by anyone with a link. What is missing is a way for her
words to come back, and a place for them to live.

## Facts the design rests on (verified in the code)

- **She can already open his song in a browser.** A song link is its path
  (NIGHT-ROLL.md "Shareable links"); `shareLinkFor`
  (src/sync/publish.js:199) builds it. The annotations come along: the
  `.rollnotes.json` is fetched from the analysis repo (`analysisURL`,
  storage.js:262).
- **But a link to Josh's own repo is NOT read-only.** Read-only "link mode"
  (`LINK_SONGS`) only switches on with `?songs=owner/repo`, which
  `shareLinkFor` omits for the app's own repo. On her device the song opens
  as a normal published song; "Edit locally" would make a device-only copy.
  Nothing reaches Josh, but it is confusing, and there is no comment path.
- **Link mode already refuses every write**: note editor
  (src/ui/note-editor.js:480), Analysis sheet (src/ui/study-sheet.js:137 —
  the sheet still opens, read-only), Ask tools (src/ask/tools.js:190 etc.),
  Analyze (src/gen/analysis.js:97). A review mode can reuse this wall.
- **Annotations have no stable id.** An entry is `at` + `type` + value
  (docs/annotations-v2.md); the Ask "id" is a per-turn handle
  (src/ask/context.js:332). A comment must anchor by bar.beat + type + a
  quote of the value, and cope when Josh later changes it.
- **The rollnotes merge is the code that lost Josh's notes before**
  (6ad5eee; NIGHT-ROLL.md model/edits.js entry). Anything new should avoid
  riding through `mergeLocalAdditions`/tombstones if it can.
- **Forward compatibility exists**: an unknown entry type is kept verbatim
  (`n.opaque`), so old builds would not destroy a new entry type — but they
  would show it in All notes under its type name.
- **A fresh device starts in Normal mode** (NIGHT-ROLL.md "Learning /
  Normal mode": `hasExistingNightRollPrefs`), so the coach would see the
  app's labelled estimates unless review mode decides otherwise.

## Keeping the coach apart from Learning mode

Learning mode binds **the app and Claude**: they never volunteer keys,
chords or verdicts. A coach Josh invited is a person he chose to hear from;
her verdicts are the point. Every option below keeps the two apart the
same way:

- **Her words are labelled as hers** (her name on every comment), drawn in
  their own layer — never written into his `.rollnotes.json`, never shown
  as an annotation.
- **Claude never sees them unless Josh asks.** The ✦ Ask `<context>` block
  leaves comments out (like it leaves out track/lane directives today); one
  Ask action reads them on an explicit request ("what did she say about
  bar 5?"), and then Claude relays, never expands her answer into more
  answers. `tools/annotations.mjs` lists them only with a flag; WEB-SESSION
  says web sessions do not read them unasked.
- **Nothing from Normal mode leaks in.** The comment box takes only what
  she types — no "insert estimated chord" button — so her device's mode
  cannot write an app estimate into the repo under her name.
- **Optional hint-first reveal** (Q4): Josh may want "she flagged bar 5"
  before he sees what she wrote, so the discovery stays his.

## Option A — Review link, no account for her (comments file in the repo)

- **How she opens it.** Josh taps "Send for review" on a song: the app
  makes a link with `?review=<her name>` that opens the song in a
  read-only review mode (link mode's wall, plus a 💬 Comment button). Works
  in Safari/Chrome on anything; no install, no account.
- **How she comments on one thing.** She taps a chord band, section flag,
  song note, Analysis-sheet answer, or an empty spot on a bar → 💬 → types.
  The comment stores `{at:[5,3], on:{type:"chord", quote:"G7/B"}, by,
  text, ts, id}` (or `on:{item:"summary.what"}` / `on:{songnote:"Sway"}` /
  just `at` for a bare bar). Her drafts stay on her device until sent.
- **How it gets to Josh.** "Send to Josh" packs her comments, compressed,
  into the `#` part of a link (never sent to any server) and opens the
  share sheet — Messages or email. Josh taps it in his app: "Add Anna's 6
  comments to Matoya's Cave?" One tap.
- **Where they live.** A sidecar `<song>.comments.json` next to the
  `.rollnotes.json` in the analysis repo, one comment per line,
  `format: "night-roll-comments"`, merged by comment `id` only
  (append-only; never touches his annotations). Published by Josh's normal
  Publish.
- **How Josh sees and answers.** A 💬 badge on the annotation (or bar) a
  comment is about; a "Coach comments" list in ☰ Notes (open / answered);
  a reply box under each. If he changed the annotation since, the comment
  says "on G7/B (now G7)". His replies publish with the song; when she
  reopens her review link she sees them (public raw read, no account).
- **Privacy.** Same as his annotations today: public repo, readable by
  anyone who finds the file. The `#` payload is not logged anywhere.
- **Effort.** Medium-large: review mode + composer (1 builder pass), the
  sidecar format/reader/writer + import (1), badges/list/replies + Ask
  actions + help (1). No new server, no new dependency.
- **Risks.** Round trips go through Messages (she sends, he imports — a
  little clunky); no notifications (he tells her); bar edits (Insert/Delete
  bars) don't move comment anchors in v1 — they fall back to the quote and
  show as "moved"; a very long review could make a long link (fallback:
  share a small file).

## Option B — GitHub review, no app code first

- **How she opens it.** She makes a free GitHub account. Josh opens a pull
  request "Analysis: Matoya's Cave — for review" containing the song's
  `.rollnotes.json` (one annotation per line, so each line is one chord or
  section); the PR description carries the song link so she can listen.
- **How she comments on one thing.** GitHub's line comment on the exact
  line `{"at":[5,3],"type":"chord","chord":"G7/B"}`. Threads, replies,
  "resolved" and email notifications come for free.
- **How Josh sees and answers.** GitHub (web or app). Later, optionally,
  the app reads the PR's comments with his token and shows a 💬 on the
  matching annotation.
- **Privacy.** Public repo → public comments. A private repo means she
  needs access, and his songs must stay public for share links
  (open-items "PRIVATE REPO" advisor) — so a separate private review repo.
- **Effort.** Zero to start; reading comments in-app later is medium.
- **Risks.** She reads JSON, not music — bar numbers yes, but no roll, no
  playback in the same place; needs an account and some GitHub comfort;
  comments live in GitHub, not in a repo file, so the vm tools and offline
  app cannot see them; Josh's hands — GitHub on iPad is a lot of typing.

## Option C — She is a collaborator and writes directly

- Same review mode and same sidecar as A, but she connects GitHub in
  Settings (the existing two-step repo + token flow) and her 💬 publishes
  straight to `<song>.comments.json`. No Messages hop; Josh sees comments
  on his next open.
- **Privacy.** A collaborator token can write the whole repo, not just
  comment files; the app would have to refuse every other write in review
  mode. Same public visibility as A.
- **Effort.** A, plus a "comments only" publish path and a lock that
  keeps her token away from songs: medium on top of A.
- **Risks.** Account + token setup for a music coach (the token page is
  the hardest screen in the app); two people writing the same file (needs
  the stale-sha retry `putRollnotes` already has, src/sync/publish.js:250).

Rejected: a third-party comment store (Firebase, Supabase, a hosted
Disqus-style widget) — it is a server and an account, holds his work
outside his repo, and breaks "the repo is the real state".

## Recommendation

**Option A, built so C can be added later without changing the file.**
It is the only option where she needs nothing but a link, and she comments
*on the music* — tapping the chord band she hears — not on a line of JSON.
Her words live in Josh's repo, in a file that is not his annotations, so a
bug in comments can never cost him a note, and the Learning-mode line is a
file boundary that is easy to enforce (Ask and the tools simply don't read
that file unless asked). If she turns out to like GitHub, C reuses the
same sidecar and drops the Messages hop.

The steelman for B: it costs nothing, has threads and email today, and
might show within a week whether she even wants per-chord comments or
prefers a phone call with the song open. That is why step 0 below is a
no-code trial.

Shipping checklist items this will need: help-sheet entries (Annotate tab:
coach comments; Sync/Publish tab: Send for review), drift keywords, Ask
actions in src/ask/actions.js (`coach_comments` — list on request only;
`reply_comment` — his words; `review_link` — make the link), the sidecar
documented in NIGHT-ROLL.md + a schema beside docs/annotations-v2.schema.json,
WEB-SESSION.md (sessions don't read comments unasked), and a CLAUDE.md
line if Josh rules the sidecar is real song state (Q2).

## Smallest first step

**Step 0 (no code, this week):** send her the link Night Roll's 🔗 Share
link already makes for one analysed song, and let her answer in plain
email/Messages using bar.beat ("5.3: …"). Tell her nothing she does in the
app leaves her device. Learn: does she use the roll, the score or the
Analysis sheet? Does she comment on chords, on bars, or on the whole piece?

**Step 1 (first code):** the `?review=` link: read-only review mode, a 💬
composer on any annotation or bar, and "Send to Josh" that, for now,
produces a plain readable list ("Bar 5 beat 3 · chord G7/B — Anna: …") she
pastes into Messages. Useful on its own; the import and the sidecar
(step 2) and badges/replies (step 3) build on the same comment shape.

## Questions for Josh

Q1. **Does she get a GitHub account?** No account = she only taps links
and sends you a message back (Option A). An account = her comments land
by themselves, but she sets up a token once (C), or reviews on GitHub's
site (B). *Example: no account — she taps your link, writes 4 comments,
taps "Send to Josh", you get a text.*

Q2. **Her comments in their own file, beside your notes file?**
*Example: Matoya's Cave would have `matoyas-cave.rollnotes.json` (yours,
untouched) and `matoyas-cave.comments.json` (hers and your replies).* The
other way is to put them inside your notes file, marked as hers.

Q3. **Public is OK?** Your annotations are already public on GitHub; her
comments would be too, and your replies. *Example: anyone who finds your
repo could read "bar 5 is not G7/B — Anna".* If not, they need a private
place, which means she needs an account (Q1).

Q4. **See the whole comment, or just where she looked first?** *Example:
first you see "💬 Anna flagged bar 5"; one more tap shows "it's G7 with
the B in the bass? listen again".* Lets you take another listen before
reading her answer.

Q5. **Can she add her own notes, or only comment on yours?** *Example:
she adds "listen for the sequence here" at bar 12, where you wrote
nothing.* (Either way they stay hers, in her file, never in your notes.)

Q6. **What does she see — your view, or the app's guesses too?** Her
device would start in Normal mode, which shows labelled key/chord guesses.
*Example: review links always open in Learning mode, so she sees exactly
your page and only your annotations.*

Q7. **Should Claude ever read her comments?** Default: only when you ask
("what did Anna say about bar 5?"), and it repeats her words, never adds
its own answer.

## 11. A hosted database? (Josh's follow-up)

Josh asked whether a database on Heroku (~$15/month) would help — here and
in other features — so that it pays for itself.

**What it would change for the coach.** Only the delivery step. Her 💬
would save straight to the database, with no "Send to Josh" text and no
GitHub token (it removes the Messages hop from Option A and the token from
Option C). Josh would see her comments the moment he opened the song. Everything
else stays the same: the review link, the anchoring, the Learning-mode wall.
Catch: a database can't be called safely from a web page on its own, so it
needs a small server in front of it **and a login for her**. So the
"no account for her" advantage of Option A goes away.

**Other features it could carry (each with an example):**
- *Unsaved work across devices* — you edit on the iPad, sit at the Mac,
  and your unpublished edits are there. Today they stay on each device
  until Publish, and Publish to GitHub already does this one tap later.
- *Quiz progress* — your spaced-repetition boxes follow you from iPad to
  Mac. Queued as "Quiz platform" (open-items), awaiting your ruling. A
  small JSON file in your repo would do the same.
- *Ask chat history* — the same chat on every device. Chats already
  publish to the repo (src/sync/publish.js:606-609).
- *Reaching Claude away from home* — the database doesn't help here. Claude
  runs on your Mac (the bridge). A hosted relay could stand in for Tailscale
  (parked, "Tailscale drops on the iPad"), but that's a server holding your
  Claude access, which is a bigger security question than the coach.
- *Captures as background jobs* — no. Captures are heavy emulation, and the
  rips can't live on a hosted server (they're kept off public hosting on
  purpose).
- *More coaches / students / other users later* — this is where a database
  really helps: many people, each with their own login, comments and
  notifications. That's a product decision, not a coaching one.

**What it costs besides $15/month:**
- *An always-on piece you look after.* Plan changes (Heroku has dropped
  free tiers and changed prices before), database upgrades, backups, and an
  outage that breaks comments while the rest of the app works.
- *Logins.* Her account, a password reset, and yours on two devices. That's
  new UI and new ways to get locked out.
- *Security.* Anything the web page or the iPad app carries is readable by
  anyone, so every rule about who can write what has to live on the server.
  One mistake there means someone else can write to your data.
- *The house rules.* "Annotations + the .mid are the only real state"
  (CLAUDE.md) and "no server" (README.md) would both change. Each feature
  would need an offline answer for the iPad, a test fake for the vm suite,
  and new App Store privacy labels (currently "no data collected").
- *A second place your work lives.* GitHub history and the database could
  disagree. Two copies is how notes went missing before (6ad5eee).

**Cheaper alternatives you already have:**
- *GitHub, free:* public or private repos, Issues/Discussions with email
  notifications, and the Contents API the app already publishes through. A
  private repo for coach comments costs $0 (she'd need an account).
- *The Mac bridge:* already an always-on server you run. It isn't reachable
  by her (Tailscale is private), and making it public isn't worth the
  risk for this.
- *Free tiers* (e.g. Cloudflare D1/KV, Supabase free) if a hosted store is
  ever truly needed — the same costs above except the $15.

**Recommendation: not now.** Every feature on the list except "more
users" is already handled by GitHub plus one tap. The coach feature works
without it (Option A) and costs a login if it uses one. The real price is
the upkeep, the logins and the security, not the $15. Revisit if any of
these become true: (1) a second coach or regular user who won't touch
GitHub, (2) you want comments and replies to show up live, with
notifications, (3) the Messages round trip in Option A turns out to be the
thing that stops her using it. If that happens, start with a free tier and
keep GitHub as the real copy: the database holds comments only, and Josh's
Publish copies them into the repo's `.comments.json`.

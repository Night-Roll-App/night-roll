# Plan: Publish window tweaks (Josh, Terminal #111)

Status: draft → Fable review → Fable build.

Josh: "Don't want chat to show up in the count of the songs that need to be published and when I opened the published screen I don't want to see them immediately maybe they'll be a separate area for publishing chats … when I hit the publish button for a particular song it brings up a window that allows me to dock it and that's not very useful it's a very temporary window. But the published window itself doesn't allow me to dock it … the main publish window is actually potentially useful to be docked so let's make that dockable."

1. Count: the pending/publish badge count (updateSyncBtn / the Publish button's number, pendingSongs/pendingAll consumers) counts SONGS only — the general chat and the ⌨ Terminal chat (and per-song ask logs if they are counted separately) are excluded from the number. They still publish (nothing lost).
2. Publish sheet (renderSyncPending / openSyncSheet in ui/sheets.js): songs first; chats move to a separate "Chats" section, collapsed by default (a disclosure row with its own count + Publish chats button inside). Collapsed state = device-local pref. "Publish all" behaviour: decide (reviewer) whether it includes chats — default: songs only, with chats via their own section's button, and say so in the row.
3. Docking: the per-song publish window (the sheet opened by a song's Publish button) becomes a plain modal sheet — not a wm window, no dock affordance. The main Publish (sync) sheet becomes a wm window that can dock/float/close like the other dockable windows (ui/wm.js makeWindow / the pattern the Mixer or Notes uses), remembering its dock state device-locally.
Tests: count excludes chats (general + terminal + any song chat logs); sheet renders songs section + collapsed Chats section; chats still publish via their button; per-song sheet has no dock controls; main publish window dock/float round trip + persistence; boot-order snapshot if wiring changes. Help entries updated, build_help, drift keywords, NIGHT-ROLL.md.
Verify: npm test, smoke, check.mjs, boot-order; main session eyeballs it in the browser (dock left/right/bottom + phone width).

## Addendum (Josh, Terminal #112) — one motion for one song
"when I click to publish one song … it pops up the publish window progress bar … and when that's done the whole thing should be done … I could be argued out of that though."
After a single-song publish succeeds, the progress popup AND the sheet it was launched from close automatically (status line keeps a one-line "published <song>" confirmation). On failure both stay open with the error and a retry. Publish all (several items) keeps today's behaviour. Test: success closes both; failure keeps both open with the error. Built as a follow-up commit after the first round lands.
## Review (Fable, 2026-10-04) — against the code

Checked claims, corrected where wrong:

- There is no `pendingAll` today. The badge is `pendingSongs().length`
  (`updateSyncBtnImpl`, src/ui/chrome.js). `pendingSongs()` is a union of
  three things: songs with unsynced notes (`ff1roll-notes-*`), songs with a
  dirty draft, and EVERY `ff1roll-ask-*` store with unsaved messages — the
  pseudo-keys `general` and `terminal` as entries of their own, AND any song
  whose chat alone is unsaved (a song row with Open/Publish/Revert and one
  "✦ N chat messages unsaved" line). So chats reach the count two ways, and
  item 1's "per-song ask logs if they are counted separately" is wrong: they
  are not separate, they make the song pending.
- `renderSyncPending` / `openSyncSheet` live in src/ui/sheets.js as stated;
  the two shared chats are rendered inline in the same loop as the songs
  (own `.psong` block, "Publish chat" button → `askCommitLog`).
- "The per-song publish window" is `#pubjobsheet` (`openPubJobSheet`,
  sheets.js:238): the job dialog. It is SHARED by a row's Publish, Publish
  all, a folder's Publish import, and Jobs → Open. Making it non-dockable
  covers all of those — right, they are all a progress dialog. It stays a
  registered window (`makeWindow("pubjobsheet", {dockable: false})`, same as
  infosheet/importhub) so `wmLayoutAll`'s bookkeeping is unchanged. Missed
  by the plan: a device that saved it docked keeps a dead id in the
  `ff1roll-wm` pref forever (exactly the moresheet case, wm.js ~738) — the
  purge becomes a pure `wmPurgeId(state, id)` used for both, and tested.
- `#syncsheet` is not registered at all. `makeWindow` needs three things it
  lacks: `<h2 id="syncsheet-h2">`, a `#syncsheet-home` wrapper (`wmLayoutSide`
  parks a floated window back in `<id>-home`), and a `.docked` scrolling-body
  rule in css/app.css (`#syncsheet.docked #syncpending`, like
  `#jobssheet.docked #jobslist`). Dock persistence is free — the shared
  `ff1roll-wm` pref via `wmSave`; no new pref.
- `MODAL_KEEP` (wm.js:598) only exempts `confirmsheet` from backdrop/Esc
  dismissal. Irrelevant here; untouched.
- Tests: docking is unit-tested in tests/night-roll.test.mjs ("Window
  manager: …", S.wm + the harness DOM) and measured in
  tests/e2e/docking.spec.mjs's WINDOWS list (CI only). Two vm tests use
  pubjobsheet as the second bottom-dock window (4889, 4967) — they move to
  syncsheet. docking.spec: pubjobsheet out, syncsheet in.
- Help: help/help.html's "Publish" entry (files tab) still says
  "More → SONG → Publish" — More is gone; fixed in passing. The "Dock right"
  entry's PUBLISH now means the Publish window; "Publish dialog" gets the
  no-dock note.

Decisions:

- D1 (what is a song): `pendingSongs()` = songs whose music (dirty draft) or
  annotations (`ff1roll-notes-`) are pending — nothing else; the badge is its
  length. New `pendingChats()` = `general`, `terminal`, and every song whose
  ONLY pending item is chat. `pendingAll()` = songs then chats (what the old
  list was). A song with music/annotation changes AND unsaved chat is one
  song row, keeps its "✦ N chat messages unsaved" line, and its chat ships
  with the song as today (`publishSong` → `askCommitLog`) — never listed
  twice.
- D2 (Publish all): songs only, as the plan's default. `Publish all (N)` =
  `pendingSongs()`, shown at N > 1 as before. The Chats section has its own
  `Publish chats (M)` button (M > 1) and every chat row keeps `Publish chat`.
  `publishAllJobStart(statusFn, onlyKeys)` filters `pendingAll()` when keys
  are given, so chats ride a job too; a chat key publishes through
  `askCommitLog` (never `publishSong` — that would also write a
  .rollnotes.json for a chat-only song). Both buttons' titles say what they
  include.
- D3 (Chats section): rendered after the songs as a disclosure row
  "▸ Chats (M)", collapsed by default; open state in localStorage
  `ff1roll-pubchats-open` (device-local UI pref — not song state). No chats
  pending → no section. "Nothing pending on this device." only when both
  lists are empty.
- D4 (docked Publish window): a row's Publish / Publish all / Publish chats
  no longer close the Publish window when it is docked (closing a docked
  window collapses its dock — jarring mid-job); the job dialog opens over it
  and the list re-renders as the job runs. Floating, it closes as today.
  Compare still closes it either way (the roll needs the room). Same for the
  ⇪ Publish song success close.
- D5 (nothing lost): the count and the sections change what is SHOWN and
  what one button covers; nothing stops being publishable and nothing is
  deleted. Learning mode untouched (no verdicts, no song content).

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

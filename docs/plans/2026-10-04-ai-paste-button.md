# Plan: 📋 Paste button in the AI box (Josh, Terminal #113–114)

Status: draft → Fable review → Fable build.
Why: Superwhisper on iPad is only a keyboard (no URL scheme/shortcut another app can call); its Control Center control most likely records in its app and leaves text on the clipboard. Josh's hands hurt and the keyboard covers half the screen — a one-tap Paste beside 🎤 gets dictated text into the message box without summoning the keyboard.
Build: a 📋 button in the AI window's input row (beside 🎤; setControl; icon from the app's icon set), tap → read the clipboard (Capacitor Clipboard plugin on the iPad if available in the shell, else navigator.clipboard.readText — iOS shows its own Paste confirmation bubble, which is fine) → insert at the caret / append to #askinput with a space, WITHOUT focusing the input (no keyboard), update the draft (askDraft persistence) and grow; empty clipboard / permission denied → a one-line status, no native dialog. Also in the Terminal tab (same box). Never auto-send.
Tests: vm — paste appends, draft saved, input not focused, empty/denied paths; help entry (AI tab), build_help, drift keyword, NIGHT-ROLL.md. Check whether the iPad shell (~/work/ff/night-roll-app) already has @capacitor/clipboard; if not, use navigator.clipboard (don't add native plugins without saying so in the report).

## Review (Fable, 2026-10-04)

Read against the code; the plan stands with these decisions:

1. **App-side, not the library.** The 🎤 and ＋ buttons are wired in
   `src/ask/sheet.js` `initSheet3`/`initSheet2`, not by the library's
   `aiWindowBind` (unused here); `vendor/ai/web/window.js` owns the box's
   mechanics (grow, draft) and its `host.ids` has no mic/paste slot. 📋 goes
   beside the mic in `initSheet3`, inserting through the library's existing
   `askGrow`/`askDraftSave` delegates. No vendor edit (`ai-sync --check`
   stays clean); if the library ever draws its own input row (its step 7),
   Paste moves with Speak.
2. **`navigator.clipboard.readText` only.** The iPad shell's package.json
   has no `@capacitor/clipboard` (app, cli, core, filesystem, ios, share),
   and none is added. `readText()` is called first thing inside the click
   handler (user activation); iOS shows its own Paste bubble on the first
   tap, which the plan accepts. No API (http / old browser) → status line.
3. **Insertion:** at the caret only when the box already has focus
   (`document.activeElement === #askinput`), otherwise appended; a space is
   added on whichever side would otherwise run words together. `focus()` is
   never called and `setSelectionRange` only runs on an already-focused box —
   the keyboard stays down. Then `askGrow()` (size, composing notice, the
   library's 300 ms draft save) and `askDraftSave()` so the draft is on
   disk at once, not after a timer a relaunch could beat.
4. **Live dictation:** the mic's `onresult` rebuilds the box from the `base`
   it captured at start, so a paste mid-dictation would be overwritten by
   the next result. Paste therefore calls `askMicOff()` first (stop +
   discard the late result); the words already shown in the box stay. Help
   says so.
5. **Button:** `askpaste` registered in CONTROLS (`contentPaste` icon — new
   Material `content_paste` ICON entry — + "Paste"); index.html markup
   inlines the same svg (as #askmic does). Its content never changes; all
   feedback is `#askstatus` text (cleared on success): no API, empty
   clipboard, permission denied, other error. No native dialogs. Never
   sends. One box serves ♪/Ask/Terminal, so one button covers all three.
6. **Tests (vm):** appends with a space; caret insert when focused; draft
   written; `focus` never called; empty / denied / no-API statuses with the
   box untouched; mic stopped and the paste kept; no message sent. Help
   entry in the ask section after Speak (touch wording; keyboard: ⌘V);
   drift keyword `Paste</dt>`; NIGHT-ROLL.md beside the ＋ paragraph;
   boot-order snapshot rewritten for the one new `initSheet3` statement.

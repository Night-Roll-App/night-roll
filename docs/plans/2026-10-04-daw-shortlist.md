# Plan: DAW shortlist (docs/daw-inventory.md) — remaining items

Status: draft → Fable review → Fable build (one feature per builder/commit, each with help entry + tests). Done already: #1 playhead tag, #2/#3 keyboard (+Sustain). 

1. Keyboard key stretch on wide windows (open-items 2026-10-04): when the whole range fits, widen keys to fill; 44 px minimum. S.
2. Touch-and-hold a note → context menu (cut/copy/delete/duplicate/velocity/quantize — reuse edit-row actions, setControl, appConfirm-free); iPadOS three-finger swipe undo/redo (if the WebView exposes it; otherwise two-finger double-tap undo — reviewer decides, document). S–M.
3. Capture MIDI: a rolling buffer of the last ~60 s of on-screen-keyboard / MIDI-in playing while NOT recording; "Keep that" writes it at the cursor on the selected track, one undo step. M.
4. Velocity lane under the roll: per-note velocity stalks, drag to set, multi-select drag scales; chip-capture envelopes shown read-only as facts. M.
5. Typed bar jump: tap the LCD bar number → type a bar → jump; drag a cycle's middle to move the whole cycle (ends move together). S.
6. Score → PDF/print: print stylesheet / export via VexFlow SVG pages (no native dialog: the iPad share sheet / a download). M.

Each: tests (vm + gestures), help sheet (touch first), HELP.md, drift keyword, NIGHT-ROLL.md; browser check by main session; iPad build per feature.

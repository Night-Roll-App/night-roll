import { S } from "../state.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { askRenderImpl as askRender } from "./sheet.js";
import { appMode } from "../platform/mode.js";
import { songTitleOfImpl as songTitleOf } from "./context.js";
import { aiForwardTake, aiForwardRetry, aiForwardSendNow, aiForwardDismiss, aiForwardPending } from "../../vendor/ai/web/forward.js";
import { askHost } from "./host.js";
import { askStore, askSave, ASK_TERMINAL_KEY, askInboxAllowed } from "./bridge.js";
import { askSwitchRun } from "./client.js";
import { askStoreKey } from "./sheet.js";

// A Worker message that belongs in a song's ♪ chat (Josh #1189). The bridge
// (its --to-chat, or its helper's CHAT verdict on a message that dictates
// what goes into the open song) answers the Worker row with a note of kind
// "chat" {text, song, songTitle}; this device runs the words in that song's
// chat exactly as if Josh had typed them there — the live context, the act
// tool — with a gold "↪ from the Worker tab" line above them. The books
// (once per note id, across reloads; which messages still wait for their
// song) are the library's (vendor/ai/web/forward.js, key ff1roll-ask-forward);
// this file is the host's half: the send, the waiting chips, the song hook.
export const ASK_FORWARD_KEY = "ff1roll-ask-forward";
export function askForwardTake(notes) { return aiForwardTake(askHost(), notes); } // askNotesArrived: the hand-offs leave the notes list here
export function askForwardPending() { return aiForwardPending(askHost()); }
export function askForwardSongOpen(e) { return !!S.songKey && !!S.song && (e.song === S.songKey || (!!e.songTitle && songTitleOf(S.songKey) === e.songTitle)); }
// The host's send (library: forwardChat(entry, force)). Open song: the words go
// out now, through the same switch open_song uses (askSwitchRun: waits for a
// busy chat, flips to the ♪ tab, sends as the user's words). Another song, or
// none: false keeps it waiting — unless `force` (the chip's Send now), when
// the switch opens that song first. A bridge this device may not talk to
// (no consented host) keeps it waiting too, so the message is never dropped
// into a send that cannot happen.
export function askForwardChat(e, force) {
  if (!askInboxAllowed()) return false;
  const open = askForwardSongOpen(e);
  if (!open && !force) return false;
  const path = open ? S.songKey : e.song;
  if (!path) return false;
  const key = "ff1roll-ask-" + path, msgs = askStore(key).msgs;
  msgs.push({role: "note", content: "↪ from the Worker tab", t: Date.now(), m: "handoff", mode: appMode()});
  askSave(msgs, undefined, key);
  S.askSwitch = {path, title: e.songTitle || songTitleOf(path), then: e.text, from: ASK_TERMINAL_KEY, fromTitle: "the Worker tab", said: "", t: Date.now()};
  const sw = S.askSwitch;
  askSwitchRun(sw).catch(err => setInfo("couldn't open " + sw.title + " — " + (err && err.message || err)));
  return true;
}
export function askForwardChanged(pending) { // the waiting list changed: redraw the chips if the Worker tab is up; else the ✉ light says a message waits
  const sheet = document.getElementById("asksheet");
  if (sheet && sheet.classList.contains("on") && S.askTerminal) { try { askRender(); } catch (err) { /* boot */ } return; }
  if (pending && pending.length) { document.getElementById("askbtn").classList.add("hasnote"); setInfo("✦ a message waits for " + pending[pending.length - 1].songTitle + " — open it, or tap ✦ AI"); }
}
export function askForwardOnSong() { // setSong: a message waiting for this song goes out now
  try { if (S.songKey && aiForwardRetry(askHost())) setInfo("✦ your Worker message runs in this song's chat"); } catch (err) { /* too early in boot */ }
}
export function askForwardChips() { // the Worker tab's waiting rows: "Waiting for <song>: “…” · Send now / Dismiss" — one per message, nothing stored here (the library holds the list)
  if (!S.askTerminal || askStoreKey() !== ASK_TERMINAL_KEY) return;
  const log = document.getElementById("asklog");
  for (const e of askForwardPending()) {
    const row = document.createElement("div");
    row.className = "askfwd";
    row.dataset.note = String(e.id);
    const words = document.createElement("span");
    words.textContent = "Waiting for " + e.songTitle + ": “" + e.text + "”";
    const send = document.createElement("button");
    send.textContent = "Send now"; send.title = "Open " + e.songTitle + " and run this in its chat";
    send.addEventListener("click", () => { if (!aiForwardSendNow(askHost(), e.id)) setInfo("couldn't send it — is the Mac reachable?"); });
    const drop = document.createElement("button");
    drop.textContent = "Dismiss"; drop.title = "Forget this message";
    drop.addEventListener("click", () => aiForwardDismiss(askHost(), e.id));
    row.append(words, send, drop);
    log.appendChild(row);
  }
}

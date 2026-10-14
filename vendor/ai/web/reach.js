// web/reach.js — is the bridge there right now, and what waits for it. The
// app's poll reports each answer (aiReachSet); an unreachable bridge shows
// the host's banner and holds a send (aiSendHeld): the text stays in the
// box, and when the bridge answers again the host sends it, once. State
// lives on host.state (aiOffline, aiWaiting); no timers, no fetches here.
// Host, beyond the earlier modules':
//   reach(up) · flushWaiting() → false when busy · probe() → promise (one reachability poll)
//   chatKey() · status(t) (all optional)
import { aiText } from "./client.js";

function aiNote(host, t) { if (host.status) host.status(t); }
export function aiOffline(host) { return !!host.state.aiOffline; }
export function aiReachSet(host, up) { // one poll answered (true) or failed on the network (false)
  const st = host.state, was = !!st.aiOffline;
  st.aiOffline = !up;
  if (was === !up) return;
  if (host.reach) host.reach(up);
  if (!up) return;
  const w = st.aiWaiting; st.aiWaiting = null; // cleared BEFORE the send: a second answer can never send it twice
  if (w === undefined || w === null) return;
  if (host.chatKey && host.chatKey() !== w) { aiNote(host, aiText(host, "waitElsewhere")); return; }
  const sent = host.flushWaiting ? host.flushWaiting() !== false : false; // false: the app was busy (a reply still streaming) and sent nothing
  aiNote(host, aiText(host, sent ? "waitSent" : "waitBusy"));
}
export function aiSendHeld(host) { // true: the bridge is unreachable — nothing is sent, the box is untouched, the message waits
  if (!host.state.aiOffline) return false;
  host.state.aiWaiting = host.chatKey ? host.chatKey() : "";
  aiNote(host, aiText(host, "waiting"));
  return true;
}
export async function aiWaitAfterFail(host, key) { // a send failed on the network: if the bridge really is gone, the words that came back wait for it — in their own chat (key), not whichever is open
  if (!host.probe) return;
  try { await host.probe(); } catch (err) { /* the probe reports its own failure through aiReachSet */ }
  if (host.state.aiOffline) { host.state.aiWaiting = key !== undefined && key !== null ? key : host.chatKey ? host.chatKey() : ""; aiNote(host, aiText(host, "waiting")); }
}

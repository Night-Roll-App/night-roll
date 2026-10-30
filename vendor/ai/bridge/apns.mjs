// bridge/apns.mjs — Apple Push for new permission cards (Josh #1093: an Allow card expired unseen).
// Token auth: an ES256 JWT signed with the .p8 key, over HTTP/2 (node:http2 + node:crypto, no deps).
// Files, all under <state dir>/apns/: AuthKey_<KEYID>.p8, config.json {keyId, teamId}, devices.json
// (written by POST /v1/apns/register; the 20 most recent registrations). No key or config = push is off: one log line, nothing else.
import fs from "node:fs";
import path from "node:path";
import http2 from "node:http2";
import crypto from "node:crypto";

export const APNS_HOSTS = {production: "https://api.push.apple.com", development: "https://api.sandbox.push.apple.com"};
const JWT_TTL_MS = 50 * 60 * 1000; // Apple wants a token refreshed between 20 and 60 minutes
export const JWT_RETRY_FLOOR_MS = 20 * 60 * 1000; // after Invalid/ExpiredProviderToken: no new token for 20 min (TooManyProviderTokenUpdates otherwise), unless the key or config changed
export const MAX_DEVICES = 20; // devices.json keeps the most recent registrations; Josh's few devices, never an open-ended list
const b64u = b => Buffer.from(b).toString("base64url");

export function makeJwt(pem, keyId, teamId, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64u(JSON.stringify({alg: "ES256", kid: keyId})), body = b64u(JSON.stringify({iss: teamId, iat: nowSec}));
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), {key: pem, dsaEncoding: "ieee-p1363"});
  return head + "." + body + "." + b64u(sig);
}

const one = v => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
// What Claude is trying to do, in plain words (Josh #1096): the tool's own description, else a short line from the tool name.
export function askBlurb(a) {
  const d = one(a.detail); if (d) return d.slice(0, 200);
  const file = one(a.summary).slice(0, 100), t = String(a.tool || "");
  if (t === "Bash") return "Run a shell command";
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(t)) return file ? "Edit " + file : "Edit a file";
  if (t === "Read") return file ? "Read " + file : "Read a file";
  if (/^(WebFetch|WebSearch)$/.test(t)) return file ? "Look up " + file : "Look something up online";
  return t ? "Use " + t : "Do something";
}

export function askAlert(a, now = Date.now()) { // the notification text for one card
  const left = Math.max(0, Math.round((a.expiresAt - now) / 60000));
  const what = askBlurb(a).slice(0, 110);
  return {title: "Claude needs your OK", body: what + (left > 0 ? " · " + left + " min left" : " · expiring now")};
}

// opts: dir (the apns/ folder), hosts (override, tests), log (console.log), now (clock, tests). Returns {register, notifyAsk, configured, devices}.
export function createApns({dir, hosts = APNS_HOSTS, log = console.log, now = Date.now}) {
  const DEV_FILE = path.join(dir, "devices.json");
  let cfg, warned = false, jwt = null, jwtAt = 0, jwtSig = "", rejected = null; // rejected: {at, sig} after Apple refused the token
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (err) { return d; } };
  const mtime = f => { try { return String(fs.statSync(f).mtimeMs); } catch (err) { return "-"; } };
  function load() { // re-read each time: Josh drops the key in while the bridge runs
    const cfgFile = path.join(dir, "config.json"), c = readJson(cfgFile, null);
    if (!c || !c.keyId || !c.teamId) return null;
    const keyFile = path.join(dir, "AuthKey_" + String(c.keyId).replace(/[^\w]/g, "") + ".p8");
    let pem; try { pem = fs.readFileSync(keyFile, "utf8"); } catch (err) { return null; }
    return {keyId: String(c.keyId), teamId: String(c.teamId), pem, sig: mtime(cfgFile) + "|" + mtime(keyFile)}; // sig changes when either file is rewritten
  }
  const configured = () => !!(cfg = load());
  const devices = () => { const d = readJson(DEV_FILE, []); return Array.isArray(d) ? d : []; };
  const save = list => { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(DEV_FILE, JSON.stringify(list, null, 1)); };

  function register(b) { // {app, bundleId, token, env}; same token again just refreshes it. Throws a string-message Error on bad input
    const app = String(b && b.app || "").replace(/[^\w.-]/g, "_").slice(0, 40), bundleId = String(b && b.bundleId || ""), token = String(b && b.token || "").toLowerCase();
    const env = b && b.env === "production" ? "production" : "development";
    if (!app) throw new Error("app is required");
    if (!/^[\w.-]{3,120}$/.test(bundleId)) throw new Error("bundleId looks wrong");
    if (!/^[0-9a-f]{32,200}$/.test(token)) throw new Error("token must be the hex device token");
    const list = devices().filter(d => d.token !== token);
    list.push({app, bundleId, token, env, at: now()});
    save(list.sort((x, y) => (x.at || 0) - (y.at || 0)).slice(-MAX_DEVICES)); // oldest registrations fall off past the cap
    return {ok: true, push: configured()};
  }

  function send(host, d, payload, headers) { // one request on a fresh HTTP/2 session; resolves {status, reason}
    return new Promise(resolve => {
      let done = false; const fin = r => { if (!done) { done = true; try { client.close(); } catch (e) {} resolve(r); } };
      const client = http2.connect(host);
      client.on("error", err => fin({status: 0, reason: err.message}));
      const req = client.request({":method": "POST", ":path": "/3/device/" + d.token, ...headers});
      let status = 0, data = "";
      req.on("response", h => { status = h[":status"]; });
      req.on("data", c => { data += c; });
      req.on("end", () => { let reason = ""; try { reason = JSON.parse(data).reason || ""; } catch (e) {} fin({status, reason}); });
      req.on("error", err => fin({status: 0, reason: err.message}));
      req.setTimeout(10000, () => { req.close(); fin({status: 0, reason: "timeout"}); });
      req.end(payload);
    });
  }

  // a = a card (id, app, summary, tool, expiresAt); appGiven false = the card named no app, so every device gets it
  async function notifyAsk(a, appGiven = true) {
    if (!configured()) { if (!warned) { warned = true; log("APNs: no key — push off"); } return {sent: 0, off: true}; }
    const t = now();
    const targets = devices().filter(d => !appGiven || d.app === a.app);
    if (rejected && rejected.sig === cfg.sig && t - rejected.at < JWT_RETRY_FLOOR_MS) { // Apple refused the last token and nothing changed: minting another now would only get TooManyProviderTokenUpdates
      return {sent: 0, tried: targets.length, waiting: JWT_RETRY_FLOOR_MS - (t - rejected.at)};
    }
    if (!jwt || rejected || jwtSig !== cfg.sig || t - jwtAt > JWT_TTL_MS) { jwt = makeJwt(cfg.pem, cfg.keyId, cfg.teamId, Math.floor(t / 1000)); jwtAt = t; jwtSig = cfg.sig; rejected = null; } // a changed key/config takes effect on the next push
    const alert = askAlert(a, t);
    const payload = JSON.stringify({aps: {alert, sound: "default", "thread-id": "asks"}, ask: a.id, app: a.app});
    let sent = 0; const dead = new Set();
    for (const d of targets) {
      const r = await send(hosts[d.env] || hosts.development, d, payload, {
        authorization: "bearer " + jwt, "apns-topic": d.bundleId, "apns-push-type": "alert", "apns-priority": "10",
        "apns-collapse-id": String(a.id).slice(0, 64), "apns-expiration": String(Math.floor(a.expiresAt / 1000)), "content-type": "application/json"});
      if (r.status === 200) sent++;
      else {
        log(`APNs: ${d.app} ${d.token.slice(0, 8)}… ${r.status} ${r.reason}`);
        if (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered" || r.reason === "DeviceTokenNotForTopic") dead.add(d.token);
        if (r.reason === "ExpiredProviderToken" || r.reason === "InvalidProviderToken") { // every device would fail the same way; stop, and hold the floor
          rejected = {at: t, sig: cfg.sig};
          log(`APNs: Apple refused the provider token (${r.reason}); next token in ${Math.round(JWT_RETRY_FLOOR_MS / 60000)} min, or at once after the key or config.json changes`);
          break;
        }
      }
    }
    if (dead.size) save(devices().filter(d => !dead.has(d.token)));
    return {sent, tried: targets.length};
  }
  return {register, notifyAsk, configured, devices};
}

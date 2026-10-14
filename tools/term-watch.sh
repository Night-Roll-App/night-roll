#!/bin/zsh
# tools/term-watch.sh — the terminal session's ear on the app's ⌨ Terminal tab.
# Waits for new messages at the bridge's /v1/terminal queue, prints them
# ("TERMINAL MSG #n: …" then "LAST n") and exits — the exit wakes the
# session, which answers and relaunches this (run_in_background, see
# CLAUDE.md "Bridge + Terminal tab"). The last id seen lives in the bridge's
# state dir, not a session's temp dir, so a cleared or new session resumes
# where the last one stopped.
# Exits by itself after ~105 min with "WATCH RENEW" so it never hits the 2 h
# background limit and gets killed (2026-10-09: killed overnight, Josh's iPad
# messages went unanswered) — the session relaunches it on that line too.
# Per app: `term-watch.sh --app <id>` (default night-roll) returns only that
# app's messages ("TERMINAL MSG #n [guitar]: …", or "[tuner] (forwarded from
# night-roll):" for a --forward) and keeps its own seen cursor, so the
# night-roll, guitar and tuner sessions' watchers never steal or skip each
# other's messages. Other sessions call it by path:
#   zsh ~/work/night-roll/night-roll-daw/tools/term-watch.sh --app guitar
# print -r, never echo: messages carry a multi-line <context> block and zsh
# echo turns the JSON's escaped \n into real newlines (2026-09-30: the watcher
# looped silently for 21 minutes).
APP=night-roll
[ "$1" = "--app" ] && [ -n "$2" ] && APP=$2
if [ "$APP" = night-roll ]; then SEEN=${TERM_SEEN:-$HOME/.night-roll-bridge/term-seen}   # the original cursor file
else SEEN=${TERM_SEEN:-$HOME/.night-roll-bridge/term-seen-$APP}; fi
[ -f $SEEN ] || echo 0 > $SEEN
START=$(date +%s)
while true; do
  out=$(/usr/bin/curl -s -m 5 "http://127.0.0.1:8787/v1/terminal?since=$(cat $SEEN)&app=$APP" 2>/dev/null)
  if [ -n "$out" ]; then
    n=$(print -r -- "$out" | python3 -c "import json,sys; d=json.loads(sys.stdin.read(), strict=False); print(len(d.get('msgs',[])))" 2>/dev/null || echo 0)
    if [ "$n" != "0" ]; then
      print -r -- "$out" | python3 -c "
import json,sys; d=json.loads(sys.stdin.read(), strict=False)
for m in d['msgs']: print('TERMINAL MSG #%d [%s]%s: %s%s' % (m['id'], m.get('app','night-roll'), (' (forwarded from %s)' % m['fwd']) if m.get('fwd') else '', m['text'], ('  [screenshot: %s]' % m['shot']) if m.get('shot') else ''))
print('LAST', d['last'])"
      print -r -- "$out" | python3 -c "import json,sys; print(json.loads(sys.stdin.read(), strict=False)['last'])" > $SEEN
      exit 0
    fi
  fi
  if [ $(( $(date +%s) - START )) -gt 6300 ]; then echo "WATCH RENEW (no messages; relaunch me)"; exit 0; fi
  sleep 5
done

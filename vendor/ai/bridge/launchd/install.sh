#!/bin/sh
# bridge/launchd/install.sh — run a claude-bridge instance at login and keep
# it alive (macOS launchd). App-neutral: the caller names its own entry
# script (its bridge shim) and launchd label. Usage:
#   sh bridge/launchd/install.sh --entry /path/to/shim.mjs --label com.example.bridge [bridge flags…]
#   sh bridge/launchd/install.sh --entry /path/to/shim.mjs --label com.example.bridge --uninstall
# Survives reboots and crashes; its log is ~/Library/Logs/<label>.log.
set -e
ENTRY=""
LABEL=""
ARGS=""
UNINSTALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --entry) ENTRY="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) ARGS="$ARGS
    <string>$(printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g')</string>"; shift ;;
  esac
done
[ -n "$LABEL" ] || { echo "bridge install: --label is required" >&2; exit 1; }
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
if [ "$UNINSTALL" = "1" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$DEST"
  echo "bridge: launch agent $LABEL removed"
  exit 0
fi
[ -n "$ENTRY" ] || { echo "bridge install: --entry is required (path to the app's own bridge shim)" >&2; exit 1; }
ENTRY="$(cd "$(dirname "$ENTRY")" && pwd)/$(basename "$ENTRY")"
WORKDIR="$(dirname "$ENTRY")"
NODE="$(command -v node)"
[ -n "$NODE" ] || { echo "node not found on PATH" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s|__NODE__|$NODE|g" -e "s|__ENTRY__|$ENTRY|g" -e "s|__LABEL__|$LABEL|g" -e "s|__WORKDIR__|$WORKDIR|g" -e "s|__HOME__|$HOME|g" -e "s|__PATH__|$PATH|g" \
    -e "s|__ARGS__|$(printf '%s' "$ARGS" | sed 's/[&|]/\\&/g' | tr '\n' ' ')|" \
    "$HERE/template.plist" > "$DEST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
sleep 1
launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state|pid" | head -2
echo "bridge: installed as $LABEL (log: ~/Library/Logs/$LABEL.log)"

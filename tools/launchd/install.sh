#!/bin/sh
# tools/launchd/install.sh — run the Night Roll AI bridge at login and keep it
# alive (macOS launchd). Usage:
#   sh tools/launchd/install.sh [bridge flags…]      # e.g. --claude full --upstream lmstudio=http://localhost:1234
#   sh tools/launchd/install.sh --uninstall
# The bridge then survives reboots and crashes; its log is
# ~/Library/Logs/nightroll-bridge.log. LM Studio itself still needs its own
# "run server at login" setting (or `lms server start --cors` after a reboot).
set -e
LABEL=com.nightroll.bridge
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
if [ "$1" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$DEST"
  echo "bridge: launch agent removed"
  exit 0
fi
NODE="$(command -v node)"
[ -n "$NODE" ] || { echo "node not found on PATH" >&2; exit 1; }
ARGS=""
for a in "$@"; do ARGS="$ARGS
    <string>$(printf '%s' "$a" | sed 's/&/\&amp;/g; s/</\&lt;/g')</string>"; done
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s|__NODE__|$NODE|g" -e "s|__REPO__|$REPO|g" -e "s|__HOME__|$HOME|g" -e "s|__PATH__|$PATH|g" \
    -e "s|__ARGS__|$(printf '%s' "$ARGS" | sed 's/[&|]/\\&/g' | tr '\n' ' ')|" \
    "$REPO/tools/launchd/$LABEL.plist" > "$DEST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
sleep 1
launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "state|pid" | head -2
echo "bridge: installed as $LABEL (log: ~/Library/Logs/nightroll-bridge.log)"

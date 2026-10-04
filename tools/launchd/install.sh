#!/bin/sh
# tools/launchd/install.sh — shim: Night Roll's launch agent is installed by
# the claude-bridge library's own installer (vendor/ai/bridge/launchd/),
# pointed at this repo's bridge shim (tools/claude-bridge.mjs) and this
# repo's launchd label. Usage unchanged:
#   sh tools/launchd/install.sh --claude full --upstream lmstudio=http://localhost:1234
#   sh tools/launchd/install.sh --uninstall
#   tail -f ~/Library/Logs/com.nightroll.bridge.log
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
exec sh "$REPO/vendor/ai/bridge/launchd/install.sh" --entry "$REPO/tools/claude-bridge.mjs" --label com.nightroll.bridge "$@"

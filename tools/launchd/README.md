# Keeping the AI bridge running (macOS)

`tools/claude-bridge.mjs` dies with the terminal that started it and does not
come back after a reboot. This folder makes it a launch agent instead: started
at login, restarted if it crashes. It's a shim onto the claude-bridge
library's own installer (`vendor/ai/bridge/launchd/`, docs/ai-library-plan.md
§2 step 2) — this script just supplies `--entry tools/claude-bridge.mjs
--label com.nightroll.bridge` and forwards everything else.

```
sh tools/launchd/install.sh --claude full --upstream lmstudio=http://localhost:1234
sh tools/launchd/install.sh --uninstall
tail -f ~/Library/Logs/com.nightroll.bridge.log
```

Pass the same flags you would pass to `node tools/claude-bridge.mjs`
(`--token`, `--port`, `--no-claude`, more `--upstream`s). The library's
installer writes `~/Library/LaunchAgents/com.nightroll.bridge.plist` with
absolute paths for your `node`, this repo's bridge shim, and your `PATH`
(Claude Code's `claude` must be on it), then loads it. LM Studio is
separate: turn on its own "start server at login" option, or run
`lms server start --cors` after a reboot. Tailscale Serve mounts persist on
their own.

Not macOS? Any process supervisor works — systemd `Restart=always`, pm2,
or a Windows Task Scheduler job that runs the same command at logon.

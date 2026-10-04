# Keeping a claude-bridge instance running (macOS)

A bridge dies with the terminal that started it and does not come back
after a reboot. This installer makes it a launch agent instead: started at
login, restarted if it crashes.

```
sh bridge/launchd/install.sh --entry /path/to/your-app/tools/your-bridge-shim.mjs --label com.example.bridge --claude full --upstream lmstudio=http://localhost:1234
sh bridge/launchd/install.sh --entry ... --label com.example.bridge --uninstall
tail -f ~/Library/Logs/com.example.bridge.log
```

`--entry` is the consuming app's own bridge shim (a one-line script that
calls this library's `main(process.argv, profile)` with the app's profile)
— not this library's `bridge/server.mjs` directly, since that file alone
carries no app-specific configuration. `--label` names the launchd job and
its log file. Every flag after those two is passed straight through to the
bridge (`--token`, `--port`, `--no-claude`, more `--upstream`s, …). The
script writes `~/Library/LaunchAgents/<label>.plist` with absolute paths
for your `node`, the entry script, and your `PATH` (any CLI the bridge
shells out to — e.g. Claude Code's `claude` — must be on it), then loads
it.

Not macOS? Any process supervisor works — systemd `Restart=always`, pm2,
or a Windows Task Scheduler job that runs the same command at logon.

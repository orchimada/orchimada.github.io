# Habits pipeline

Vault frontmatter → dashboard, two speeds. Parsing lives in `habits-lib.mjs`;
only booleans and numbers leave the vault, never note text, and `therapy`
never leaves at all. Out-of-range values are refused and surface on the
page's instrument check instead of poisoning the averages.

```
 Obsidian daily note (frontmatter)
        │ save
        ├──▶ serve-habits.mjs ── SSE ──▶ localhost:8765/habits.html   (live, private)
        └──▶ launchd WatchPaths ─▶ publish-habits.sh
                                     └─ export-habits.mjs → habits.json → git push
                                                        └──▶ orchimada.github.io/habits.html
```

## Live local (real time, private)

```bash
node tools/serve-habits.mjs
# → http://localhost:8765/habits.html
```

`/habits.json` is parsed fresh from the vault on every request; a save in
Obsidian fires a server-sent event and the page re-renders itself. Nothing
is written, nothing leaves the machine. `HABITS_PORT` / `HABITS_VAULT`
override the defaults.

To have it always on, keep the terminal tab — or make it a LaunchAgent too
(`KeepAlive` + `RunAtLoad` around the same command).

## Auto-publish (public page, ~1 min behind a save)

Once:

```bash
chmod +x tools/publish-habits.sh
cp tools/com.orchimada.habits-publish.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.orchimada.habits-publish.plist
```

From then on any save in `Journal/Daily` runs export → commit → push,
debounced to once a minute, and only when the data actually changed (the
exporter is idempotent, so iCloud's spurious touches publish nothing).
Log: `tail -f /tmp/habits-publish.log`. Pause it with `launchctl unload …`.

**Note on push credentials:** launchd runs outside your terminal session.
HTTPS remotes with the macOS keychain work as-is; an SSH remote needs the
key in the keychain (`ssh-add --apple-use-keychain`). A failed push is
logged and the commit simply rides along with the next successful one.

## Manual (still works)

```bash
node tools/export-habits.mjs        # writes habits.json only if data changed
node tools/export-habits.mjs --dry  # just the summary
```

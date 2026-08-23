#!/bin/zsh
# publish-habits.sh — export the vault frontmatter and push it to the site.
# Run by com.orchimada.habits-publish.plist on every save in Journal/Daily,
# safe to run by hand any time. Logs to /tmp/habits-publish.log.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
LOG=/tmp/habits-publish.log
cd "$(dirname "$0")/.." || exit 1

echo "── $(date '+%F %T') watcher fired" >> "$LOG"

# idempotent: leaves habits.json untouched when only the timestamp would change
node tools/export-habits.mjs >> "$LOG" 2>&1 || { echo "export failed" >> "$LOG"; exit 1; }

if git diff --quiet -- habits.json && git ls-files --error-unmatch habits.json >/dev/null 2>&1; then
  echo "no data change — nothing to publish" >> "$LOG"
  exit 0
fi

git add habits.json >> "$LOG" 2>&1
git commit -m "habits: $(date +%F)" >> "$LOG" 2>&1
# a failed push is not fatal: the commit rides along with the next successful one
git push >> "$LOG" 2>&1 || echo "push failed (offline / creds?) — commit kept, will ride the next push" >> "$LOG"
echo "published" >> "$LOG"

#!/usr/bin/env bash
# Keeps todo-md-sync.path watching every ~/Dev/*/TODO.md (minus exclude.txt),
# so a local edit syncs at once. Rewrites the unit only when the list changes.
set -euo pipefail
LOCAL_ROOT=${LOCAL_ROOT:-$HOME/Dev}
EXCLUDE=${EXCLUDE:-$HOME/.config/todo-md-sync/exclude.txt}
UNIT=$HOME/.config/systemd/user/todo-md-sync.path

{
    printf '[Unit]\nDescription=Synchro des TODO.md dès une modification locale\n\n[Path]\n'
    for f in "$LOCAL_ROOT"/*/TODO.md; do
        name=$(basename "$(dirname "$f")")
        [ -f "$EXCLUDE" ] && grep -qxF "$name" "$EXCLUDE" && continue
        printf 'PathChanged=%s\n' "$f"
    done
    printf 'Unit=todo-md-sync.service\n\n[Install]\nWantedBy=default.target\n'
} > "$UNIT.new"

if cmp -s "$UNIT.new" "$UNIT"; then
    rm -f "$UNIT.new"
    exit 0
fi
mv -f "$UNIT.new" "$UNIT"
systemctl --user daemon-reload
systemctl --user restart todo-md-sync.path

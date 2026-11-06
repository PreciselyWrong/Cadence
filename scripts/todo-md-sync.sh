#!/usr/bin/env bash
# Two-way sync of the TODO.md files between a work folder and the folder
# Cadence reads (docs/35-todo-md-projects.md), so nothing else leaves the machine.
#
#   LOCAL_ROOT=~/projects SHARE_ROOT=/mnt/server/cadence-todos todo-md-sync.sh
#
# Every direct sub-folder of LOCAL_ROOT holding a TODO.md is synced, except those
# named in EXCLUDE (default ~/.config/todo-md-sync/exclude.txt), one per line.
# Run it from a timer, about once a minute.
#
# Compares contents, not dates: timestamps on a network share are not reliable
# enough. Edits on both sides are merged line by line against the last synced
# copy; if the same line changed on both, the local file wins and the other
# version is kept in STATE/conflicts. A deletion is never propagated, so a missing
# mount or a branch without the file loses nothing.
set -uo pipefail

LOCAL_ROOT=${LOCAL_ROOT:?set LOCAL_ROOT to the work folder}
SHARE_ROOT=${SHARE_ROOT:?set SHARE_ROOT to the folder Cadence reads}
STATE=${STATE:-$HOME/.local/state/todo-md-sync}
EXCLUDE=${EXCLUDE:-$HOME/.config/todo-md-sync/exclude.txt}

failed=0

# Replaces the target in one rename, so Cadence never reads a partial file.
put() {
    local tmp="$2.sync-tmp.$$"
    mkdir -p "$(dirname "$2")" || return 1
    cp -- "$1" "$tmp" && mv -f -- "$tmp" "$2"
}

remember() {
    mkdir -p "$(dirname "$2")" && cp -- "$1" "$2"
}

warn() {
    echo "$1" >&2
    if command -v notify-send >/dev/null 2>&1; then
        notify-send -a 'TODO.md' 'Synchro TODO.md' "$1" 2>/dev/null || true
    fi
}

# Same line changed on both sides: the local file wins, the other version is kept.
keep_conflict() {
    local name=$1 local_file=$2 share_file=$3 base=$4 saved
    saved="$STATE/conflicts/$name-$(date +%Y%m%d-%H%M%S).md"
    remember "$share_file" "$saved" || return 1
    put "$local_file" "$share_file" && remember "$local_file" "$base" || return 1
    warn "Conflit sur $name/TODO.md : version locale gardée, l'autre est dans $saved"
}

sync_one() {
    local name=$1
    local local_file="$LOCAL_ROOT/$name/TODO.md"
    local share_file="$SHARE_ROOT/$name/TODO.md"
    local base="$STATE/base/$name/TODO.md"

    if [ -f "$local_file" ] && [ -f "$share_file" ]; then
        if cmp -s "$local_file" "$share_file"; then
            remember "$local_file" "$base"
        elif [ ! -f "$base" ]; then
            keep_conflict "$name" "$local_file" "$share_file" "$base"
        elif cmp -s "$local_file" "$base"; then
            put "$share_file" "$local_file" && remember "$share_file" "$base" && echo "$name: partage vers local"
        elif cmp -s "$share_file" "$base"; then
            put "$local_file" "$share_file" && remember "$local_file" "$base" && echo "$name: local vers partage"
        else
            local merged
            merged=$(mktemp) || return 1
            if git merge-file -p "$local_file" "$base" "$share_file" >"$merged" 2>/dev/null; then
                put "$merged" "$local_file" && put "$merged" "$share_file" && remember "$merged" "$base" && echo "$name: fusion"
            else
                keep_conflict "$name" "$local_file" "$share_file" "$base"
            fi
            local status=$?
            rm -f -- "$merged"
            return $status
        fi
    elif [ -f "$base" ]; then
        # Journal only: this pass runs every minute, a notification would repeat.
        echo "$name/TODO.md manque d'un côté : rien n'est supprimé, à vérifier" >&2
    elif [ -f "$local_file" ]; then
        put "$local_file" "$share_file" && remember "$local_file" "$base" && echo "$name: ajouté au partage"
    elif [ -f "$share_file" ] && [ -d "$LOCAL_ROOT/$name" ]; then
        put "$share_file" "$local_file" && remember "$share_file" "$base" && echo "$name: ajouté en local"
    fi
}

if [ ! -d "$SHARE_ROOT" ] || [ ! -d "$LOCAL_ROOT" ]; then
    echo "Dossier local ou partagé introuvable" >&2
    exit 1
fi

excluded() {
    [ -f "$EXCLUDE" ] && grep -Fxq -- "$1" "$EXCLUDE"
}

# A folder listed in the state was synced before: keep following it if its local
# file vanished (a branch without it), so sync_one reports it instead of ignoring it.
for dir in "$LOCAL_ROOT"/*/; do
    name=$(basename "$dir")
    excluded "$name" && continue
    [ -f "$dir/TODO.md" ] || [ -f "$STATE/base/$name/TODO.md" ] || continue
    sync_one "$name" || {
        echo "$name: échec de la synchro" >&2
        failed=1
    }
done

exit "$failed"

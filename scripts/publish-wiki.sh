#!/usr/bin/env bash
# Publishes wiki/ (the source of truth, versioned with the code) to the GitHub
# wiki of the repository. The README screenshots go to images/web/.
#   scripts/publish-wiki.sh [--plan]
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
REMOTE=${WIKI_REMOTE:-$(git -C "$ROOT" remote get-url origin | sed -E 's#\.git$##').wiki.git}
WORK=${WIKI_WORK:-$HOME/.cache/cadence-wiki}

if [ "${1:-}" = "--plan" ]; then
    echo "Source: $ROOT/wiki + $ROOT/screenshots/web"
    echo "Remote: $REMOTE"
    echo "Clone:  $WORK"
    exit 0
fi

if [ -d "$WORK/.git" ]; then
    git -C "$WORK" fetch --quiet origin
    git -C "$WORK" reset --quiet --hard origin/HEAD
else
    git clone --quiet "$REMOTE" "$WORK" || {
        echo "Wiki introuvable : créer une première page sur GitHub (onglet Wiki), puis relancer." >&2
        exit 1
    }
fi

find "$WORK" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r "$ROOT/wiki/." "$WORK/"
rm -f "$WORK/README.md"
mkdir -p "$WORK/images/web"
cp "$ROOT"/screenshots/web/*.png "$WORK/images/web/"

git -C "$WORK" add -A
if git -C "$WORK" diff --cached --quiet; then
    echo "Wiki déjà à jour."
    exit 0
fi
git -C "$WORK" commit --quiet -m "Wiki : $(git -C "$ROOT" log -1 --format=%h) $(git -C "$ROOT" log -1 --format=%s)"
git -C "$WORK" push --quiet origin HEAD
echo "Wiki publié."

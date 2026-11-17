#!/usr/bin/env bash
# Assemble the project page in _site/: the page, plus the screenshots, logos
# and fonts it shares with the app (kept in one place, copied here).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/_site"
rm -rf "$out"
mkdir -p "$out/assets/fonts"
cp "$root/site/index.html" "$out/"
cp -r "$root/screenshots" "$out/screenshots"
cp "$root/public/icon-logo.png" "$root/public/favicon-32.png" "$out/assets/"
cp "$root/public/fonts/Inter-latin.woff2" "$root/public/fonts/Inter-latin-ext.woff2" \
   "$root/public/fonts/Inter-LICENSE.txt" "$out/assets/fonts/"
echo "Page assembled in $out"

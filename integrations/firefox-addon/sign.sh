#!/usr/bin/env bash
# Signs the add-on « unlisted » with Mozilla (private: never shown on
# addons.mozilla.org) so the normal Firefox keeps it. Keys: AMO_JWT_ISSUER
# and AMO_JWT_SECRET, else the desktop keyring (secret-tool store --label=AMO
# service amo kind issuer / kind secret). Raise "version" in manifest.json
# before each new signing: Mozilla signs a version only once.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
issuer="${AMO_JWT_ISSUER:-$(secret-tool lookup service amo kind issuer 2>/dev/null || true)}"
secret="${AMO_JWT_SECRET:-$(secret-tool lookup service amo kind secret 2>/dev/null || true)}"
if [ -z "$issuer" ] || [ -z "$secret" ]; then
    echo "Clés AMO introuvables : addons.mozilla.org › Outils › Gérer les clés d'API, puis secret-tool store." >&2
    exit 2
fi
out="$HOME/.cache/cadence-addon"
mkdir -p "$out"
WEB_EXT_API_KEY="$issuer" WEB_EXT_API_SECRET="$secret" \
    npx --yes web-ext sign --channel=unlisted --source-dir "$here" --artifacts-dir "$out" \
    --ignore-files 'test/**' sign.sh README.md
echo "Signé : ouvrir le .xpi de $out dans Firefox (glisser-déposer)."

#!/usr/bin/env bash
# Puts what is pushed on main into production, in one move:
#   1. waits for the Docker image of HEAD (workflow "Custom Docker image");
#   2. updates the server container through Unraid's own update_container,
#      which keeps the container template (ports, volumes, variables);
#   3. checks that the container now runs the cadenceVersion of HEAD;
#   4. sends the Android APK to NicoApps when its versionName has never been
#      published (tag android-v<versionName>), then tags it.
#
# Private settings stay out of the repository (public): they are read from
# ~/.config/cadence/deploy.env or the environment.
#   CADENCE_DEPLOY_SSH        SSH host of the server (required)
#   CADENCE_DEPLOY_CONTAINER  container name (default: Cadence)
#
# Options: --plan shows what would happen, --skip-android leaves NicoApps out.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

config="${XDG_CONFIG_HOME:-$HOME/.config}/cadence/deploy.env"
# shellcheck disable=SC1090
[ -f "$config" ] && . "$config"

plan=false
android=true
for arg in "$@"; do
    case "$arg" in
        --plan) plan=true ;;
        --skip-android) android=false ;;
        *) echo "Option inconnue : $arg" >&2; exit 2 ;;
    esac
done

fail() { echo "$1" >&2; exit "${2:-1}"; }

host="${CADENCE_DEPLOY_SSH:-}"
container="${CADENCE_DEPLOY_CONTAINER:-Cadence}"
[ -n "$host" ] || fail "CADENCE_DEPLOY_SSH manque (dans $config)." 2

git fetch -q origin main
sha="$(git rev-parse HEAD)"
[ "$sha" = "$(git rev-parse origin/main)" ] ||
    fail "HEAD n'est pas origin/main : pousser main d'abord." 2

version="$(node -p "require('./package.json').cadenceVersion")"
apk_version="$(node -p "require('./android/app-release/version.json').versionName")"
apk_tag="android-v$apk_version"
send_apk=false
if $android && ! git rev-parse -q --verify "refs/tags/$apk_tag" >/dev/null &&
    ! git ls-remote --exit-code --tags origin "$apk_tag" >/dev/null 2>&1; then
    send_apk=true
fi

if $plan; then
    echo "Serveur : $container sur $host -> Cadence $version (image de ${sha:0:9})"
    if $send_apk; then
        echo "NicoApps : Android $apk_version"
    else
        echo "NicoApps : rien (Android $apk_version déjà publié ou ignoré)"
    fi
    exit 0
fi

repo="$(git remote get-url origin | sed -E 's#.*github.com[:/]##; s#\.git$##')"
echo "Image de ${sha:0:9}..."
run=""
for _ in $(seq 1 30); do
    run="$(gh run list --repo "$repo" --workflow custom-image.yml --commit "$sha" \
        -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)"
    [ -n "$run" ] && break
    sleep 10
done
[ -n "$run" ] || fail "Aucune construction d'image trouvée pour ${sha:0:9}."
gh run watch "$run" --repo "$repo" --exit-status --interval 20 >/dev/null ||
    fail "La construction de l'image a échoué (run $run)."

echo "Mise à jour du conteneur $container..."
ssh -o BatchMode=yes "$host" \
    "/usr/local/emhttp/plugins/dynamix.docker.manager/scripts/update_container '$container'" >/dev/null

running=""
for _ in $(seq 1 30); do
    running="$(ssh -o BatchMode=yes "$host" \
        "docker exec '$container' node -p \"require('/app/package.json').cadenceVersion\"" 2>/dev/null || true)"
    [ "$running" = "$version" ] && break
    sleep 5
done
[ "$running" = "$version" ] ||
    fail "Le conteneur tourne $running au lieu de $version."
echo "Serveur : Cadence $version en production."

if $send_apk; then
    echo "NicoApps : Android $apk_version..."
    log="$(mktemp -p "${XDG_CACHE_HOME:-$HOME/.cache}" cadence-publish.XXXXXX)"
    if ! (cd android && pwsh ./publish.ps1 -NonInteractive -Confirm -Destination nicoapps) >"$log" 2>&1; then
        tail -20 "$log" >&2
        fail "La publication NicoApps a échoué (journal : $log)."
    fi
    grep -E 'verdict|Diffuse' "$log" || true
    rm -f "$log"
    git tag "$apk_tag" "$sha"
    git push -q origin "$apk_tag"
fi

echo PUBLISH_PROD_OK

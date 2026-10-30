#!/usr/bin/env bash
# Linux counterpart of dev.ps1: build the debug APK, install it on the first
# ADB device and open it. Usage: ./dev.sh [--dummy] [--plan] [--test]
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
dummy=0 plan=0 test_only=0
for arg in "$@"; do
    case "$arg" in
        --dummy) dummy=1 ;;
        --plan) plan=1 ;;
        --test) test_only=1 ;;
        *) echo "Option inconnue : $arg" >&2; exit 2 ;;
    esac
done

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/temurin-21-jdk}"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
adb="$ANDROID_HOME/platform-tools/adb"
[ -x "$adb" ] || adb="$(command -v adb || true)"

# The checked-in gradlew hands its arguments straight to java on Linux, so
# the wrapper is started directly.
gradle() {
    "$JAVA_HOME/bin/java" -Xmx64m -cp "$root/gradle/wrapper/gradle-wrapper.jar" \
        org.gradle.wrapper.GradleWrapperMain -p "$root" "$@"
}

if [ "$plan" = 1 ]; then
    echo "JDK : $JAVA_HOME"
    echo "SDK : $ANDROID_HOME"
    echo "ADB : ${adb:-introuvable}"
    echo "Mode : $([ "$dummy" = 1 ] && echo 'données de démonstration' || echo 'données réelles locales')"
    [ -x "$JAVA_HOME/bin/java" ] || { echo "JDK introuvable." >&2; exit 2; }
    [ -d "$ANDROID_HOME/platforms" ] || { echo "SDK Android introuvable." >&2; exit 2; }
    exit 0
fi

if [ "$test_only" = 1 ]; then
    gradle :domain:test
    exit 0
fi

gradle :app:assembleDebug
apk="$root/app/build/outputs/apk/debug/app-debug.apk"
[ -f "$apk" ] || { echo "APK de développement introuvable après la construction." >&2; exit 3; }
[ -n "$adb" ] || { echo "adb introuvable." >&2; exit 2; }
serial="$("$adb" devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
[ -n "$serial" ] || { echo "Aucun appareil ADB prêt (branche le téléphone ou lance un émulateur)." >&2; exit 2; }

"$adb" -s "$serial" install -r "$apk"
if [ "$dummy" = 1 ]; then
    result="$("$adb" -s "$serial" shell am broadcast -W \
        -a ch.nicolab.cadence.debug.POPULATE_DUMMY_DATA \
        -n ch.nicolab.cadence/ch.nicolab.cadence.debug.DummyDataReceiver)"
    grep -q 'result=-1' <<<"$result" || { echo "$result"; echo "Les données de démonstration n'ont pas pu être préparées." >&2; exit 3; }
fi
"$adb" -s "$serial" shell am start -n ch.nicolab.cadence/.MainActivity

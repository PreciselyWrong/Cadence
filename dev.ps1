[CmdletBinding()]
param(
    [switch]$Dummy,
    [switch]$NonInteractive,
    [switch]$Plan
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$jdk = 'C:\Program Files\Android\Android Studio\jbr'
$sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'

function Fail([string]$message, [int]$code = 2) {
    [Console]::Error.WriteLine($message)
    exit $code
}

if ($Dummy) { Fail "Ce projet ne propose pas de données de démonstration." }
if (-not (Test-Path $jdk)) { Fail "JDK Android Studio introuvable : $jdk" }
if (-not (Test-Path (Join-Path $root 'gradlew.bat'))) { Fail 'Le wrapper Gradle est introuvable.' }

if ($Plan) {
    Write-Output 'Développement prêt'
    Write-Output 'Mode : données réelles locales'
    Write-Output 'Prérequis : JDK Android Studio, SDK Android et appareil ADB connecté'
    Write-Output 'Construction : .\\gradlew.bat :app:assembleDebug'
    Write-Output 'Cible : ch.nicolab.cadence/.MainActivity'
    Write-Output 'Vérification : activité Android au premier plan'
    exit 0
}

if (-not (Test-Path $adb)) { Fail "ADB introuvable : $adb" }
$env:JAVA_HOME = $jdk
Push-Location $root
try {
    & .\gradlew.bat :app:assembleDebug
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $devices = & $adb devices | Select-String '^.+\sdevice$' | Select-Object -First 1
    if (-not $devices) { Fail "Aucun appareil Android prêt. Branchez un appareil ou démarrez un émulateur." }
    $apk = Join-Path $root 'app\build\outputs\apk\debug\app-debug.apk'
    if (-not (Test-Path $apk)) { Fail 'APK de développement introuvable après la construction.' 3 }
    & $adb install -r $apk
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $adb shell am start -n 'ch.nicolab.cadence/.MainActivity'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $focused = & $adb shell dumpsys window | Select-String 'mCurrentFocus|mFocusedApp' | Select-String 'ch.nicolab.cadence'
    if (-not $focused) { Fail "L’activité Cadence ne sest pas ouverte." 3 }
    Write-Output 'DEV_READY activity=ch.nicolab.cadence/.MainActivity'
} finally {
    Pop-Location
}

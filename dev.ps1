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
$emulator = Join-Path $sdk 'emulator\emulator.exe'

function Fail([string]$message, [int]$code = 2) {
    [Console]::Error.WriteLine($message)
    exit $code
}

function Get-ReadyDevice {
    & $adb devices | Select-String '^.+\sdevice$' | Select-Object -First 1
}

function Start-AvailableAvd {
    if (-not (Test-Path $emulator)) { Fail "Emulateur Android introuvable : $emulator" }
    $avd = & $emulator -list-avds | Select-Object -First 1
    if (-not $avd) { Fail "Aucun AVD Android configure." }
    Start-Process -FilePath $emulator -ArgumentList "@$avd", '-no-snapshot-save' -WindowStyle Hidden
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        $device = Get-ReadyDevice
        if ($device) {
            $serial = ($device -split '\s+')[0]
            $booted = & $adb -s $serial shell getprop sys.boot_completed
            if ($booted.Trim() -eq '1') { return $serial }
        }
        Start-Sleep -Seconds 1
    }
    Fail "Emulateur Android non pret apres 60 secondes." 3
}

function Wait-ForCadence([string]$serial) {
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        $state = & $adb -s $serial shell dumpsys window
        if ($state -match 'ch\.nicolab\.cadence/\.MainActivity') { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

if ($Dummy) { Fail "Ce projet ne propose pas de données de démonstration." }
if (-not (Test-Path $jdk)) { Fail "JDK Android Studio introuvable : $jdk" }
if (-not (Test-Path (Join-Path $root 'gradlew.bat'))) { Fail 'Le wrapper Gradle est introuvable.' }

if ($Plan) {
    Write-Output 'Developpement pret'
    Write-Output 'Mode : donnees reelles locales'
    Write-Output 'Prerequis : JDK Android Studio, SDK Android et appareil ADB connecte'
    Write-Output 'Construction : .\\gradlew.bat :app:assembleDebug'
    Write-Output 'Cible : ch.nicolab.cadence/.MainActivity'
    Write-Output 'Verification : activite Android au premier plan'
    exit 0
}

if (-not (Test-Path $adb)) { Fail "ADB introuvable : $adb" }
$env:JAVA_HOME = $jdk
Push-Location $root
try {
    & .\gradlew.bat :app:assembleDebug
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $device = Get-ReadyDevice
    if (-not $device) { $serial = Start-AvailableAvd } else { $serial = ($device -split '\s+')[0] }
    $apk = Join-Path $root 'app\build\outputs\apk\debug\app-debug.apk'
    if (-not (Test-Path $apk)) { Fail 'APK de développement introuvable après la construction.' 3 }
    & $adb -s $serial install -r $apk
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $adb -s $serial shell am start -n 'ch.nicolab.cadence/.MainActivity'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if (-not (Wait-ForCadence $serial)) { Fail "Activite Cadence non ouverte." 3 }
    Write-Output 'DEV_READY activity=ch.nicolab.cadence/.MainActivity'
} finally {
    Pop-Location
}

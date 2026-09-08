[CmdletBinding()]
param(
    [switch]$NonInteractive,
    [switch]$Plan,
    [switch]$Confirm,
    [string[]]$Destination
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$versionFile = Join-Path $root 'app-release\version.json'
$supportedDestinations = @('smartphone', 'nicoapps', 'default')
$artifact = Join-Path $root 'app\build\outputs\apk\debug\app-debug.apk'
$javaHome = 'C:\Program Files\Android\Android Studio\jbr'
$uploader = Join-Path $root 'scripts\dev-publish\upload-release.ps1'

function Fail([string]$message, [int]$code = 2) {
    [Console]::Error.WriteLine($message)
    exit $code
}

if (-not (Test-Path $versionFile)) { Fail 'La version de publication est introuvable.' }
$version = Get-Content -Raw $versionFile | ConvertFrom-Json
if ($Destination) {
    $unknown = $Destination | Where-Object { $_ -notin $supportedDestinations }
    if ($unknown) { Fail "Destination inconnue : $($unknown -join ', ')" }
}

$selectedDestinations = if ($Destination) { $Destination } else { @('default') }

$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
$adb = if ($adbCommand) { $adbCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }

function Get-ConnectedPhone {
    if (-not (Test-Path $adb)) { return $null }
    $devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '^([^\s]+)\s+device$' } | ForEach-Object { $Matches[1] }
    $phones = @($devices | Where-Object { (& $adb -s $_ shell getprop ro.kernel.qemu).Trim() -ne '1' })
    if ($phones.Count -eq 1) { return $phones[0] }
    return $null
}

$phoneSerial = Get-ConnectedPhone
$phoneTarget = if ($phoneSerial) { "smartphone ($phoneSerial)" } else { 'aucun smartphone connecté' }

if ($Plan) {
    Write-Output 'Publication prête'
    Write-Output "Version : $($version.versionName)"
    Write-Output 'Destinations :'
    & $uploader -ApkPath $artifact -Plan
    Write-Output "  - Smartphone : $phoneTarget"
    Write-Output 'Vérifications : tests domaine et construction debug Android'
    Write-Output 'Artefact : app\build\outputs\apk\debug\app-debug.apk'
    exit 0
}

if (-not $NonInteractive) {
    Write-Output "Publication prête`n`nVersion : $($version.versionName)`nDestinations : NicoApps + $phoneTarget`n`nLes tests et la construction seront lancés avant envoi.`n"
    $answer = Read-Host 'Publier maintenant ? [o/N]'
    if ($answer -notmatch '^(o|oui)$') { exit 0 }
    $Confirm = $true
}
if (-not $Confirm) { Fail 'Publication refusée : utilisez -Confirm en mode non interactif.' }

$env:JAVA_HOME = $javaHome

Write-Host "Exécution des tests..." -ForegroundColor Cyan
& (Join-Path $root 'gradlew.bat') ':domain:test'
if ($LASTEXITCODE -ne 0) { Fail 'Les tests ont échoué.' 3 }

Write-Host "Construction debug..." -ForegroundColor Cyan
& (Join-Path $root 'gradlew.bat') ':app:assembleDebug' '--no-configuration-cache'
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $artifact)) { Fail 'La construction Android a échoué.' 3 }

# NicoApps
if ('default' -in $selectedDestinations -or 'nicoapps' -in $selectedDestinations) {
    Write-Host "Publication sur NicoApps..." -ForegroundColor Cyan
    & $uploader -ApkPath $artifact
    if ($LASTEXITCODE -ne 0) { Fail 'La publication NicoApps a échoué.' 4 }
}

# Smartphone si connecté
if ('default' -in $selectedDestinations -or 'smartphone' -in $selectedDestinations) {
    if ($phoneSerial) {
        $users = & $adb -s $phoneSerial shell pm list users
        $personalMatch = [regex]::Match(($users -join "`n"), 'UserInfo\{(\d+):[^}]+\}(?!.*profileGroupId)')
        $personalUser = if ($personalMatch.Success) { $personalMatch.Groups[1].Value } else { '0' }
        & $adb -s $phoneSerial install --user $personalUser -r $artifact
        if ($LASTEXITCODE -ne 0) { Fail 'L’installation sur le smartphone a échoué.' 4 }
        $installed = & $adb -s $phoneSerial shell dumpsys package ch.nicolab.cadence | Select-String -Pattern "versionName=$([regex]::Escape($version.versionName))"
        if (-not $installed) { Fail 'La version installée sur le smartphone n’a pas pu être vérifiée.' 4 }
        Write-Host "Smartphone : version $($version.versionName) installée" -ForegroundColor Green
    } else {
        Write-Host 'Smartphone : aucun appareil physique connecté, installation ignorée' -ForegroundColor Yellow
    }
}

Write-Output 'PUBLISH_OK'

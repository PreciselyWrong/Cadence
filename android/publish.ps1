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
$versionFile = Join-Path $root 'app-release/version.json'
$changelogFile = Join-Path $root 'CHANGELOG.md'
$supportedDestinations = @('smartphone', 'nicoapps', 'default')
$artifact = Join-Path $root 'app/build/outputs/apk/debug/app-debug.apk'
$javaHome = if ($IsWindows) { 'C:\Program Files\Android\Android Studio\jbr' } else { '/usr/lib/jvm/temurin-21-jdk' }
$uploader = Join-Path $root 'scripts/dev-publish/upload-release.ps1'

# The committed gradlew does not run on Linux (android/AGENTS.md): call the
# wrapper jar with the JDK directly there.
function Invoke-Gradle([string[]]$Arguments) {
    if ($IsWindows) {
        & (Join-Path $root 'gradlew.bat') @Arguments
    } else {
        if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $HOME 'Android/Sdk' }
        $wrapper = Join-Path $root 'gradle/wrapper/gradle-wrapper.jar'
        & (Join-Path $javaHome 'bin/java') '-Dorg.gradle.jvmargs=-Xmx3g' -cp $wrapper org.gradle.wrapper.GradleWrapperMain --max-workers=4 @Arguments
    }
}

function Fail([string]$message, [int]$code = 2) {
    [Console]::Error.WriteLine($message)
    exit $code
}

if (-not (Test-Path $versionFile)) { Fail 'La version de publication est introuvable.' }
$version = Get-Content -Raw $versionFile | ConvertFrom-Json

function Get-ReleaseChangelog {
    if (-not (Test-Path -LiteralPath $changelogFile)) { return $null }
    $content = Get-Content -LiteralPath $changelogFile -Raw -Encoding UTF8
    $match = [regex]::Match($content, '(?ms)^## .+?\r?\n(?<body>.*?)(?=^## |\z)')
    if (-not $match.Success) { return $null }
    $body = $match.Groups['body'].Value.Trim()
    if ([string]::IsNullOrWhiteSpace($body)) { return $null }
    return $body
}

$releaseChangelog = Get-ReleaseChangelog
if ($Destination) {
    $unknown = $Destination | Where-Object { $_ -notin $supportedDestinations }
    if ($unknown) { Fail "Destination inconnue : $($unknown -join ', ')" }
}

$selectedDestinations = if ($Destination) { $Destination } else { @('default') }

$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
$adb = if ($adbCommand) { $adbCommand.Source } elseif ($IsWindows) { Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' } else { Join-Path $HOME 'Android/Sdk/platform-tools/adb' }

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
    & $uploader -ApkPath $artifact -Changelog $releaseChangelog -Plan
    Write-Output "  - Smartphone : $phoneTarget"
    Write-Output 'Vérifications : tests domaine et construction debug Android'
    Write-Output 'Artefact : app/build/outputs/apk/debug/app-debug.apk'
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
Invoke-Gradle @(':domain:test', ':tasks:testDebugUnitTest', ':app:testDebugUnitTest')
if ($LASTEXITCODE -ne 0) { Fail 'Les tests ont échoué.' 3 }

Write-Host "Construction debug..." -ForegroundColor Cyan
Invoke-Gradle @(':app:assembleDebug', '-Pcadence.abis=arm64-v8a', '--no-configuration-cache')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $artifact)) { Fail 'La construction Android a échoué.' 3 }

# NicoApps
if ('default' -in $selectedDestinations -or 'nicoapps' -in $selectedDestinations) {
    Write-Host "Publication sur NicoApps..." -ForegroundColor Cyan
    & $uploader -ApkPath $artifact -Changelog $releaseChangelog
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

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
$supportedDestinations = @('smartphone')
$artifact = Join-Path $root 'app\build\outputs\apk\debug\app-debug.apk'
$javaHome = 'C:\Program Files\Android\Android Studio\jbr'

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

if ($Plan) {
    Write-Output 'Publication prête'
    Write-Output "Version : $($version.versionName)"
    Write-Output 'Destinations : smartphone connecté, si présent'
    Write-Output 'Vérifications : tests domaine et construction Android'
    Write-Output 'Artefact : app\\build\\outputs\\apk\\debug\\app-debug.apk'
    Write-Output 'Activation : installation dans le profil personnel Android'
    Write-Output 'Vérification : version installée sur le smartphone'
    Write-Output 'Retour arrière : la version précédente reste installable depuis son APK'
    exit 0
}

if (-not $NonInteractive) {
    Write-Output "Publication prête`n`nVersion : $($version.versionName)`nDestinations : smartphone connecté, si présent`n`nLes tests et la construction seront lancés avant envoi.`n"
    $answer = Read-Host 'Publier maintenant ? [o/N]'
    if ($answer -notmatch '^(o|oui)$') { exit 0 }
    $Confirm = $true
}
if (-not $Confirm) { Fail 'Publication refusée : utilisez -Confirm en mode non interactif.' }
$selectedDestinations = if ($Destination) { $Destination } else { @('smartphone') }
$env:JAVA_HOME = $javaHome

& (Join-Path $root 'gradlew.bat') ':domain:test'
if ($LASTEXITCODE -ne 0) { Fail 'Les tests ont échoué.' 3 }
& (Join-Path $root 'gradlew.bat') ':app:assembleDebug'
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $artifact)) { Fail 'La construction Android a échoué.' 3 }

if ('smartphone' -in $selectedDestinations) {
    $adbCommand = Get-Command adb -ErrorAction SilentlyContinue
    $adb = if ($adbCommand) { $adbCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
    if (Test-Path $adb) {
        $devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '^([^\s]+)\s+device$' } | ForEach-Object { $Matches[1] }
        $phones = @($devices | Where-Object { (& $adb -s $_ shell getprop ro.kernel.qemu).Trim() -ne '1' })
        if ($phones.Count -gt 1) { Fail 'Plusieurs smartphones sont connectés. Déconnectez ceux qui ne doivent pas recevoir Cadence.' 2 }
        if ($phones.Count -eq 1) {
            $serial = $phones[0]
            $users = & $adb -s $serial shell pm list users
            $personalMatch = [regex]::Match(($users -join "`n"), 'UserInfo\{(\d+):[^}]+\}(?!.*profileGroupId)')
            $personalUser = if ($personalMatch.Success) { $personalMatch.Groups[1].Value } else { '0' }
            & $adb -s $serial install --user $personalUser -r $artifact
            if ($LASTEXITCODE -ne 0) { Fail 'L’installation sur le smartphone a échoué.' 4 }
            $installed = & $adb -s $serial shell dumpsys package ch.nicolab.cadence | Select-String -Pattern "versionName=$([regex]::Escape($version.versionName))"
            if (-not $installed) { Fail 'La version installée sur le smartphone n’a pas pu être vérifiée.' 4 }
            Write-Output "Smartphone : version $($version.versionName) installée"
        } else {
            Write-Output 'Smartphone : aucun appareil physique connecté, installation ignorée'
        }
    } else {
        Write-Output 'Smartphone : ADB absent, installation ignorée'
    }
}

Write-Output 'PUBLISH_OK'

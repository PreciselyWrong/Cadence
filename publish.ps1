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
$supportedDestinations = @()

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
    Write-Output 'Destinations : aucune destination configurée'
    Write-Output 'Vérifications : tests domaine et construction Android'
    Write-Output 'Artefact : app\\build\\outputs\\apk\\debug\\app-debug.apk'
    Write-Output 'Activation et retour arrière : non configurés'
    exit 0
}

if (-not $NonInteractive) {
    Write-Output "Publication prête`n`nVersion : $($version.versionName)`nDestinations : aucune destination configurée`n`nLes tests et la construction seront lancés avant envoi.`n"
    $answer = Read-Host 'Publier maintenant ? [o/N]'
    if ($answer -notmatch '^(o|oui)$') { exit 0 }
    $Confirm = $true
}
if (-not $Confirm) { Fail 'Publication refusée : utilisez -Confirm en mode non interactif.' }
if ($supportedDestinations.Count -eq 0) { Fail "Aucune destination de publication nest configurée pour ce projet." }

Fail "Aucune destination de publication nest configurée pour ce projet."

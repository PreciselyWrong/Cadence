# Envoi de l'APK construit au catalogue NicoApps, puis publication.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ApkPath,
    [switch]$Plan
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$lanBaseUrl = 'http://192.168.1.172:6812'
$publicBaseUrl = 'https://nicoapps.nicolab.ch'
$tokenPath = Join-Path $env:LOCALAPPDATA 'NicoApps\admin-token.dat'

function Get-AdminToken {
    if (-not [string]::IsNullOrWhiteSpace($env:NICOAPPS_ADMIN_TOKEN)) {
        return $env:NICOAPPS_ADMIN_TOKEN
    }
    if (-not (Test-Path -LiteralPath $tokenPath)) {
        return $null
    }
    try {
        $secure = ConvertTo-SecureString -String (Get-Content -LiteralPath $tokenPath -Raw).Trim()
        return [System.Net.NetworkCredential]::new('', $secure).Password
    } catch {
        return $null
    }
}

function Get-BaseUrl {
    if (-not [string]::IsNullOrWhiteSpace($env:NICOAPPS_BASE_URL)) {
        return $env:NICOAPPS_BASE_URL.TrimEnd('/')
    }
    try {
        $health = & curl.exe -s -m 2 "$lanBaseUrl/health" | ConvertFrom-Json
        if ($health.PSObject.Properties['status'] -and $health.status -eq 'ok') { return $lanBaseUrl }
        return $publicBaseUrl
    } catch {
        return $publicBaseUrl
    }
}

$baseUrl = Get-BaseUrl
$onLan = $baseUrl -eq $lanBaseUrl

if ($Plan) {
    $loc = if ($onLan) { ' (reseau local)' } else { ' (domaine public)' }
    Write-Output "  - NicoApps : envoi de $ApkPath a $baseUrl$loc, puis publication."
    exit 0
}

$token = Get-AdminToken
if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Error "Diffusion ignoree : aucun jeton d'administration. Lancer scripts\dev-publish\new-admin-token.ps1 dans NicoApps, puis declarer son empreinte au serveur."
    exit 1
}

if (-not (Test-Path -LiteralPath $ApkPath)) {
    Write-Error "APK introuvable : $ApkPath"
    exit 1
}

Write-Host "Envoi de l'APK a $baseUrl..." -ForegroundColor Cyan
$uploadRaw = & curl.exe -s -S -X POST -H "Authorization: Bearer $token" -F "file=@$ApkPath" "$baseUrl/v1/admin/releases/upload"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($uploadRaw)) {
    Write-Error "L'envoi a echoue."
    exit 1
}

$upload = $uploadRaw | ConvertFrom-Json
if ($upload.PSObject.Properties['error'] -and $upload.error) {
    Write-Error "L'envoi a echoue : $($upload.error.message)"
    exit 1
}
if (-not $upload.PSObject.Properties['release_id']) {
    Write-Error "Reponse inattendue du serveur : $uploadRaw"
    exit 1
}

$releaseId = $upload.release_id
$analysis = $upload.analysis
Write-Host "Analyse : $($analysis.display_name) $($analysis.version_name) ($($analysis.version_code)) - verdict $($analysis.verdict)" -ForegroundColor Cyan

if ($analysis.blocking) {
    Write-Output 'UPLOAD_BLOCKED'
    Write-Error "Publication refusee : verdict '$($analysis.verdict)'. Le brouillon $releaseId attend une decision dans l'ecran d'administration."
    exit 2
}

Write-Host 'Publication sur NicoApps...' -ForegroundColor Cyan
$publishRaw = & curl.exe -s -S -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "{}" "$baseUrl/v1/admin/releases/$releaseId/publish"
if ($LASTEXITCODE -ne 0) {
    Write-Error "La publication a echoue."
    exit 1
}

$publishResult = $publishRaw | ConvertFrom-Json
if ($publishResult.PSObject.Properties['error'] -and $publishResult.error) {
    Write-Error "La publication a echoue : $($publishResult.error.message)"
    exit 1
}

Write-Host "Diffuse sur NicoApps : $($analysis.display_name) $($analysis.version_name) est en ligne." -ForegroundColor Green

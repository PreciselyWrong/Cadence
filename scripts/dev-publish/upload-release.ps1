# Envoi de l'APK construit au catalogue NicoApps, puis publication.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ApkPath,
    [string]$Changelog,
    [switch]$Plan
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

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

if ($Plan) {
    $changelogState = if ([string]::IsNullOrWhiteSpace($Changelog)) { 'sans changelog' } else { 'avec changelog' }
    Write-Output "  - NicoApps : envoi de $ApkPath, puis publication $changelogState."
    exit 0
}

$baseUrl = Get-BaseUrl

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
$publishPayload = @{ force = $false }
if (-not [string]::IsNullOrWhiteSpace($Changelog)) {
    $publishPayload.changelog = $Changelog.Trim()
}
$publishBody = $publishPayload | ConvertTo-Json -Compress
$publishTemp = [System.IO.Path]::GetTempFileName()
try {
    [System.IO.File]::WriteAllBytes($publishTemp, [System.Text.Encoding]::UTF8.GetBytes($publishBody))
    $publishRaw = & curl.exe -s -S -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data-binary "@$publishTemp" "$baseUrl/v1/admin/releases/$releaseId/publish"
} finally {
    if (Test-Path -LiteralPath $publishTemp) { Remove-Item -LiteralPath $publishTemp -Force }
}
if ($LASTEXITCODE -ne 0) {
    Write-Error "La publication a echoue."
    exit 1
}

$publishResult = $publishRaw | ConvertFrom-Json
if ($publishResult.PSObject.Properties['error'] -and $publishResult.error) {
    Write-Error "La publication a echoue : $($publishResult.error.message)"
    exit 1
}

$catalogRaw = & curl.exe -s -S -H "Authorization: Bearer $token" "$baseUrl/v1/catalog"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($catalogRaw)) {
    Write-Output 'UPLOAD_VERIFY_FAILED'
    Write-Error "La publication est partie, mais NicoApps n'a pas pu la confirmer."
    exit 1
}

$catalog = $catalogRaw | ConvertFrom-Json
$published = @($catalog.apps) | Where-Object { $_.package_name -eq $analysis.package_name } | Select-Object -First 1
$expectedChangelog = if ([string]::IsNullOrWhiteSpace($Changelog)) { $null } else { ($Changelog -replace '\r\n', "`n").Trim() }
$actualChangelog = if ($null -eq $published -or $null -eq $published.release -or [string]::IsNullOrWhiteSpace($published.release.changelog)) { $null } else { ($published.release.changelog -replace '\r\n', "`n").Trim() }
$versionMatches = $null -ne $published -and
    $null -ne $published.release -and
    [long]$published.release.version_code -eq [long]$analysis.version_code -and
    [string]$published.release.version_name -eq [string]$analysis.version_name
$changelogMatches = $null -eq $expectedChangelog -or
    [string]$actualChangelog -ceq [string]$expectedChangelog
if (-not $versionMatches -or -not $changelogMatches) {
    Write-Output 'UPLOAD_VERIFY_FAILED'
    Write-Error "La publication est partie, mais la version ou son changelog n'est pas visible dans NicoApps."
    exit 1
}

Write-Host "Diffuse sur NicoApps : $($analysis.display_name) $($analysis.version_name) est en ligne." -ForegroundColor Green
Write-Output 'UPLOAD_OK'

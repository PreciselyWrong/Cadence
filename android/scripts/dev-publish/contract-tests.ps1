[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Assert-Condition([bool]$condition, [string]$message) {
    if (-not $condition) { throw $message }
}

function Assert-ExitCode([scriptblock]$command, [int]$expected, [string]$message) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $command } finally { $ErrorActionPreference = $previous }
    Assert-Condition ($LASTEXITCODE -eq $expected) $message
}

Assert-Condition (Test-Path (Join-Path $root 'dev.ps1')) 'dev.ps1 absent'
Assert-Condition (Test-Path (Join-Path $root 'publish.ps1')) 'publish.ps1 absent'
$devSource = Get-Content -Raw (Join-Path $root 'dev.ps1')
$publishSource = Get-Content -Raw (Join-Path $root 'publish.ps1')
$uploaderSource = Get-Content -Raw (Join-Path $root 'scripts\dev-publish\upload-release.ps1')
Assert-Condition ($devSource -match 'emulator\\emulator\.exe') 'Le lanceur doit pouvoir démarrer un AVD'
Assert-Condition ($devSource -match '\$defaultAvd\s*=\s*''Pixel_9_Pro''') 'Le lanceur doit préférer l AVD Pixel 9 Pro'
Assert-Condition ($devSource -match 'sys\.boot_completed') 'Le lanceur doit attendre le démarrage complet de l AVD'
Assert-Condition ($devSource -match 'Wait-ForCadence') 'Le lanceur doit attendre que Cadence soit au premier plan'
Assert-Condition ($publishSource -match "'smartphone'") 'La publication doit accepter la destination smartphone'
Assert-Condition ($publishSource -match 'adb.+install.+--user') 'La publication doit installer explicitement dans un profil Android'
Assert-Condition ($publishSource -match 'ro\.kernel\.qemu') 'La publication doit exclure les émulateurs'
Assert-Condition ($publishSource -match ':app:assembleDebug') 'La publication doit construire l APK debug distribuable'
Assert-Condition ($publishSource -match 'app-debug\.apk') 'La publication doit envoyer l APK debug construit'
Assert-Condition ($publishSource -match '--no-configuration-cache') 'La publication doit relire la version avant chaque build'
Assert-Condition ($publishSource -match 'Get-ReleaseChangelog') 'La publication doit extraire le premier bloc du changelog'
Assert-Condition ($publishSource -match '-Changelog\s+\$releaseChangelog') 'La publication doit transmettre le changelog courant'
Assert-Condition ($uploaderSource -match '\[string\]\$Changelog') 'Le diffuseur doit accepter un changelog facultatif'
Assert-Condition ($uploaderSource -match '\.changelog\s*=') 'Le diffuseur doit envoyer le changelog à NicoApps'
Assert-Condition ($uploaderSource -match '/v1/catalog') 'Le diffuseur doit relire la version publiée'
Assert-Condition ($uploaderSource -match 'Authorization:.+?/v1/catalog') 'La relecture du catalogue doit être authentifiée'
Assert-Condition ($uploaderSource -match 'release\.changelog') 'Le diffuseur doit relire le changelog publié'
Assert-Condition ($uploaderSource -match 'UPLOAD_VERIFY_FAILED') 'Le diffuseur doit échouer si la relecture ne correspond pas'
& (Join-Path $root 'dev.ps1') -Plan -NonInteractive
Assert-Condition ($LASTEXITCODE -eq 0) 'Le plan de développement doit réussir'
& (Join-Path $root 'publish.ps1') -Plan -NonInteractive
Assert-Condition ($LASTEXITCODE -eq 0) 'Le plan de publication doit réussir'
$dummyPlan = & (Join-Path $root 'dev.ps1') -Dummy -Plan -NonInteractive
Assert-Condition ($LASTEXITCODE -eq 0) 'Le plan du mode démo doit réussir'
Assert-Condition (($dummyPlan -join "`n") -match 'Mode : donnees de demonstration') 'Le plan doit annoncer les données de démonstration'
Assert-Condition ($devSource -match 'POPULATE_DUMMY_DATA') 'Le mode démo doit demander le peuplement du build debug'
Assert-ExitCode { & (Join-Path $root 'publish.ps1') -NonInteractive 2>$null } 2 'La publication non confirmée doit être refusée'
Assert-ExitCode { & (Join-Path $root 'publish.ps1') -Plan -NonInteractive -Destination inconnue 2>$null } 2 'Une destination inconnue doit être refusée'

Write-Output 'CONTRACT_TESTS_OK'

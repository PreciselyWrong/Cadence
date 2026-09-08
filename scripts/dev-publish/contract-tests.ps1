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
Assert-Condition ($devSource -match 'emulator\\emulator\.exe') 'Le lanceur doit pouvoir démarrer un AVD'
Assert-Condition ($devSource -match 'sys\.boot_completed') 'Le lanceur doit attendre le démarrage complet de l AVD'
Assert-Condition ($devSource -match 'Wait-ForCadence') 'Le lanceur doit attendre que Cadence soit au premier plan'
Assert-Condition ($publishSource -match "'smartphone'") 'La publication doit accepter la destination smartphone'
Assert-Condition ($publishSource -match 'adb.+install.+--user') 'La publication doit installer explicitement dans un profil Android'
Assert-Condition ($publishSource -match 'ro\.kernel\.qemu') 'La publication doit exclure les émulateurs'
Assert-Condition ($publishSource -match ':app:assembleDebug') 'La publication doit construire l APK debug distribuable'
Assert-Condition ($publishSource -match 'app-debug\.apk') 'La publication doit envoyer l APK debug construit'
Assert-Condition ($publishSource -match '--no-configuration-cache') 'La publication doit relire la version avant chaque build'
& (Join-Path $root 'dev.ps1') -Plan -NonInteractive
Assert-Condition ($LASTEXITCODE -eq 0) 'Le plan de développement doit réussir'
& (Join-Path $root 'publish.ps1') -Plan -NonInteractive
Assert-Condition ($LASTEXITCODE -eq 0) 'Le plan de publication doit réussir'
Assert-ExitCode { & (Join-Path $root 'dev.ps1') -Dummy -Plan -NonInteractive 2>$null } 2 'Le mode démo doit être refusé avant action'
Assert-ExitCode { & (Join-Path $root 'publish.ps1') -NonInteractive 2>$null } 2 'La publication non confirmée doit être refusée'
Assert-ExitCode { & (Join-Path $root 'publish.ps1') -Plan -NonInteractive -Destination inconnue 2>$null } 2 'Une destination inconnue doit être refusée'

Write-Output 'CONTRACT_TESTS_OK'

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
$defaultAvd = 'Pixel_9_Pro'

function Fail([string]$message, [int]$code = 2) {
    [Console]::Error.WriteLine($message)
    exit $code
}

function Get-ReadyDevice {
    & $adb devices | Select-String '^.+\sdevice$' | Select-Object -First 1
}

function Start-InteractiveEmulator {
    param(
        [Parameter(Mandatory = $true)][string]$EmulatorPath,
        [Parameter(Mandatory = $true)][string]$AvdName,
        [string[]]$ExtraArguments = @()
    )
    $argsList = @("@$AvdName") + $ExtraArguments
    if ($env:OS -match 'Windows') {
        $taskName = "DevEmuLaunch_$([guid]::NewGuid().ToString('N').Substring(0,8))"
        $cmdLine = "`"$EmulatorPath`" $($argsList -join ' ')"
        try {
            $null = schtasks /create /tn $taskName /tr "$cmdLine" /sc ONCE /st "23:59" /it /f 2>&1
            if ($LASTEXITCODE -eq 0) {
                $null = schtasks /run /tn $taskName 2>&1
                Start-Sleep -Milliseconds 500
                $null = schtasks /delete /tn $taskName /f 2>&1
                return
            }
        } catch {}
    }
    Start-Process -FilePath $EmulatorPath -ArgumentList $argsList
}

function Start-AvailableAvd {
    if (-not (Test-Path $emulator)) { Fail "Emulateur Android introuvable : $emulator" }
    $avds = @(& $emulator -list-avds)
    $avd = if ($avds -contains $defaultAvd) { $defaultAvd } else { $avds | Select-Object -First 1 }
    if (-not $avd) { Fail "Aucun AVD Android configure." }
    Start-InteractiveEmulator -EmulatorPath $emulator -AvdName $avd -ExtraArguments @('-no-snapshot-save')
    for ($attempt = 1; $attempt -le 120; $attempt++) {
        $device = Get-ReadyDevice
        if ($device) {
            $serial = ($device -split '\s+')[0]
            $booted = & $adb -s $serial shell getprop sys.boot_completed
            if ($booted.Trim() -eq '1') { return $serial }
        }
        Start-Sleep -Seconds 1
    }
    Fail "Emulateur Android non pret apres 120 secondes." 3
}

function Wait-ForCadence([string]$serial) {
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        $state = & $adb -s $serial shell dumpsys window
        if ($state -match 'ch\.nicolab\.cadence/\.MainActivity') { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

if (-not (Test-Path $jdk)) { Fail "JDK Android Studio introuvable : $jdk" }
if (-not (Test-Path (Join-Path $root 'gradlew.bat'))) { Fail 'Le wrapper Gradle est introuvable.' }

if ($Plan) {
    Write-Output 'Developpement pret'
    Write-Output $(if ($Dummy) { 'Mode : donnees de demonstration' } else { 'Mode : donnees reelles locales' })
    Write-Output 'Prerequis : JDK Android Studio, SDK Android et appareil ADB connecte'
    Write-Output 'Construction : .\\gradlew.bat :app:assembleDebug'
    Write-Output "AVD prefere : $defaultAvd"
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
    if ($Dummy) {
        $seedResult = & $adb -s $serial shell am broadcast -W `
            -a 'ch.nicolab.cadence.debug.POPULATE_DUMMY_DATA' `
            -n 'ch.nicolab.cadence/ch.nicolab.cadence.debug.DummyDataReceiver'
        if ($LASTEXITCODE -ne 0 -or ($seedResult -join "`n") -notmatch 'result=-1') {
            $seedResult | Write-Output
            Fail 'Les données de démonstration n ont pas pu être préparées.' 3
        }
    }
    & $adb -s $serial shell am start -n 'ch.nicolab.cadence/.MainActivity'
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if (-not (Wait-ForCadence $serial)) { Fail "Activite Cadence non ouverte." 3 }
    Write-Output 'DEV_READY activity=ch.nicolab.cadence/.MainActivity'
} finally {
    Pop-Location
}

param(
    [switch]$SkipBroker,
    [switch]$StartSubscriber
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$pythonCandidates = @(
    (Join-Path $Root ".venv\Scripts\python.exe"),
    (Join-Path $Root "..\.venv\Scripts\python.exe"),
    (Join-Path $Root "..\..\.venv\Scripts\python.exe")
)

$PythonExe = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $PythonExe) {
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        $PythonExe = $pythonCmd.Source
    }
}

$BrokerScript = Join-Path $Root "mqtt_broker.ps1"

function Get-ScriptProcess {
    param([string]$ScriptName)

    Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$ScriptName*" }
}

function Start-ScriptIfNotRunning {
    param(
        [string]$ScriptName,
        [string]$Label
    )

    $existing = Get-ScriptProcess -ScriptName $ScriptName
    if ($existing) {
        Write-Output "[SKIP] $Label already running."
        $existing | Select-Object ProcessId, CommandLine | Format-Table -AutoSize | Out-String | Write-Output
        return
    }

    Start-Process -FilePath $PythonExe -ArgumentList $ScriptName -WorkingDirectory $Root -WindowStyle Normal | Out-Null
    Write-Output "[START] $Label started in a separate window."
}

if (-not $PythonExe -or -not (Test-Path $PythonExe)) {
    throw "Python not found: $PythonExe"
}

if (-not $SkipBroker) {
    if (Test-Path $BrokerScript) {
        Write-Output "[STEP] Ensuring MQTT broker is running..."
        & $BrokerScript start
    } else {
        Write-Output "[WARN] mqtt_broker.ps1 not found, skip broker start."
    }
}

Write-Output "[STEP] Starting positioning server..."
Start-ScriptIfNotRunning -ScriptName "indoor_positioning_server.py" -Label "Positioning server"

Write-Output "[STEP] Starting visualizer..."
Start-ScriptIfNotRunning -ScriptName "indoor_position_visualizer.py" -Label "Position visualizer"

if ($StartSubscriber) {
    Write-Output "[STEP] Starting MQTT test subscriber..."
    Start-ScriptIfNotRunning -ScriptName "mqtt_test_subscriber.py" -Label "MQTT subscriber"
}

Write-Output "[DONE] Stack launch command completed."

param(
    [switch]$SkipBroker,
    [switch]$SkipVisualizer,
    [switch]$StartSubscriber,
    [switch]$StartPressureSimulator
)

$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$RuntimeDir = Join-Path $Root ".runtime"
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

$pythonCandidates = @(
    (Join-Path $Root ".venv\Scripts\python.exe"),
    (Join-Path $Root "..\.venv\Scripts\python.exe"),
    (Join-Path $Root "..\..\.venv\Scripts\python.exe")
)

$pythonCommands = Get-Command python -All -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Source -Unique
$pythonCandidates += $pythonCommands

$PythonExe = $null
foreach ($candidate in ($pythonCandidates | Where-Object { $_ } | Select-Object -Unique)) {
    if (-not (Test-Path $candidate)) {
        continue
    }

    & $candidate -c "import paho.mqtt.client, numpy" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $PythonExe = (Resolve-Path $candidate).Path
        break
    }
}

$BrokerScript = Join-Path $Root "mqtt_broker.ps1"

function Get-ScriptProcess {
    param([string]$ScriptName)

    $processName = [System.IO.Path]::GetFileNameWithoutExtension($ScriptName)
    $pidPath = Join-Path $RuntimeDir "$processName.pid"
    if (Test-Path $pidPath) {
        $savedPid = 0
        $rawPid = (Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ([int]::TryParse($rawPid, [ref]$savedPid)) {
            $savedProcess = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
            if ($savedProcess) {
                return $savedProcess
            }
        }
        Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    }

    Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$ScriptName*" }
}

function Start-ScriptIfNotRunning {
    param(
        [string]$ScriptName,
        [string]$Label,
        [string]$ArgumentList = ""
    )

    $existing = Get-ScriptProcess -ScriptName $ScriptName
    if ($existing) {
        Write-Output "[SKIP] $Label already running."
        $existing | Select-Object ProcessId, CommandLine | Format-Table -AutoSize | Out-String | Write-Output
        return
    }

    $processName = [System.IO.Path]::GetFileNameWithoutExtension($ScriptName)
    $pidPath = Join-Path $RuntimeDir "$processName.pid"
    $stdoutPath = Join-Path $RuntimeDir "$processName.out.log"
    $stderrPath = Join-Path $RuntimeDir "$processName.err.log"
    $argString = if ($ArgumentList) { "-u `"$ScriptName`" $ArgumentList" } else { "-u `"$ScriptName`"" }
    $process = Start-Process `
        -FilePath $PythonExe `
        -ArgumentList $argString `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru
    Set-Content -Path $pidPath -Value $process.Id
    Start-Sleep -Seconds 1
    $running = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
    if (-not $running) {
        Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
        Write-Output "[ERROR] $Label exited during startup."
        Write-Output "[LOG] $stderrPath"
        if (Test-Path $stderrPath) {
            Get-Content $stderrPath -Tail 20
        }
        throw "$Label failed to start."
    }

    Write-Output "[START] $Label started. PID=$($process.Id)"
    Write-Output "[LOG] $stdoutPath"
}

if (-not $PythonExe -or -not (Test-Path $PythonExe)) {
    throw "No Python installation with paho-mqtt and numpy was found. Run: python -m pip install -r requirements.txt"
}

Write-Output "[PYTHON] Using $PythonExe"

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

if (-not $SkipVisualizer) {
    Write-Output "[STEP] Starting visualizer..."
    Start-ScriptIfNotRunning -ScriptName "indoor_position_visualizer.py" -Label "Position visualizer"
}

Write-Output "[STEP] Starting AI Alert Verification Worker..."
Start-ScriptIfNotRunning -ScriptName "ai_alert_worker.py" -Label "AI Alert Worker"

if ($StartSubscriber) {
    Write-Output "[STEP] Starting MQTT test subscriber..."
    Start-ScriptIfNotRunning -ScriptName "mqtt_test_subscriber.py" -Label "MQTT subscriber"
}

if ($StartPressureSimulator) {
    Write-Output "[STEP] Starting pressure sensor simulator..."
    Start-ScriptIfNotRunning -ScriptName "test_pressure_publisher.py" -Label "Pressure simulator" -ArgumentList "--location sofa --toggle"
}

Write-Output "[DONE] Stack launch command completed."

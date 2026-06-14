$ErrorActionPreference = "Stop"

$RuntimeDir = Join-Path $PSScriptRoot ".runtime"
$targets = @(
    "indoor_positioning_server.py",
    "indoor_position_visualizer.py",
    "ai_alert_worker.py",
    "mqtt_test_subscriber.py",
    "test_pressure_publisher.py"
)

$stoppedPids = @()
foreach ($target in $targets) {
    $processName = [System.IO.Path]::GetFileNameWithoutExtension($target)
    $pidPath = Join-Path $RuntimeDir "$processName.pid"
    if (-not (Test-Path $pidPath)) {
        continue
    }

    $savedPid = 0
    $rawPid = (Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ([int]::TryParse($rawPid, [ref]$savedPid)) {
        $process = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
        if ($process) {
            Stop-Process -Id $savedPid -Force
            $stoppedPids += $savedPid
        }
    }
    Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
}

$procs = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $cmd = $_.CommandLine
        $null -ne $cmd -and
        $_.ProcessId -notin $stoppedPids -and
        ($targets | Where-Object { $cmd -like "*$_*" }).Count -gt 0
    }

if (-not $procs) {
    if ($stoppedPids.Count -gt 0) {
        Write-Output "[DONE] Stopped positioning process(es): $($stoppedPids -join ', ')"
    } else {
        Write-Output "[INFO] No related Python processes found."
    }
    exit 0
}

$procs | Select-Object ProcessId, CommandLine | Format-Table -AutoSize | Out-String | Write-Output

foreach ($p in $procs) {
    try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
    } catch {
        Write-Output "[WARN] Process already exited: $($p.ProcessId)"
    }
}

Write-Output "[DONE] Stopped positioning/visualizer/subscriber processes."

$ErrorActionPreference = "Stop"

$targets = @(
    "indoor_positioning_server.py",
    "indoor_position_visualizer.py",
    "mqtt_test_subscriber.py"
)

$procs = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $cmd = $_.CommandLine
        $null -ne $cmd -and ($targets | Where-Object { $cmd -like "*$_*" }).Count -gt 0
    }

if (-not $procs) {
    Write-Output "[INFO] No related Python processes found."
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

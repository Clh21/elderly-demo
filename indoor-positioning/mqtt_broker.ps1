param(
    [ValidateSet("start", "stop", "status", "restart")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$MosquittoExe = "C:\Program Files\Mosquitto\mosquitto.exe"
$ConfigPath = Join-Path $PSScriptRoot "mosquitto.conf"

function Get-BrokerListeners {
    Get-NetTCPConnection -LocalPort 1883 -State Listen -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, OwningProcess
}

function Get-LanIPv4 {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -ne "127.0.0.1" -and
            $_.IPAddress -notlike "169.254.*"
        } |
        Select-Object -ExpandProperty IPAddress -Unique
}

function Show-Status {
    $listeners = Get-BrokerListeners

    if (-not $listeners) {
        Write-Output "[MQTT] Not running on port 1883."
        return
    }

    Write-Output "[MQTT] Running on port 1883."
    $listeners | Format-Table -AutoSize | Out-String | Write-Output

    $ips = Get-LanIPv4
    if ($ips) {
        Write-Output "[MQTT] LAN IPv4 address(es):"
        $ips | ForEach-Object { Write-Output "  - $_" }
        Write-Output "[TIP] Set MQTT_SERVER on ESP32 to one of the LAN IPv4 addresses above."
    }
}

function Start-Broker {
    if (-not (Test-Path $MosquittoExe)) {
        throw "Mosquitto executable not found: $MosquittoExe"
    }

    if (-not (Test-Path $ConfigPath)) {
        throw "Config file not found: $ConfigPath"
    }

    $listeners = Get-BrokerListeners
    if ($listeners) {
        Write-Output "[MQTT] Broker already running."
        Show-Status
        return
    }

    $proc = Start-Process -FilePath $MosquittoExe -ArgumentList "-c `"$ConfigPath`" -v" -WindowStyle Minimized -PassThru
    Write-Output "[MQTT] Start requested. PID=$($proc.Id)"

    # Wait briefly for the listener to appear, avoiding a false "Not running" right after start.
    $maxChecks = 20
    for ($i = 0; $i -lt $maxChecks; $i++) {
        if (Get-BrokerListeners) {
            break
        }
        Start-Sleep -Milliseconds 250
    }

    Show-Status
}

function Stop-Broker {
    $procs = Get-Process mosquitto -ErrorAction SilentlyContinue
    if (-not $procs) {
        Write-Output "[MQTT] No mosquitto process found."
        return
    }

    $procs | Stop-Process -Force
    Write-Output "[MQTT] Stopped mosquitto process(es)."
    Show-Status
}

switch ($Action) {
    "start"   { Start-Broker }
    "stop"    { Stop-Broker }
    "status"  { Show-Status }
    "restart" {
        Stop-Broker
        Start-Broker
    }
    default    { throw "Unknown action: $Action" }
}

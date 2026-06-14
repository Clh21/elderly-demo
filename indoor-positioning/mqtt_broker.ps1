param(
    [ValidateSet("start", "stop", "status", "restart")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$MosquittoExe = "C:\Program Files\Mosquitto\mosquitto.exe"
$ConfigPath = Join-Path $PSScriptRoot "mosquitto.conf"
$FirewallRuleName = "Elderly Demo MQTT 1883 Public"

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-FirewallRuleReady {
    $output = netsh advfirewall firewall show rule name="$FirewallRuleName" verbose 2>$null | Out-String
    return (
        $output -match "Enabled:\s+Yes" -and
        $output -match "Direction:\s+In" -and
        $output -match "Profiles:\s+.*Public" -and
        $output -match "Protocol:\s+TCP" -and
        $output -match "LocalPort:\s+1883" -and
        $output -match "Action:\s+Allow"
    )
}

function Get-MosquittoBlockRuleOutput {
    netsh advfirewall firewall show rule name="mosquitto" verbose 2>$null | Out-String
}

function Test-MosquittoBlockRulesEnabled {
    $output = Get-MosquittoBlockRuleOutput
    return (
        $output -match "Enabled:\s+Yes" -and
        $output -match "Action:\s+Block" -and
        $output -match [regex]::Escape($MosquittoExe)
    )
}

function Ensure-MosquittoIsNotBlocked {
    if (-not (Test-MosquittoBlockRulesEnabled)) {
        return
    }

    if (Test-IsAdministrator) {
        netsh advfirewall firewall set rule name="mosquitto" new enable=no | Out-Null
        Write-Output "[FW] Disabled Windows program-level block rule for mosquitto.exe."
    } else {
        Write-Output "[WARN] Windows has an enabled Public block rule for mosquitto.exe."
        Write-Output "[WARN] Run this script as Administrator, or disable firewall rules named 'mosquitto'."
    }
}

function Ensure-FirewallRule {
    Ensure-MosquittoIsNotBlocked

    if (Test-FirewallRuleReady) {
        Write-Output "[FW] MQTT firewall rule is ready: $FirewallRuleName (Public TCP 1883)."
        return
    }

    $rule = Get-NetFirewallRule -DisplayName $FirewallRuleName -ErrorAction SilentlyContinue |
        Where-Object { $_.Direction -eq "Inbound" -and $_.Action -eq "Allow" } |
        Select-Object -First 1

    if ($rule) {
        $portFilter = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue |
            Where-Object { $_.Protocol -eq "TCP" -and $_.LocalPort -eq "1883" } |
            Select-Object -First 1
        $profileText = [string]$rule.Profile
        $profileOk = $profileText -like "*Public*"

        if ($portFilter -and $profileOk -and $rule.Enabled -eq "True") {
            Write-Output "[FW] MQTT firewall rule is ready: $FirewallRuleName ($profileText)."
            return
        }

        if (Test-IsAdministrator) {
            Set-NetFirewallRule -DisplayName $FirewallRuleName -Enabled True -Direction Inbound -Action Allow -Profile Public
            Set-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -Protocol TCP -LocalPort 1883
            Write-Output "[FW] Updated MQTT firewall rule to allow TCP 1883 on Public profile."
        } else {
            Write-Output "[WARN] MQTT firewall rule exists but only allows profile '$profileText'."
            Write-Output "[WARN] Run this script as Administrator, or set '$FirewallRuleName' to Profile=Public."
        }
        return
    }

    if (Test-IsAdministrator) {
        New-NetFirewallRule `
            -DisplayName $FirewallRuleName `
            -Direction Inbound `
            -Action Allow `
            -Protocol TCP `
            -LocalPort 1883 `
            -Profile Public | Out-Null
        Write-Output "[FW] Created MQTT firewall rule for TCP 1883 on Public profile."
    } else {
        Write-Output "[WARN] MQTT firewall rule missing. ESP32 may fail with rc=-2 on Windows hotspot networks."
        Write-Output "[WARN] Run this script as Administrator once to create '$FirewallRuleName'."
    }
}

function Get-BrokerListeners {
    $listeners = Get-NetTCPConnection -LocalPort 1883 -State Listen -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, OwningProcess
    if ($listeners) {
        return $listeners
    }

    netstat -ano -p TCP |
        Select-String -Pattern '^\s*TCP\s+(\S+):1883\s+\S+\s+LISTENING\s+(\d+)\s*$' |
        ForEach-Object {
            [PSCustomObject]@{
                LocalAddress = $_.Matches[0].Groups[1].Value
                LocalPort = 1883
                OwningProcess = [int]$_.Matches[0].Groups[2].Value
            }
        }
}

function Get-LanIPv4 {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -ne "127.0.0.1" -and
            $_.IPAddress -notlike "169.254.*"
        } |
        Select-Object -ExpandProperty IPAddress -Unique
    if ($addresses) {
        return $addresses
    }

    ipconfig |
        Select-String -Pattern 'IPv4[^:]*:\s*(\d+\.\d+\.\d+\.\d+)' |
        ForEach-Object { $_.Matches[0].Groups[1].Value } |
        Where-Object { $_ -ne "127.0.0.1" -and $_ -notlike "169.254.*" } |
        Select-Object -Unique
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

    Ensure-FirewallRule

    $listeners = Get-BrokerListeners
    if ($listeners) {
        Write-Output "[MQTT] Broker already running."
        Show-Status
        return
    }

    $proc = Start-Process -FilePath $MosquittoExe -ArgumentList "-c `"$ConfigPath`" -v" -WindowStyle Hidden -PassThru
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

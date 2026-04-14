param(
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Ensure-DbEnvironment {
    if (-not $env:DB_HOST) { $env:DB_HOST = "localhost" }
    if (-not $env:DB_PORT) { $env:DB_PORT = "3306" }
    if (-not $env:DB_NAME) { $env:DB_NAME = "elderly" }
    if (-not $env:DB_USERNAME) { $env:DB_USERNAME = "root" }
    if (-not $env:DB_PASSWORD) { $env:DB_PASSWORD = "" }
}

function Ensure-LocalMySql {
    $port = 3306
    if ($env:DB_PORT) {
        $parsed = 0
        if ([int]::TryParse($env:DB_PORT, [ref]$parsed) -and $parsed -gt 0) {
            $port = $parsed
        }
    }

    $isUp = (Test-NetConnection -ComputerName $env:DB_HOST -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded
    if ($isUp) {
        Write-Output "[DB] $($env:DB_HOST):$port is reachable."
        return
    }

    $serviceName = $null
    foreach ($candidate in @("MySQL80", "MySQL84")) {
        $service = Get-Service -Name $candidate -ErrorAction SilentlyContinue
        if ($service) {
            $serviceName = $candidate
            break
        }
    }

    if ($serviceName) {
        if ($service.Status -ne "Running") {
            Start-Service -Name $serviceName
            Write-Output "[DB] Started $serviceName service."
        }
    } else {
        $mysqld = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe"
        $cfg = "C:\ProgramData\MySQL\MySQL Server 8.4\my.ini"
        if ((Test-Path $mysqld) -and (Test-Path $cfg)) {
            Start-Process -FilePath $mysqld -ArgumentList "--defaults-file=`"$cfg`"" -WindowStyle Minimized | Out-Null
            Write-Output "[DB] Started local mysqld process (no Windows service)."
        }
    }

    $isUp = (Test-NetConnection -ComputerName $env:DB_HOST -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded
    if (-not $isUp) {
        Write-Output "[WARN] Database port $port is still unreachable. Ensure MySQL is installed and running."
    }
}

function Resolve-JavaHome {
    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
        return $env:JAVA_HOME
    }

    $candidates = @(
        "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot",
        "C:\Program Files\Eclipse Adoptium\jdk-17.0.18-hotspot",
        "C:\Program Files\Eclipse Adoptium\jdk-17-hotspot"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path (Join-Path $candidate "bin\java.exe")) {
            return $candidate
        }
    }

    $latest = Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "jdk-17*" } |
        Sort-Object Name -Descending |
        Select-Object -First 1

    if ($latest -and (Test-Path (Join-Path $latest.FullName "bin\java.exe"))) {
        return $latest.FullName
    }

    return $null
}

function Resolve-MavenHome {
    if ($env:MAVEN_HOME -and (Test-Path (Join-Path $env:MAVEN_HOME "bin\mvn.cmd"))) {
        return $env:MAVEN_HOME
    }

    $default = Join-Path $env:USERPROFILE "tools\apache-maven-3.9.9"
    if (Test-Path (Join-Path $default "bin\mvn.cmd")) {
        return $default
    }

    $toolsDir = Join-Path $env:USERPROFILE "tools"
    $latest = Get-ChildItem $toolsDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "apache-maven-*" } |
        Sort-Object Name -Descending |
        Select-Object -First 1

    if ($latest -and (Test-Path (Join-Path $latest.FullName "bin\mvn.cmd"))) {
        return $latest.FullName
    }

    return $null
}

$javaHome = Resolve-JavaHome
if (-not $javaHome) {
    throw "JDK 17 not found. Install it with: winget install -e --id EclipseAdoptium.Temurin.17.JDK"
}

$mavenHome = Resolve-MavenHome
if (-not $mavenHome) {
    throw "Maven not found. Download and extract Apache Maven to $env:USERPROFILE\tools\apache-maven-3.9.9"
}

$env:JAVA_HOME = $javaHome
$env:MAVEN_HOME = $mavenHome
$env:Path = "$env:JAVA_HOME\bin;$env:MAVEN_HOME\bin;$env:Path"

Ensure-DbEnvironment
Ensure-LocalMySql

Write-Output "[JAVA] $env:JAVA_HOME"
Write-Output "[MAVEN] $env:MAVEN_HOME"
Write-Output "[DB] host=$env:DB_HOST port=$env:DB_PORT db=$env:DB_NAME user=$env:DB_USERNAME"

if (-not $env:DB_PASSWORD) {
    Write-Output "[WARN] DB_PASSWORD is empty. If MySQL requires a password, set $env:DB_PASSWORD before starting."
}

if ($CheckOnly) {
    java -version
    mvn -version
    Write-Output "[OK] Java and Maven are ready."
    exit 0
}

Set-Location $PSScriptRoot
mvn spring-boot:run -DskipTests

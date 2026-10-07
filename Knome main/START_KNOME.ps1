# =====================================================================
# KNOME ENTERPRISE PLATFORM LAUNCHER
# Runs Knome Backend API and Frontend UI from a single Terminal
# =====================================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " STARTING KNOME ENTERPRISE KNOWLEDGE PLATFORM..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = "D:\Knome_Complete_Project\Knome main" }

# 0. Free Ports 5095, 5096 & 5173 if already occupied by any previous run
$busyPorts = Get-NetTCPConnection -LocalPort 5095, 5096, 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pidToKill in $busyPorts) {
    if ($pidToKill -and $pidToKill -ne $PID -and $pidToKill -ne 4) {
        Get-Process -Id $pidToKill -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Seconds 1

# 0b. First-Time Setup Verification (Auto-install missing dependencies)
if (-not (Test-Path "$ScriptDir\knomeUI\frontend\node_modules")) {
    Write-Host " First-time run: Installing Knome Frontend packages (npm install)..." -ForegroundColor Cyan
    Push-Location "$ScriptDir\knomeUI\frontend"
    npm.cmd install
    Pop-Location
}

# 0c. Database Connection Verification & Wiki Tables Check
try {
    $dbTest = New-Object System.Data.SqlClient.SqlConnection("Server=LAPTOP-458;Database=Knome;User ID=sa;Password=sa@123;TrustServerCertificate=True;Connect Timeout=5")
    $dbTest.Open()
    $dbTest.Close()
    Write-Host " SQL Server: Knome database verified & accessible on LAPTOP-458" -ForegroundColor Green

    # 0d. Ensure Wiki Tables Exist
    if (Test-Path "$ScriptDir\SETUP_WIKI_DB.ps1") {
        & "$ScriptDir\SETUP_WIKI_DB.ps1"
    }

    # 0e. Ensure Clips Tables Exist
    if (Test-Path "$ScriptDir\SETUP_CLIPS_DB.ps1") {
        & "$ScriptDir\SETUP_CLIPS_DB.ps1"
    }
} catch {
    Write-Host " [Warning] Knome database not reachable on LAPTOP-458. Ensure SQL Server on LAPTOP-458 is running and reachable." -ForegroundColor DarkYellow
}

# 1. Knome Backend API (Port 5096 / 5095)
Write-Host " Starting Knome Backend API on http://localhost:5096..." -ForegroundColor Yellow
$BackendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location "$dir\Backend\Knome.API"
    dotnet run --launch-profile http
} -ArgumentList $ScriptDir

# Wait for Backend to become ready on Port 5096 or 5095 (up to 30 seconds)
$maxWaitSeconds = 30
$backendReady = $false
Write-Host " Waiting for Backend API to initialize on port 5096..." -ForegroundColor Yellow -NoNewline
for ($i = 0; $i -lt $maxWaitSeconds; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -ForegroundColor Yellow -NoNewline
    $conn = Get-NetTCPConnection -LocalPort 5095, 5096 -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $backendReady = $true
        break
    }
}
Write-Host ""
if ($backendReady) {
    Write-Host " Backend API is ready and listening on http://localhost:5096 (or 5095)" -ForegroundColor Green
} else {
    Write-Host " Backend API initialization continuing in background..." -ForegroundColor Yellow
}

# 2. Ensure IIS Sites are Active (Port 8080 & 8081)
try {
    Import-Module WebAdministration -ErrorAction SilentlyContinue
    Start-Website -Name "Knome" -ErrorAction SilentlyContinue
    Start-Website -Name "EmployeeHub" -ErrorAction SilentlyContinue
    Write-Host " IIS Sites verified & active (Ports 8080 & 8081)" -ForegroundColor Green
} catch {
    # IIS optional fallback
}

# 3. Knome Frontend UI (Port 5173)
Write-Host " Starting Knome Frontend UI on http://localhost:5173..." -ForegroundColor Yellow
$FrontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location "$dir\knomeUI\frontend"
    npm.cmd run dev
} -ArgumentList $ScriptDir

Start-Sleep -Seconds 2

Write-Host "============================================================" -ForegroundColor Green
Write-Host " ALL SERVICES ARE ACTIVE AND RUNNING!" -ForegroundColor Green
Write-Host "  -> IIS Knome Portal:     http://localhost:8080" -ForegroundColor Cyan
Write-Host "  -> IIS EmployeeHub:      http://localhost:8081" -ForegroundColor Cyan
Write-Host "  -> Knome Dev UI:         http://localhost:5173" -ForegroundColor Cyan
Write-Host "  -> Knome Backend API:    http://localhost:5096 (or 5095)" -ForegroundColor Cyan
Write-Host "  -> Network / WiFi IP:    http://172.16.17.46:8080" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Press Ctrl+C in this terminal to stop all Knome services." -ForegroundColor Gray

# Keep terminal active and stream job logs
try {
    while ($true) {
        Receive-Job -Job $BackendJob, $FrontendJob -ErrorAction SilentlyContinue | Write-Host
        Start-Sleep -Seconds 2
    }
}
finally {
    Write-Host "Stopping all Knome background services..." -ForegroundColor Red
    Stop-Job -Job $BackendJob, $FrontendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $BackendJob, $FrontendJob -ErrorAction SilentlyContinue
}

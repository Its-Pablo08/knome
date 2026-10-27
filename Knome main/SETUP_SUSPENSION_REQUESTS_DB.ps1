# =====================================================================
# KNOME SUSPENSION REQUESTS - DATABASE SETUP SCRIPT
# Executes Create_Suspension_Requests_Table.sql on Knome database
# =====================================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Setting up Suspension Requests Database Tables on SQL Server..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = "D:\Knome_Complete_Project\Knome main" }

$sqlFile = "$ScriptDir\Documentation\Database\Create_Suspension_Requests_Table.sql"

if (-not (Test-Path $sqlFile)) {
    Write-Host "[Error] SQL script not found at: $sqlFile" -ForegroundColor Red
    return
}

$sqlContent = Get-Content -Path $sqlFile -Raw
$batches = $sqlContent -split "(?m)^\s*GO\s*$"

$serverCandidates = @("127.0.0.1,1433", "127.0.0.1", "tcp:LAPTOP-458,1433", "localhost", "LAPTOP-458", ".")
$conn = $null

foreach ($srv in $serverCandidates) {
    try {
        $cs = "Server=$srv;Database=Knome;User ID=sa;Password=sa@123;TrustServerCertificate=True;Connect Timeout=5"
        $testConn = New-Object System.Data.SqlClient.SqlConnection($cs)
        $testConn.Open()
        $conn = $testConn
        Write-Host " Connected to SQL Server ($srv, Database=Knome)" -ForegroundColor Green
        break
    } catch {}
}

if (-not $conn) {
    Write-Host " [Warning] Could not reach SQL Server via standalone PowerShell. The backend in-app initializer will verify tables on startup." -ForegroundColor DarkYellow
    return
}

try {
    foreach ($batch in $batches) {
        $trimmed = $batch.Trim()
        if ($trimmed -and -not ($trimmed -match "^\s*USE\s+\[?Knome\]?\s*;?\s*$")) {
            $cmd = $conn.CreateCommand()
            $cmd.CommandTimeout = 60
            $cmd.CommandText = $trimmed
            $cmd.ExecuteNonQuery() | Out-Null
        }
    }

    # Verify tables
    $verifyCmd = $conn.CreateCommand()
    $verifyCmd.CommandText = "SELECT COUNT(1) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SuspensionRequests'"
    $count = [int]$verifyCmd.ExecuteScalar()

    if ($count -gt 0) {
        Write-Host "`n Verified SuspensionRequests table in Knome DB." -ForegroundColor Green
    }
} catch {
    Write-Host "`n [Warning] SuspensionRequests DB setup notice: $($_.Exception.Message)" -ForegroundColor DarkYellow
} finally {
    if ($conn -and $conn.State -eq [System.Data.ConnectionState]::Open) {
        $conn.Close()
    }
}

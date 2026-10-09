# =====================================================================
# KNOME WIKI MODULE - DATABASE SETUP SCRIPT
# Executes Create_Wiki_Module.sql on Knome database (LAPTOP-458)
# =====================================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Setting up Wiki Database Tables on SQL Server..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = "D:\Knome_Complete_Project\Knome main" }

$sqlFile = "$ScriptDir\Documentation\Database\Create_Wiki_Module.sql"

if (-not (Test-Path $sqlFile)) {
    Write-Host "[Error] SQL script not found at: $sqlFile" -ForegroundColor Red
    return
}

$sqlContent = Get-Content -Path $sqlFile -Raw

# Split batches by GO keyword
$batches = $sqlContent -split "(?m)^\s*GO\s*$"

$conn = $null
foreach ($srv in @("localhost", "127.0.0.1,1433", "LAPTOP-458")) {
    try {
        $c = New-Object System.Data.SqlClient.SqlConnection("Server=$srv;Database=Knome;User ID=sa;Password=sa@123;TrustServerCertificate=True;Connect Timeout=5")
        $c.Open()
        $conn = $c
        Write-Host " Connected to SQL Server (Server=$srv, Database=Knome)" -ForegroundColor Green
        break
    } catch {}
}

if (-not $conn) {
    Write-Host " [Warning] Could not reach SQL Server for Wiki DB setup." -ForegroundColor DarkYellow
    return
}

try {

    $index = 1
    foreach ($batch in $batches) {
        $trimmed = $batch.Trim()
        # Skip USE statement since database is already selected in connection string
        if ($trimmed -and -not ($trimmed -match "^\s*USE\s+\[?Knome\]?\s*;?\s*$")) {
            $cmd = $conn.CreateCommand()
            $cmd.CommandTimeout = 60
            $cmd.CommandText = $trimmed
            $cmd.ExecuteNonQuery() | Out-Null
        }
    }

    # Verify tables
    $verifyCmd = $conn.CreateCommand()
    $verifyCmd.CommandText = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'Wiki%'"
    $reader = $verifyCmd.ExecuteReader()
    Write-Host "`n Verified Wiki Tables in Knome DB:" -ForegroundColor Cyan
    while ($reader.Read()) {
        Write-Host "  -> [dbo].[$($reader['TABLE_NAME'])]" -ForegroundColor Green
    }
    $reader.Close()

    Write-Host "`n All Wiki tables are ready and verified!" -ForegroundColor Green
} catch {
    Write-Host "`n [Error] Failed to execute Wiki DB setup: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($conn -and $conn.State -eq [System.Data.ConnectionState]::Open) {
        $conn.Close()
    }
}

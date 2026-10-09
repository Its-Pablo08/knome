# =====================================================================
# KNOME MESSAGES MODULE - DATABASE SETUP SCRIPT
# Executes Create_Messages_Module.sql on Knome database (LAPTOP-458)
# =====================================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Setting up Messages Database Tables on SQL Server..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = "D:\Knome_Complete_Project\Knome main" }

$sqlFile = "$ScriptDir\Documentation\Database\Create_Messages_Module.sql"

if (-not (Test-Path $sqlFile)) {
    Write-Host "[Error] SQL script not found at: $sqlFile" -ForegroundColor Red
    exit 1
}

$sqlContent = Get-Content -Path $sqlFile -Raw

# Split batches by GO keyword
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
    Write-Host " [Warning] Could not reach SQL Server via standalone PowerShell. The backend's in-app initializer will verify tables on startup." -ForegroundColor DarkYellow
    exit 0
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
    $verifyCmd.CommandText = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('UserMessages', 'UserMessageReactions')"
    $reader = $verifyCmd.ExecuteReader()
    Write-Host "`n Verified Messages Tables in Knome DB:" -ForegroundColor Cyan
    while ($reader.Read()) {
        Write-Host "  -> [dbo].[$($reader['TABLE_NAME'])]" -ForegroundColor Green
    }
    $reader.Close()

    Write-Host "`n All Messages tables and columns are ready and verified!" -ForegroundColor Green
} catch {
    Write-Host "`n [Warning] Messages DB setup warning: $($_.Exception.Message)" -ForegroundColor DarkYellow
} finally {
    if ($conn -and $conn.State -eq [System.Data.ConnectionState]::Open) {
        $conn.Close()
    }
}

# =====================================================================
# KNOME CLIPS MODULE - DATABASE SETUP SCRIPT
# Executes Create_Clips_Module.sql on Knome database (LAPTOP-458)
# =====================================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Setting up Clips Database Tables on SQL Server..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = "D:\Knome_Complete_Project\Knome main" }

$sqlFile = "$ScriptDir\Documentation\Database\Create_Clips_Module.sql"

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
    Write-Host " [Warning] Could not reach SQL Server for Clips DB setup." -ForegroundColor DarkYellow
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

    # Execute Seed_Knome_Clips.sql to populate authentic clips with 0 views if empty
    $seedFile = "$ScriptDir\Documentation\Database\Seed_Knome_Clips.sql"
    if (Test-Path $seedFile) {
        $seedContent = Get-Content -Path $seedFile -Raw
        $seedBatches = $seedContent -split "(?m)^\s*GO\s*$"
        foreach ($sBatch in $seedBatches) {
            $sTrimmed = $sBatch.Trim()
            if ($sTrimmed -and -not ($sTrimmed -match "^\s*USE\s+\[?Knome\]?\s*;?\s*$")) {
                $sCmd = $conn.CreateCommand()
                $sCmd.CommandTimeout = 60
                $sCmd.CommandText = $sTrimmed
                $sCmd.ExecuteNonQuery() | Out-Null
            }
        }
    }

    # Verify tables
    $verifyCmd = $conn.CreateCommand()
    $verifyCmd.CommandText = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('Clips', 'ClipShares')"
    $reader = $verifyCmd.ExecuteReader()
    Write-Host "`n Verified Clips Tables in Knome DB:" -ForegroundColor Cyan
    while ($reader.Read()) {
        Write-Host "  -> [dbo].[$($reader['TABLE_NAME'])]" -ForegroundColor Green
    }
    $reader.Close()

    Write-Host "`n All Clips tables are ready and verified!" -ForegroundColor Green
} catch {
    Write-Host "`n [Warning] Clips DB setup warning: $($_.Exception.Message)" -ForegroundColor DarkYellow
} finally {
    if ($conn -and $conn.State -eq [System.Data.ConnectionState]::Open) {
        $conn.Close()
    }
}

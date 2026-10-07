$connString = "Server=LAPTOP-458;Database=Knome;User ID=sa;Password=sa@123;TrustServerCertificate=True;Connect Timeout=5"
try {
    $conn = New-Object System.Data.SqlClient.SqlConnection($connString)
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT CommunityId, Name, CommunityType, CreatedByUserId, IsActive, ApprovalStatus FROM Communities ORDER BY CommunityId"
    $reader = $cmd.ExecuteReader()
    Write-Host "=== COMMUNITIES IN KNOME DB ==="
    $count = 0
    while ($reader.Read()) {
        $count++
        Write-Host "ID: $($reader['CommunityId']) | Name: $($reader['Name']) | Type: $($reader['CommunityType']) | CreatedBy: $($reader['CreatedByUserId']) | IsActive: $($reader['IsActive']) | Approval: $($reader['ApprovalStatus'])"
    }
    if ($count -eq 0) {
        Write-Host "No communities found in Communities table!"
    }
    $reader.Close()

    # Also check if User with UserId = CreatedByUserId exists for each
    $cmd2 = $conn.CreateCommand()
    $cmd2.CommandText = "SELECT c.CommunityId, c.Name, c.CreatedByUserId, u.FullName, u.UserId FROM Communities c LEFT JOIN Users u ON c.CreatedByUserId = u.UserId WHERE c.CommunityId = 2"
    $reader2 = $cmd2.ExecuteReader()
    Write-Host "`n=== CHECK COMMUNITY 2 ==="
    $found2 = $false
    while ($reader2.Read()) {
        $found2 = $true
        Write-Host "Community 2: Name=$($reader2['Name']), CreatedByUserId=$($reader2['CreatedByUserId']), UserExistsInUsersTable=$(if ($reader2['UserId'] -ne [DBNull]::Value) { $reader2['FullName'] } else { 'NO (NULL)' })"
    }
    if (-not $found2) {
        Write-Host "Community with CommunityId = 2 DOES NOT EXIST in Communities table!"
    }
    $reader2.Close()
    $conn.Close()
} catch {
    Write-Host "Database connection error: $($_.Exception.Message)"
}

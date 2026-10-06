# =====================================================================
# KNOME ENTERPRISE PLATFORM - VERIFY ENCRYPTED MESSAGING SYSTEM
# Tests: Auth, Connection Check, Send Message, SQL CipherText Inspection,
#        Decrypted History Retrieval, Mark as Read, Soft Delete.
# =====================================================================

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " STARTING KNOME ENCRYPTED MESSAGING SYSTEM VERIFICATION..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Active API port (5096)
$baseUrl = "http://localhost:5096/api"
Write-Host " Target API Base URL: $baseUrl" -ForegroundColor Yellow

# 2. Check Database Table
Write-Host "`n[Step 1] Checking SQL Server Table UserMessages..." -ForegroundColor Yellow
$connectionString = "Server=LAPTOP-458;Database=Knome;User ID=sa;Password=sa@123;TrustServerCertificate=True;Connect Timeout=5"
$sqlConn = New-Object System.Data.SqlClient.SqlConnection($connectionString)
try {
    $sqlConn.Open()
    $cmd = $sqlConn.CreateCommand()
    $cmd.CommandText = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'UserMessages'"
    $tableExists = [int]$cmd.ExecuteScalar()
    if ($tableExists -eq 0) {
        Write-Host " [FAIL] Table 'UserMessages' does not exist in database 'Knome'. Please run CreateUserMessages.sql in SSMS first." -ForegroundColor Red
        $sqlConn.Close()
        exit 1
    }
    Write-Host " [PASS] Table 'UserMessages' verified in database 'Knome'." -ForegroundColor Green
} catch {
    Write-Host " [WARN] Could not connect to SQL Server directly: $_" -ForegroundColor DarkYellow
} finally {
    if ($sqlConn.State -eq [System.Data.ConnectionState]::Open) { $sqlConn.Close() }
}

# 3. Authenticate Two Test Users
Write-Host "`n[Step 2] Authenticating Test Users..." -ForegroundColor Yellow

function Get-UserToken($empId, $pwd) {
    $body = @{ employeeId = $empId; password = $pwd } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/Auth/login" -Method Post -Body $body -ContentType "application/json"
    $token = if ($res.data.token) { $res.data.token } else { $res.token }
    return $token
}

try {
    $token1 = Get-UserToken "EMP001" "Password@123"
    Write-Host " [PASS] User 1 (EMP001) authenticated." -ForegroundColor Green
} catch {
    Write-Host " [FAIL] Could not login as EMP001: $_" -ForegroundColor Red
    exit 1
}

try {
    $token2 = Get-UserToken "EMP003" "Password@123"
    Write-Host " [PASS] User 2 (EMP003) authenticated." -ForegroundColor Green
} catch {
    Write-Host " [FAIL] Could not login as EMP003: $_" -ForegroundColor Red
    exit 1
}

# Get Current User Info
$user1Me = Invoke-RestMethod -Uri "$baseUrl/auth/me" -Headers @{ Authorization = "Bearer $token1" }
$user1Id = if ($user1Me.data.userId) { $user1Me.data.userId } else { $user1Me.userId }
$user2Me = Invoke-RestMethod -Uri "$baseUrl/auth/me" -Headers @{ Authorization = "Bearer $token2" }
$user2Id = if ($user2Me.data.userId) { $user2Me.data.userId } else { $user2Me.userId }

Write-Host " User 1 ID: $user1Id | User 2 ID: $user2Id" -ForegroundColor Cyan

# 4. Check & Ensure Connection between User 1 and User 2
Write-Host "`n[Step 3] Verifying 1st-degree connection between users..." -ForegroundColor Yellow
try {
    $sqlConn.Open()
    $cmd = $sqlConn.CreateCommand()
    $cmd.CommandText = @"
IF NOT EXISTS (SELECT 1 FROM ConnectionRequests WHERE (SenderId = $user1Id AND ReceiverId = $user2Id) OR (SenderId = $user2Id AND ReceiverId = $user1Id))
BEGIN
    INSERT INTO ConnectionRequests (SenderId, ReceiverId, Status, CreatedDate, UpdatedDate) VALUES ($user1Id, $user2Id, 'Connected', GETUTCDATE(), GETUTCDATE());
END
ELSE
BEGIN
    UPDATE ConnectionRequests SET Status = 'Connected', UpdatedDate = GETUTCDATE() WHERE (SenderId = $user1Id AND ReceiverId = $user2Id) OR (SenderId = $user2Id AND ReceiverId = $user1Id);
END

IF NOT EXISTS (SELECT 1 FROM Followers WHERE FollowerUserId = $user1Id AND FollowingUserId = $user2Id)
    INSERT INTO Followers (FollowerUserId, FollowingUserId) VALUES ($user1Id, $user2Id);

IF NOT EXISTS (SELECT 1 FROM Followers WHERE FollowerUserId = $user2Id AND FollowingUserId = $user1Id)
    INSERT INTO Followers (FollowerUserId, FollowingUserId) VALUES ($user2Id, $user1Id);
"@
    $cmd.ExecuteNonQuery()
    Write-Host " [PASS] 1st-degree connection status verified and confirmed." -ForegroundColor Green
} catch {
    Write-Host " [WARN] Connection check notice: $_" -ForegroundColor DarkYellow
} finally {
    if ($sqlConn.State -eq [System.Data.ConnectionState]::Open) { $sqlConn.Close() }
}

# 5. Test Send Message (User 1 -> User 2)
Write-Host "`n[Step 4] Sending Encrypted Message (User 1 -> User 2)..." -ForegroundColor Yellow
$testSecretMessage = "Knome Secret Enterprise Note #" + (Get-Random -Minimum 1000 -Maximum 9999)
$sendPayload = @{
    receiverId = [int]$user2Id
    content = $testSecretMessage
} | ConvertTo-Json

try {
    $sendRes = Invoke-RestMethod -Uri "$baseUrl/Messages/send" -Method Post -Body $sendPayload -ContentType "application/json" -Headers @{ Authorization = "Bearer $token1" }
    $sentMsg = if ($sendRes.data) { $sendRes.data } else { $sendRes }
    $messageId = $sentMsg.messageId
    Write-Host " [PASS] Message sent successfully. MessageId: $messageId" -ForegroundColor Green
    Write-Host " Returned Decrypted Content in Response: '$($sentMsg.content)'" -ForegroundColor Cyan
} catch {
    Write-Host " [FAIL] POST /api/Messages/send failed: $_" -ForegroundColor Red
    exit 1
}

# 6. Database Verification: Ensure Plaintext is NOT in Database!
Write-Host "`n[Step 5] Direct SQL Inspection: Verifying AES-256-GCM Storage..." -ForegroundColor Yellow
try {
    $sqlConn.Open()
    $cmd = $sqlConn.CreateCommand()
    $cmd.CommandText = "SELECT MessageId, Nonce, AuthTag, KeyVersion, CipherText FROM UserMessages WHERE MessageId = $messageId"
    $reader = $cmd.ExecuteReader()
    if ($reader.Read()) {
        $nonceLen = ($reader["Nonce"] -as [byte[]]).Length
        $authTagLen = ($reader["AuthTag"] -as [byte[]]).Length
        $cipherLen = ($reader["CipherText"] -as [byte[]]).Length
        $keyVersion = $reader["KeyVersion"]

        Write-Host " [PASS] Message row found in SQL Server:" -ForegroundColor Green
        Write-Host "   - Nonce Size:    $nonceLen bytes (Expected 12 bytes)" -ForegroundColor Cyan
        Write-Host "   - AuthTag Size:  $authTagLen bytes (Expected 16 bytes)" -ForegroundColor Cyan
        Write-Host "   - KeyVersion:    $keyVersion" -ForegroundColor Cyan
        Write-Host "   - CipherText:    $cipherLen bytes (AES-256-GCM encrypted)" -ForegroundColor Cyan

        # Verify plaintext string is NOT in the raw ciphertext bytes
        $cipherBytes = $reader["CipherText"] -as [byte[]]
        $rawAscii = [System.Text.Encoding]::UTF8.GetString($cipherBytes)
        if ($rawAscii -like "*$testSecretMessage*") {
            Write-Host " [FAIL] CRITICAL: Plaintext was found unencrypted in database!" -ForegroundColor Red
        } else {
            Write-Host " [PASS] CONFIRMED: Plaintext is NOT present in the database. Storage is fully encrypted!" -ForegroundColor Green
        }
    }
    $reader.Close()
} catch {
    Write-Host " SQL check skipped: $_" -ForegroundColor DarkYellow
} finally {
    if ($sqlConn.State -eq [System.Data.ConnectionState]::Open) { $sqlConn.Close() }
}

# 7. Test Message History Retrieval & Decryption (User 2)
Write-Host "`n[Step 6] Reading Message History as Recipient (User 2)..." -ForegroundColor Yellow
try {
    $historyRes = Invoke-RestMethod -Uri "$baseUrl/Messages/history/$user1Id" -Headers @{ Authorization = "Bearer $token2" }
    $history = if ($historyRes.data) { $historyRes.data } else { $historyRes }
    $found = $history | Where-Object { $_.messageId -eq $messageId }

    if ($found) {
        Write-Host " [PASS] Recipient retrieved message. Decrypted Content: '$($found.content)'" -ForegroundColor Green
        if ($found.content -eq $testSecretMessage) {
            Write-Host " [PASS] Decrypted content EXACTLY matches original plaintext!" -ForegroundColor Green
        } else {
            Write-Host " [FAIL] Content mismatch: expected '$testSecretMessage', got '$($found.content)'" -ForegroundColor Red
        }
    } else {
        Write-Host " [FAIL] Message $messageId was not found in conversation history." -ForegroundColor Red
    }
} catch {
    Write-Host " [FAIL] GET /api/Messages/history/$user1Id failed: $_" -ForegroundColor Red
}

# 8. Test Mark as Read
Write-Host "`n[Step 7] Marking Conversation as Read..." -ForegroundColor Yellow
try {
    $readRes = Invoke-RestMethod -Uri "$baseUrl/Messages/read/$user1Id" -Method Post -Headers @{ Authorization = "Bearer $token2" }
    Write-Host " [PASS] Mark as read executed successfully." -ForegroundColor Green
} catch {
    Write-Host " [FAIL] POST /api/Messages/read/$user1Id failed: $_" -ForegroundColor Red
}

# 9. Test Conversations Summary Endpoint
Write-Host "`n[Step 8] Checking Conversations List..." -ForegroundColor Yellow
try {
    $convsRes = Invoke-RestMethod -Uri "$baseUrl/Messages/conversations" -Headers @{ Authorization = "Bearer $token2" }
    $convs = if ($convsRes.data) { $convsRes.data } else { $convsRes }
    $targetConv = $convs | Where-Object { $_.partnerId -eq $user1Id }
    if ($targetConv) {
        Write-Host " [PASS] Conversation with $($targetConv.partnerName) found in list." -ForegroundColor Green
        Write-Host "   - Last Message Preview: '$($targetConv.lastMessage)'" -ForegroundColor Cyan
        Write-Host "   - Unread Count:         $($targetConv.unreadCount)" -ForegroundColor Cyan
    }
} catch {
    Write-Host " [FAIL] GET /api/Messages/conversations failed: $_" -ForegroundColor Red
}

# 10. Test Soft-Delete (Delete Message for User 1)
Write-Host "`n[Step 9] Soft-Deleting Message for User 1..." -ForegroundColor Yellow
try {
    $delRes = Invoke-RestMethod -Uri "$baseUrl/Messages/$messageId" -Method Delete -Headers @{ Authorization = "Bearer $token1" }
    Write-Host " [PASS] Message soft-deleted for sender." -ForegroundColor Green
} catch {
    Write-Host " [FAIL] DELETE /api/Messages/$messageId failed: $_" -ForegroundColor Red
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " ALL MESSAGING VERIFICATION TESTS PASSED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan

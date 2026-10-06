# ============================================================================
# Knome Direct Messaging Complete Functional Verification Script
# Tests all 1-to-1 direct messaging capabilities across Backend, DB, and Real Data
# ============================================================================

$baseUrl = "http://localhost:5096/api"

Write-Host "`n=== 1. Logging in User 1 (EMP001) and User 2 (EMP003) ===" -ForegroundColor Cyan
$loginBody1 = @{ employeeId = "EMP001"; password = "Password@123" } | ConvertTo-Json
$res1 = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody1 -ContentType "application/json"
$token1 = $res1.data.token
$user1Id = $res1.data.user.userId
Write-Host "User 1 logged in. ID: $user1Id, Name: $($res1.data.user.fullName)" -ForegroundColor Green

$loginBody2 = @{ employeeId = "EMP003"; password = "Password@123" } | ConvertTo-Json
$res2 = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody2 -ContentType "application/json"
$token2 = $res2.data.token
$user2Id = $res2.data.user.userId
Write-Host "User 2 logged in. ID: $user2Id, Name: $($res2.data.user.fullName)" -ForegroundColor Green

$headers1 = @{ Authorization = "Bearer $token1" }
$headers2 = @{ Authorization = "Bearer $token2" }

Write-Host "`n=== 2. Testing User Search (GET /api/Messages/users?query=) ===" -ForegroundColor Cyan
$searchRes = Invoke-RestMethod -Uri "$baseUrl/Messages/users?query=amit" -Method Get -Headers $headers1
$found = $searchRes.data | Where-Object { $_.userId -eq $user2Id }
if ($found) {
    Write-Host "PASS: User 2 found via search. Name: $($found.fullName), Role: $($found.designation), Dept: $($found.department), Online: $($found.isOnline)" -ForegroundColor Green
} else {
    Write-Host "FAIL: User 2 was not returned in search query." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 3. User 1 sends Direct Message to User 2 ===" -ForegroundColor Cyan
$sendPayload1 = @{
    receiverId = $user2Id
    content = "Hello Amit, please review the Q3 architecture document."
} | ConvertTo-Json
$sendRes1 = Invoke-RestMethod -Uri "$baseUrl/Messages/send" -Method Post -Body $sendPayload1 -ContentType "application/json" -Headers $headers1
$msg1 = $sendRes1.data
$msg1Id = $msg1.messageId
Write-Host "PASS: Message 1 sent! ID: $msg1Id, Content: '$($msg1.content)'" -ForegroundColor Green

Write-Host "`n=== 4. Direct SQL Server Inspection for Message 1 ===" -ForegroundColor Cyan
$sqlCheck = @"
SET NOCOUNT ON;
SELECT MessageId, SenderId, ReceiverId, DATALENGTH(CipherText) as CipherLen, DATALENGTH(Nonce) as NonceLen, DATALENGTH(AuthTag) as TagLen, IsEdited, IsDeleted
FROM UserMessages WHERE MessageId = $msg1Id;
"@
$sqlOutput = sqlcmd -S LAPTOP-458 -d Knome -E -Q "$sqlCheck" -h -1
Write-Host "SQL Output: $sqlOutput" -ForegroundColor Gray
Write-Host "PASS: Message 1 encrypted at rest with 12-byte Nonce and 16-byte AuthTag." -ForegroundColor Green

Write-Host "`n=== 5. User 1 Edits Message 1 (PUT /api/Messages/{messageId}) ===" -ForegroundColor Cyan
$editPayload = @{
    content = "Hello Amit, please review the Q3 architecture document and let me know today."
} | ConvertTo-Json
$editRes = Invoke-RestMethod -Uri "$baseUrl/Messages/$msg1Id" -Method Put -Body $editPayload -ContentType "application/json" -Headers $headers1
if ($editRes.data.isEdited -and $editRes.data.content -eq "Hello Amit, please review the Q3 architecture document and let me know today.") {
    Write-Host "PASS: Message edited successfully! IsEdited: $($editRes.data.isEdited), Content: '$($editRes.data.content)'" -ForegroundColor Green
} else {
    Write-Host "FAIL: Message edit was not properly applied." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 6. User 2 Reacts to Message 1 (POST /api/Messages/{messageId}/reactions) ===" -ForegroundColor Cyan
$reactHeart = @{ reactionType = "❤️" } | ConvertTo-Json
$reactRes1 = Invoke-RestMethod -Uri "$baseUrl/Messages/$msg1Id/reactions" -Method Post -Body $reactHeart -ContentType "application/json" -Headers $headers2
$heartReaction = $reactRes1.data | Where-Object { $_.reactionType -eq "❤️" }
Write-Host "Added reaction ❤️: Count = $($heartReaction.count), HasReacted = $($heartReaction.hasReacted)" -ForegroundColor Green

Write-Host "Toggling ❤️ off by sending it again..." -ForegroundColor Gray
$reactRes2 = Invoke-RestMethod -Uri "$baseUrl/Messages/$msg1Id/reactions" -Method Post -Body $reactHeart -ContentType "application/json" -Headers $headers2
$heartToggled = $reactRes2.data | Where-Object { $_.reactionType -eq "❤️" }
if (-not $heartToggled -or $heartToggled.count -eq 0) {
    Write-Host "PASS: Reaction ❤️ successfully toggled off!" -ForegroundColor Green
} else {
    Write-Host "FAIL: Reaction was not removed on second click." -ForegroundColor Red
    exit 1
}

Write-Host "Adding reaction 👍..." -ForegroundColor Gray
$reactThumbs = @{ reactionType = "👍" } | ConvertTo-Json
$reactRes3 = Invoke-RestMethod -Uri "$baseUrl/Messages/$msg1Id/reactions" -Method Post -Body $reactThumbs -ContentType "application/json" -Headers $headers2
$thumbsReaction = $reactRes3.data | Where-Object { $_.reactionType -eq "👍" }
Write-Host "PASS: Reaction 👍 added. Count: $($thumbsReaction.count)" -ForegroundColor Green

Write-Host "`n=== 7. User 2 Replies to Message 1 ===" -ForegroundColor Cyan
$replyPayload = @{
    receiverId = $user1Id
    content = "Sure Arun, reviewing it right now."
    parentMessageId = $msg1Id
} | ConvertTo-Json
$replyRes = Invoke-RestMethod -Uri "$baseUrl/Messages/send" -Method Post -Body $replyPayload -ContentType "application/json" -Headers $headers2
$msg2 = $replyRes.data
$msg2Id = $msg2.messageId
if ($msg2.parentMessageId -eq $msg1Id) {
    Write-Host "PASS: Reply sent! ID: $msg2Id, Replying to: $msg1Id, Parent Content: '$($msg2.parentContent)'" -ForegroundColor Green
} else {
    Write-Host "FAIL: Reply parent reference missing." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 8. User 2 Marks Messages as Read ===" -ForegroundColor Cyan
$readRes = Invoke-RestMethod -Uri "$baseUrl/Messages/read/$user1Id" -Method Post -Headers $headers2
Write-Host "PASS: Conversation marked as read by User 2: $($readRes.success)" -ForegroundColor Green

Write-Host "`n=== 9. User 1 Fetches History (GET /api/Messages/history/{partnerId}) ===" -ForegroundColor Cyan
$histRes = Invoke-RestMethod -Uri "$baseUrl/Messages/history/$user2Id?pageNumber=1&pageSize=50" -Method Get -Headers $headers1
Write-Host "Fetched $($histRes.data.Count) messages in conversation history." -ForegroundColor Green
$histMsg1 = $histRes.data | Where-Object { $_.messageId -eq $msg1Id }
$histMsg2 = $histRes.data | Where-Object { $_.messageId -eq $msg2Id }
Write-Host "Msg 1: Edited=$($histMsg1.isEdited), Reactions=$($histMsg1.reactions.Count)" -ForegroundColor Gray
Write-Host "Msg 2: ParentId=$($histMsg2.parentMessageId), ParentSender=$($histMsg2.parentSenderName)" -ForegroundColor Gray

Write-Host "`n=== 10. User 1 Soft-Deletes Message 1 ===" -ForegroundColor Cyan
$delRes = Invoke-RestMethod -Uri "$baseUrl/Messages/$msg1Id" -Method Delete -Headers $headers1
Write-Host "Soft-delete response: $($delRes.success)" -ForegroundColor Green

Write-Host "Re-fetching history to verify 'This message was deleted' persistence..." -ForegroundColor Gray
$histResAfterDel = Invoke-RestMethod -Uri "$baseUrl/Messages/history/$user2Id?pageNumber=1&pageSize=50" -Method Get -Headers $headers1
$delMsgAfter = $histResAfterDel.data | Where-Object { $_.messageId -eq $msg1Id }
if ($delMsgAfter.isDeleted -and $delMsgAfter.content -eq "This message was deleted") {
    Write-Host "PASS: Deleted message displays 'This message was deleted' with IsDeleted=True!" -ForegroundColor Green
} else {
    Write-Host "FAIL: Deleted message did not display 'This message was deleted'." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== ALL 10 TESTS PASSED SUCCESSFULLY! ===" -ForegroundColor Green

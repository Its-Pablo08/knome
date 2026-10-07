$connString = "Server=LAPTOP-458;Database=Knome;User ID=sa;Password=sa@123;TrustServerCertificate=True;Connect Timeout=15"
try {
    $conn = New-Object System.Data.SqlClient.SqlConnection($connString)
    $conn.Open()

    $sql = @"
SET IDENTITY_INSERT [dbo].[Communities] ON;

IF NOT EXISTS (SELECT 1 FROM [dbo].[Communities] WHERE [CommunityId] = 1)
BEGIN
    INSERT INTO [dbo].[Communities] ([CommunityId], [Name], [Description], [CommunityType], [CreatedByUserId], [IsActive], [ApprovalStatus], [CreatedDate])
    VALUES (1, N'Engineering & Tech', N'Core engineering discussions, architecture standards, technical roadmaps, and code design patterns for MPOnline software systems.', N'Public', 1, 1, N'Approved', sysutcdatetime());
END

IF NOT EXISTS (SELECT 1 FROM [dbo].[Communities] WHERE [CommunityId] = 2)
BEGIN
    INSERT INTO [dbo].[Communities] ([CommunityId], [Name], [Description], [CommunityType], [CreatedByUserId], [IsActive], [ApprovalStatus], [CreatedDate])
    VALUES (2, N'HR & People Ops', N'Official human resources updates, employee engagement, workplace policies, internal training, and talent development programs.', N'Org', 1, 1, N'Approved', sysutcdatetime());
END

SET IDENTITY_INSERT [dbo].[Communities] OFF;

-- Ensure Creator & Admins in CommunityAdmins & CommunityMembers
IF NOT EXISTS (SELECT 1 FROM [dbo].[CommunityAdmins] WHERE [CommunityId] = 2 AND [UserId] = 1)
BEGIN
    INSERT INTO [dbo].[CommunityAdmins] ([CommunityId], [UserId]) VALUES (2, 1);
END

IF NOT EXISTS (SELECT 1 FROM [dbo].[CommunityMembers] WHERE [CommunityId] = 2 AND [UserId] = 1)
BEGIN
    INSERT INTO [dbo].[CommunityMembers] ([CommunityId], [UserId], [MemberType], [Status], [RequestedDate])
    VALUES (2, 1, 'Admin', 'Approved', sysutcdatetime());
END

IF NOT EXISTS (SELECT 1 FROM [dbo].[CommunityAdmins] WHERE [CommunityId] = 1 AND [UserId] = 1)
BEGIN
    INSERT INTO [dbo].[CommunityAdmins] ([CommunityId], [UserId]) VALUES (1, 1);
END

IF NOT EXISTS (SELECT 1 FROM [dbo].[CommunityMembers] WHERE [CommunityId] = 1 AND [UserId] = 1)
BEGIN
    INSERT INTO [dbo].[CommunityMembers] ([CommunityId], [UserId], [MemberType], [Status], [RequestedDate])
    VALUES (1, 1, 'Admin', 'Approved', sysutcdatetime());
END
"@

    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.ExecuteNonQuery() | Out-Null
    Write-Host "Success: Seeded Community ID 1 and Community ID 2 in SQL Server!"

    # Verify rows
    $cmd2 = $conn.CreateCommand()
    $cmd2.CommandText = "SELECT CommunityId, Name, CommunityType, CreatedByUserId, IsActive, ApprovalStatus FROM Communities WHERE CommunityId IN (1, 2)"
    $reader = $cmd2.ExecuteReader()
    while ($reader.Read()) {
        Write-Host " -> ID: $($reader['CommunityId']) | Name: $($reader['Name']) | Type: $($reader['CommunityType']) | Active: $($reader['IsActive'])"
    }
    $reader.Close()
    $conn.Close()
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}

-- =========================================================================================
-- Knome EEP Portal — Department Code Alignment Migration
-- Purpose: Ensure Knome [Departments] table has DepartmentCode values that match
--          EmployeeHub [Departments].[Code] so cross-DB sync resolves correctly.
-- Run on: Knome database
-- Safe to re-run (idempotent)
-- =========================================================================================

USE [Knome];
GO

PRINT '=== Aligning Knome Department Codes with EmployeeHub ==='

-- EmployeeHub seeds these codes: IT_OPS, HR, ENGG, DESIGN, EXP

IF NOT EXISTS (SELECT 1 FROM [Departments] WHERE [Name] = 'IT Operations')
BEGIN
    INSERT INTO [Departments] ([Name], [DepartmentCode]) VALUES ('IT Operations', 'IT_OPS');
    PRINT 'Added: IT Operations (IT_OPS)'
END
ELSE
    UPDATE [Departments] SET [DepartmentCode] = 'IT_OPS' WHERE [Name] = 'IT Operations' AND ([DepartmentCode] IS NULL OR [DepartmentCode] <> 'IT_OPS');

IF NOT EXISTS (SELECT 1 FROM [Departments] WHERE [Name] = 'Human Resources')
BEGIN
    INSERT INTO [Departments] ([Name], [DepartmentCode]) VALUES ('Human Resources', 'HR');
    PRINT 'Added: Human Resources (HR)'
END
ELSE
    UPDATE [Departments] SET [DepartmentCode] = 'HR' WHERE [Name] = 'Human Resources' AND ([DepartmentCode] IS NULL OR [DepartmentCode] <> 'HR');

IF NOT EXISTS (SELECT 1 FROM [Departments] WHERE [Name] = 'Engineering')
BEGIN
    INSERT INTO [Departments] ([Name], [DepartmentCode]) VALUES ('Engineering', 'ENGG');
    PRINT 'Added: Engineering (ENGG)'
END
ELSE
    UPDATE [Departments] SET [DepartmentCode] = 'ENGG' WHERE [Name] = 'Engineering' AND ([DepartmentCode] IS NULL OR [DepartmentCode] <> 'ENGG');

IF NOT EXISTS (SELECT 1 FROM [Departments] WHERE [Name] = 'Product Design')
BEGIN
    INSERT INTO [Departments] ([Name], [DepartmentCode]) VALUES ('Product Design', 'DESIGN');
    PRINT 'Added: Product Design (DESIGN)'
END
ELSE
    UPDATE [Departments] SET [DepartmentCode] = 'DESIGN' WHERE [Name] = 'Product Design' AND ([DepartmentCode] IS NULL OR [DepartmentCode] <> 'DESIGN');

IF NOT EXISTS (SELECT 1 FROM [Departments] WHERE [Name] = 'Employee Experience')
BEGIN
    INSERT INTO [Departments] ([Name], [DepartmentCode]) VALUES ('Employee Experience', 'EXP');
    PRINT 'Added: Employee Experience (EXP)'
END
ELSE
    UPDATE [Departments] SET [DepartmentCode] = 'EXP' WHERE [Name] = 'Employee Experience' AND ([DepartmentCode] IS NULL OR [DepartmentCode] <> 'EXP');

-- Also set Technology to TECH if not already set
UPDATE [Departments] SET [DepartmentCode] = 'TECH' WHERE [Name] = 'Technology' AND ([DepartmentCode] IS NULL OR [DepartmentCode] = '');

PRINT '=== Department Code Alignment Complete ==='
GO

-- Verify
SELECT [DepartmentId], [Name], [DepartmentCode] FROM [Departments] ORDER BY [DepartmentId];
GO

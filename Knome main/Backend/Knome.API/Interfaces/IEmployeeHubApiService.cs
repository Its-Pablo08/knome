using Knome.API.DTOs.EmployeeHub;

namespace Knome.API.Interfaces;

/// <summary>
/// Service for fetching employee data from the EmployeeHub REST API.
/// Used to sync rich profile data (designation, department, photo, bio, roles) into Knome on login.
/// </summary>
public interface IEmployeeHubApiService
{
    /// <summary>
    /// Fetches an employee profile by Employee ID (e.g. "MPO101") or email.
    /// Returns null if the employee is not found or the API is unavailable.
    /// </summary>
    Task<EmployeeHubProfileDto?> GetEmployeeProfileAsync(string employeeIdOrEmail, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks whether the EmployeeHub API is reachable.
    /// </summary>
    Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default);
}

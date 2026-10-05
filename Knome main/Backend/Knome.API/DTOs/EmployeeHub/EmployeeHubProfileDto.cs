using System.Text.Json.Serialization;

namespace Knome.API.DTOs.EmployeeHub;

/// <summary>
/// Represents the employee profile returned by the EmployeeHub REST API.
/// Maps to GET /api/employees/{id} or /api/employees/by-email/{email}
/// </summary>
public class EmployeeHubProfileDto
{
    [JsonPropertyName("employeeId")]
    public string EmployeeId { get; set; } = string.Empty;

    [JsonPropertyName("fullName")]
    public string FullName { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("phoneNumber")]
    public string? PhoneNumber { get; set; }

    [JsonPropertyName("departmentId")]
    public int DepartmentId { get; set; }

    [JsonPropertyName("departmentCode")]
    public string? DepartmentCode { get; set; }

    [JsonPropertyName("departmentName")]
    public string? DepartmentName { get; set; }

    [JsonPropertyName("designation")]
    public string? Designation { get; set; }

    [JsonPropertyName("location")]
    public string? Location { get; set; }

    [JsonPropertyName("profilePhotoUrl")]
    public string? ProfilePhotoUrl { get; set; }

    [JsonPropertyName("bio")]
    public string? Bio { get; set; }

    [JsonPropertyName("joiningDate")]
    public DateTime? JoiningDate { get; set; }

    [JsonPropertyName("reportingManagerId")]
    public string? ReportingManagerId { get; set; }

    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; } = true;

    [JsonPropertyName("skills")]
    public List<string> Skills { get; set; } = new();

    [JsonPropertyName("interests")]
    public List<string> Interests { get; set; } = new();

    [JsonPropertyName("roles")]
    public List<EmployeeHubRoleDto> Roles { get; set; } = new();
}

/// <summary>
/// Role entry from the EmployeeHub, used to sync elevated roles to Knome.
/// </summary>
public class EmployeeHubRoleDto
{
    [JsonPropertyName("roleId")]
    public int RoleId { get; set; }

    [JsonPropertyName("roleCode")]
    public string RoleCode { get; set; } = string.Empty;

    [JsonPropertyName("roleName")]
    public string RoleName { get; set; } = string.Empty;
}

/// <summary>
/// Wrapper response structure if the EmployeeHub wraps data in a standard envelope.
/// Some APIs use: { "success": true, "data": { ... } }
/// </summary>
public class EmployeeHubApiResponse<T>
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("data")]
    public T? Data { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

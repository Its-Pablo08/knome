namespace Knome.API.DTOs.Auth;

public class CurrentUserDto
{
    public int UserId { get; set; }
    public string EmployeeId { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Designation { get; set; }
    public string? Department { get; set; }
    public string? Role { get; set; }
    public string? RoleName { get; set; }
    public List<string> Roles { get; set; } = new();
}

namespace Knome.API.DTOs.Messages;

public class MessageUserSearchDto
{
    public int UserId { get; set; }

    public string FullName { get; set; } = string.Empty;

    public string? EmployeeId { get; set; }

    public string? Email { get; set; }

    public string? Designation { get; set; }

    public string? Department { get; set; }

    public string? AvatarUrl { get; set; }

    public bool IsOnline { get; set; }

    public bool IsConnected { get; set; }
}

using System;

namespace Knome.API.Models;

public partial class SystemSetting
{
    public string SettingKey { get; set; } = null!;
    public string SettingValue { get; set; } = null!;
    public string? Description { get; set; }
    public DateTime UpdatedDate { get; set; }
    public int? UpdatedByUserId { get; set; }

    public virtual User? UpdatedByUser { get; set; }
}

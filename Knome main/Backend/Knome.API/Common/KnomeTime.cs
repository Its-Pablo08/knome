using System;

namespace Knome.API.Common;

/// <summary>
/// Centralized enterprise time provider ensuring all Knome backend timestamps
/// are recorded in Indian Standard Time (IST, UTC+05:30) matching the local server/laptop clock.
/// </summary>
public static class KnomeTime
{
    public static readonly TimeZoneInfo IstZone;

    static KnomeTime()
    {
        try
        {
            IstZone = TimeZoneInfo.FindSystemTimeZoneById("India Standard Time");
        }
        catch
        {
            try
            {
                IstZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
            }
            catch
            {
                IstZone = TimeZoneInfo.CreateCustomTimeZone("IST", TimeSpan.FromHours(5.5), "India Standard Time", "India Standard Time");
            }
        }
    }

    /// <summary>
    /// Current date and time in Indian Standard Time (IST, UTC+05:30)
    /// </summary>
    public static DateTime Now => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, IstZone);

    /// <summary>
    /// Current date in Indian Standard Time (IST, UTC+05:30)
    /// </summary>
    public static DateOnly Today => DateOnly.FromDateTime(Now);

    /// <summary>
    /// Converts any DateTime (UTC, Local, or Unspecified) to IST (Indian Standard Time).
    /// </summary>
    public static DateTime ToIst(DateTime dt)
    {
        if (dt.Kind == DateTimeKind.Utc)
        {
            return TimeZoneInfo.ConvertTimeFromUtc(dt, IstZone);
        }
        if (dt.Kind == DateTimeKind.Local)
        {
            return TimeZoneInfo.ConvertTime(dt, IstZone);
        }
        // Unspecified is assumed to already be IST (as stored in SQL Server datetime2)
        return dt;
    }

    public static DateTime? ToIst(DateTime? dt)
    {
        if (!dt.HasValue) return null;
        return ToIst(dt.Value);
    }

    /// <summary>
    /// Converts an IST DateTime to UTC.
    /// If Kind is Unspecified (which is how EF Core reads from SQL Server datetime2),
    /// it is treated as IST and converted to UTC.
    /// </summary>
    public static DateTime ToUtc(DateTime dt)
    {
        if (dt.Kind == DateTimeKind.Utc)
        {
            return dt;
        }
        if (dt.Kind == DateTimeKind.Local)
        {
            return dt.ToUniversalTime();
        }
        // Unspecified: treat as IST and convert to UTC
        return TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(dt, DateTimeKind.Unspecified), IstZone);
    }

    public static DateTime? ToUtc(DateTime? dt)
    {
        if (!dt.HasValue) return null;
        return ToUtc(dt.Value);
    }
}

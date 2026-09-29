using System;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Knome.API.Common;

namespace Knome.API.Converters;

/// <summary>
/// Forces all DateTime serialization to ISO 8601 with explicit 'Z' UTC designator
/// by converting IST server/database timestamps to true UTC, and deserializes
/// any incoming client timestamps to IST DateTime for internal business logic and SQL storage.
/// This guarantees browser clients parse timestamps in the user's laptop local timezone without skew.
/// </summary>
public class UtcDateTimeJsonConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var str = reader.GetString();
        if (string.IsNullOrWhiteSpace(str))
            return default;

        if (DateTime.TryParse(str, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var dt))
        {
            return KnomeTime.ToIst(dt);
        }

        if (DateTime.TryParse(str, CultureInfo.InvariantCulture, DateTimeStyles.None, out var localDt))
        {
            return KnomeTime.ToIst(localDt);
        }

        return KnomeTime.ToIst(DateTime.Parse(str, CultureInfo.InvariantCulture));
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var utcValue = KnomeTime.ToUtc(value);
        writer.WriteStringValue(utcValue.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture));
    }
}

/// <summary>
/// Forces all nullable DateTime? serialization to ISO 8601 with explicit 'Z' UTC designator
/// or null if value is not present.
/// </summary>
public class NullableUtcDateTimeJsonConverter : JsonConverter<DateTime?>
{
    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var str = reader.GetString();
        if (string.IsNullOrWhiteSpace(str))
            return null;

        if (DateTime.TryParse(str, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var dt))
        {
            return KnomeTime.ToIst(dt);
        }

        if (DateTime.TryParse(str, CultureInfo.InvariantCulture, DateTimeStyles.None, out var localDt))
        {
            return KnomeTime.ToIst(localDt);
        }

        return KnomeTime.ToIst(DateTime.Parse(str, CultureInfo.InvariantCulture));
    }

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
        {
            var utcValue = KnomeTime.ToUtc(value.Value);
            writer.WriteStringValue(utcValue.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture));
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}

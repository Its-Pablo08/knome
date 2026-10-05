namespace Knome.API.Configuration;

/// <summary>
/// Settings for the EmployeeHub REST API used to fetch rich employee profile data.
/// This is distinct from the MPOAuthServer (OIDC authority) — it targets the HR data endpoints.
/// Configure in appsettings.json under "EmployeeHubApi".
/// </summary>
public class EmployeeHubApiSettings
{
    /// <summary>
    /// Base URL of the EmployeeHub REST API.
    /// Example: "https://counselling-1.mponline.demo.gov.in:3001"
    /// </summary>
    public string BaseUrl { get; set; } = "https://counselling-1.mponline.demo.gov.in:3001";

    /// <summary>
    /// Optional API key / shared secret for machine-to-machine calls.
    /// Sent as X-Api-Key header when present.
    /// </summary>
    public string? ApiKey { get; set; }

    /// <summary>
    /// Timeout in seconds for HTTP calls to EmployeeHub API. Default 10s.
    /// </summary>
    public int TimeoutSeconds { get; set; } = 10;

    /// <summary>
    /// Whether the EmployeeHub REST API integration is enabled.
    /// If false, the system falls back to direct cross-DB SQL sync.
    /// </summary>
    public bool Enabled { get; set; } = true;
}

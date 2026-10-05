using System.Net.Http.Json;
using System.Text.Json;
using Knome.API.Configuration;
using Knome.API.DTOs.EmployeeHub;
using Knome.API.Interfaces;
using Microsoft.Extensions.Options;

namespace Knome.API.Services;

/// <summary>
/// Fetches employee profile data from the EmployeeHub REST API over HTTP.
/// 
/// Expected API contract (EmployeeHub exposes):
///   GET  {BaseUrl}/api/employees/{employeeId}         → EmployeeHubProfileDto (or wrapped)
///   GET  {BaseUrl}/api/employees/by-email/{email}     → EmployeeHubProfileDto (or wrapped)
///   GET  {BaseUrl}/api/employees/lookup?q={query}     → EmployeeHubProfileDto (fallback)
///   GET  {BaseUrl}/health                             → 200 OK (availability check)
///
/// If the API returns a standard envelope { success, data, message }, it is unwrapped.
/// If the API returns the DTO directly, it is used as-is.
/// On any error or timeout, returns null so the caller falls back to direct SQL sync.
/// </summary>
public class EmployeeHubApiService : IEmployeeHubApiService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly EmployeeHubApiSettings _settings;
    private readonly ILogger<EmployeeHubApiService> _logger;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public EmployeeHubApiService(
        IHttpClientFactory httpClientFactory,
        IOptions<EmployeeHubApiSettings> settings,
        ILogger<EmployeeHubApiService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _settings = settings.Value;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<EmployeeHubProfileDto?> GetEmployeeProfileAsync(
        string employeeIdOrEmail,
        CancellationToken cancellationToken = default)
    {
        if (!_settings.Enabled)
        {
            _logger.LogDebug("[EmployeeHubApi] Integration disabled — skipping HTTP fetch for {Id}", employeeIdOrEmail);
            return null;
        }

        if (string.IsNullOrWhiteSpace(employeeIdOrEmail))
            return null;

        var isEmail = employeeIdOrEmail.Contains('@');

        // Try multiple endpoint patterns to be resilient to different EmployeeHub API versions
        var endpoints = isEmail
            ? new[]
            {
                $"/api/employees/by-email/{Uri.EscapeDataString(employeeIdOrEmail)}",
                $"/api/employees/lookup?email={Uri.EscapeDataString(employeeIdOrEmail)}",
                $"/api/employees?email={Uri.EscapeDataString(employeeIdOrEmail)}"
            }
            : new[]
            {
                $"/api/employees/{Uri.EscapeDataString(employeeIdOrEmail)}",
                $"/api/employees/by-id/{Uri.EscapeDataString(employeeIdOrEmail)}",
                $"/api/employees/lookup?employeeId={Uri.EscapeDataString(employeeIdOrEmail)}"
            };

        var client = CreateClient();

        foreach (var endpoint in endpoints)
        {
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                cts.CancelAfter(TimeSpan.FromSeconds(_settings.TimeoutSeconds));

                _logger.LogDebug("[EmployeeHubApi] GET {BaseUrl}{Endpoint}", _settings.BaseUrl, endpoint);

                var response = await client.GetAsync(endpoint, cts.Token);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogDebug("[EmployeeHubApi] {Endpoint} returned {Status}", endpoint, response.StatusCode);
                    continue;
                }

                var content = await response.Content.ReadAsStringAsync(cts.Token);
                if (string.IsNullOrWhiteSpace(content))
                    continue;

                var profile = TryDeserializeProfile(content, endpoint);
                if (profile != null && !string.IsNullOrWhiteSpace(profile.EmployeeId))
                {
                    _logger.LogInformation(
                        "[EmployeeHubApi] Successfully fetched profile for {EmployeeId} ({Name}) via {Endpoint}",
                        profile.EmployeeId, profile.FullName, endpoint);
                    return profile;
                }
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning("[EmployeeHubApi] Timeout calling {Endpoint} for {Id}", endpoint, employeeIdOrEmail);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "[EmployeeHubApi] HTTP error calling {Endpoint} for {Id}", endpoint, employeeIdOrEmail);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[EmployeeHubApi] Unexpected error for {Id} at {Endpoint}", employeeIdOrEmail, endpoint);
            }
        }

        _logger.LogDebug("[EmployeeHubApi] Could not find profile for {Id} via API — will fall back to SQL sync", employeeIdOrEmail);
        return null;
    }

    /// <inheritdoc />
    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        if (!_settings.Enabled) return false;

        try
        {
            var client = CreateClient();
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(5));

            // Try health endpoint, then root
            var healthEndpoints = new[] { "/health", "/api/health", "/" };
            foreach (var ep in healthEndpoints)
            {
                try
                {
                    var resp = await client.GetAsync(ep, cts.Token);
                    if (resp.IsSuccessStatusCode || (int)resp.StatusCode < 500)
                        return true;
                }
                catch { /* try next */ }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[EmployeeHubApi] Availability check failed");
        }
        return false;
    }

    // ------------------------------------------------------------------ //

    private HttpClient CreateClient()
    {
        var client = _httpClientFactory.CreateClient("EmployeeHubApi");

        // Attach API key if configured
        if (!string.IsNullOrEmpty(_settings.ApiKey))
        {
            client.DefaultRequestHeaders.Remove("X-Api-Key");
            client.DefaultRequestHeaders.Add("X-Api-Key", _settings.ApiKey);
        }

        return client;
    }

    /// <summary>
    /// Tries to deserialize the API response either as a wrapped envelope or as the DTO directly.
    /// </summary>
    private static EmployeeHubProfileDto? TryDeserializeProfile(string json, string endpoint)
    {
        try
        {
            // Try wrapped envelope first: { "success": true, "data": { ... } }
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (root.TryGetProperty("data", out var dataEl) && dataEl.ValueKind == JsonValueKind.Object)
            {
                var dto = JsonSerializer.Deserialize<EmployeeHubProfileDto>(dataEl.GetRawText(), _jsonOptions);
                if (dto != null && !string.IsNullOrWhiteSpace(dto.EmployeeId)) return dto;
            }

            // Try direct DTO
            if (root.TryGetProperty("employeeId", out _) || root.TryGetProperty("EmployeeId", out _))
            {
                return JsonSerializer.Deserialize<EmployeeHubProfileDto>(json, _jsonOptions);
            }

            // Try array (some APIs return an array, take first match)
            if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() > 0)
            {
                return JsonSerializer.Deserialize<EmployeeHubProfileDto>(
                    root[0].GetRawText(), _jsonOptions);
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Debug(ex, "[EmployeeHubApi] Failed to parse response from {Endpoint}", endpoint);
        }

        return null;
    }
}

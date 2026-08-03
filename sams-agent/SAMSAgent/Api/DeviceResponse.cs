using System.Text.Json.Serialization;

namespace SAMSAgent.Api;

/// <summary>
/// JSON response returned by GET /device.
///
/// This is the ONLY data the SAMS frontend receives from the Device Agent.
/// It contains the SHA-256 fingerprint and device metadata — no raw
/// hardware identifiers are present in this response.
///
/// The frontend forwards fingerprint + deviceName + computerName + operatingSystem
/// to POST /api/devices/validate on the SAMS backend.
/// </summary>
public sealed record DeviceResponse
{
    /// <summary>
    /// SHA-256 hex fingerprint (64 lowercase characters).
    /// Generated from hardware identifiers by FingerprintEngine.
    /// This is the only value that uniquely identifies the physical machine.
    /// </summary>
    [JsonPropertyName("fingerprint")]
    public required string Fingerprint { get; init; }

    /// <summary>
    /// Human-readable device label.
    /// Currently set to the computer name — can be configured in future versions.
    /// Example: "DESKTOP-A1B2C3"
    /// </summary>
    [JsonPropertyName("deviceName")]
    public required string DeviceName { get; init; }

    /// <summary>
    /// NetBIOS / Windows computer name.
    /// Example: "DESKTOP-A1B2C3"
    /// </summary>
    [JsonPropertyName("computerName")]
    public required string ComputerName { get; init; }

    /// <summary>
    /// Operating system display string.
    /// Example: "Windows 11 Pro"
    /// </summary>
    [JsonPropertyName("operatingSystem")]
    public required string OperatingSystem { get; init; }

    /// <summary>
    /// Device Agent version string.
    /// The SAMS frontend uses this to enforce minimum version requirements.
    /// Example: "1.0.0"
    /// </summary>
    [JsonPropertyName("agentVersion")]
    public required string AgentVersion { get; init; }

    /// <summary>
    /// ISO 8601 UTC timestamp of when this response was generated.
    /// Useful for cache-busting and diagnosing stale responses.
    /// </summary>
    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }
}

/// <summary>
/// JSON response returned by GET /health.
///
/// The three boolean fields together describe the full agent state:
///
///   fingerprintReady  fingerprintError  Meaning
///   ────────────────  ────────────────  ──────────────────────────────────
///   false             false             Agent is still initializing (WMI
///                                       queries are running). Poll again.
///   true              false             Agent is healthy. Safe to call
///                                       GET /device — will return HTTP 200.
///   true              true              Hardware collection failed. GET
///                                       /device will return HTTP 500.
///                                       Restart the service to retry.
///
/// Note: fingerprintReady = true AND fingerprintError = true is the failure
/// terminal state. fingerprintReady = false AND fingerprintError = true is
/// not a reachable state.
/// </summary>
public sealed record HealthResponse
{
    /// <summary>Always "ok" when the service is running.</summary>
    [JsonPropertyName("status")]
    public required string Status { get; init; }

    /// <summary>Agent version string.</summary>
    [JsonPropertyName("version")]
    public required string Version { get; init; }

    /// <summary>ISO 8601 UTC timestamp.</summary>
    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }

    /// <summary>
    /// True when the fingerprint has been successfully generated and cached.
    /// False during the first few seconds of startup while WMI is being queried,
    /// and false when fingerprint generation has failed (see fingerprintError).
    ///
    /// When this is true and fingerprintError is false, GET /device will
    /// return HTTP 200.  In all other cases GET /device will return 503 or 500.
    ///
    /// CHANGED in v1.1: previously this was true even when generation failed.
    /// It now reflects "ready AND healthy", giving callers a single unambiguous
    /// flag for the common case.  Older clients that only check fingerprintReady
    /// continue to work — they will not attempt GET /device while the flag is
    /// false, which is the safe behaviour.
    /// </summary>
    [JsonPropertyName("fingerprintReady")]
    public required bool FingerprintReady { get; init; }

    /// <summary>
    /// True when fingerprint generation has permanently failed.
    ///
    /// When true, GET /device returns HTTP 500 with a diagnostic error message.
    /// The error persists until the Windows Service is restarted.
    ///
    /// Common causes:
    ///   • WMI service unavailable or access denied.
    ///   • Fewer than 2 hardware sources available (stripped VM, broken WMI).
    ///   • Service account lacks read permission on hardware WMI namespaces.
    ///
    /// This field is absent (false) when the agent is still initializing or
    /// when the fingerprint was generated successfully.
    /// </summary>
    [JsonPropertyName("fingerprintError")]
    public required bool FingerprintError { get; init; }
}

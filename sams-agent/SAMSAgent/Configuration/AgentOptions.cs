namespace SAMSAgent.Configuration;

/// <summary>
/// Strongly-typed configuration for the SAMS Device Agent.
/// Bound from the "Agent" section of appsettings.json.
///
/// Example appsettings.json:
/// <code>
/// {
///   "Agent": {
///     "Port": 48763,
///     "Host": "127.0.0.1",
///     "Version": "1.0.0",
///     "AllowedOrigins": ["http://localhost:3000"]
///   }
/// }
/// </code>
/// </summary>
public sealed class AgentOptions
{
    /// <summary>
    /// Configuration section key used for binding.
    /// </summary>
    public const string Section = "Agent";

    /// <summary>
    /// TCP port the Kestrel local API listens on.
    /// Default: 48763 (above the well-known port range, below ephemeral range).
    /// This port must match what the SAMS frontend expects.
    /// </summary>
    public int Port { get; set; } = 48763;

    /// <summary>
    /// IP address Kestrel binds to.
    /// MUST remain "127.0.0.1" — never "0.0.0.0".
    /// Binding to all interfaces would expose the local hardware API
    /// to any machine on the same network.
    /// </summary>
    public string Host { get; set; } = "127.0.0.1";

    /// <summary>
    /// Agent version string returned by the /health and /device endpoints.
    /// The SAMS frontend compares this against the minimum required version
    /// configured in Device Settings to enforce mandatory upgrades.
    /// </summary>
    public string Version { get; set; } = "1.0.0";

    /// <summary>
    /// CORS allowed origins for the local Kestrel API.
    /// In development: ["http://localhost:3000"].
    /// In production: set to the actual SAMS frontend origin, e.g.
    /// ["https://sams.yourcompany.com"].
    ///
    /// Note: CORS applies only when a browser makes the request.
    /// The agent API is inherently localhost-only regardless of CORS settings.
    /// </summary>
    public string[] AllowedOrigins { get; set; } = ["http://localhost:3000"];

    // ─── Computed helpers ─────────────────────────────────────────────────────

    /// <summary>
    /// Returns the full bind URL for Kestrel, e.g. "http://127.0.0.1:48763".
    /// </summary>
    public string BindUrl => $"http://{Host}:{Port}";

    /// <summary>
    /// Validates configuration values.  Throws <see cref="InvalidOperationException"/>
    /// if any value is out of acceptable range.
    /// </summary>
    public void Validate()
    {
        if (Port is < 1024 or > 65535)
            throw new InvalidOperationException(
                $"Agent.Port must be between 1024 and 65535. Current value: {Port}");

        if (string.IsNullOrWhiteSpace(Host))
            throw new InvalidOperationException("Agent.Host must not be empty.");

        // Enforce localhost-only binding as a hard security constraint
        if (Host is not "127.0.0.1" and not "::1" and not "localhost")
            throw new InvalidOperationException(
                $"Agent.Host must be '127.0.0.1' or '::1'. " +
                $"The Device Agent must NEVER be exposed on a network interface. " +
                $"Current value: '{Host}'");

        if (string.IsNullOrWhiteSpace(Version))
            throw new InvalidOperationException("Agent.Version must not be empty.");
    }
}

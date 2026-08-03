using Microsoft.AspNetCore.Mvc;
using SAMSAgent.Configuration;
using SAMSAgent.Services;

namespace SAMSAgent.Api;

/// <summary>
/// Minimal API controller exposing two endpoints:
///
///   GET /health  — liveness probe, returns agent version and fingerprint-ready state
///   GET /device  — returns the cached fingerprint + device metadata
///
/// Both endpoints are intentionally simple and stateless.
/// The fingerprint is computed once at startup by AgentWorkerService and
/// cached in DeviceFingerprintCache — these endpoints just read the cache.
///
/// SECURITY:
///   • Kestrel is bound to 127.0.0.1 only — no external access possible.
///   • No authentication is required because only local processes can reach
///     this port (enforced at the network stack, not the application layer).
///   • Raw hardware identifiers are NEVER included in any response.
/// </summary>
[ApiController]
public sealed class DeviceController : ControllerBase
{
    private readonly DeviceFingerprintCache _cache;
    private readonly AgentOptions          _options;
    private readonly ILogger<DeviceController> _logger;

    public DeviceController(
        DeviceFingerprintCache cache,
        AgentOptions options,
        ILogger<DeviceController> logger)
    {
        _cache   = cache;
        _options = options;
        _logger  = logger;
    }

    // ─── GET /health ──────────────────────────────────────────────────────────

    /// <summary>
    /// Liveness / readiness probe.
    ///
    /// Always returns HTTP 200 so long as the service process is running.
    /// Callers use the three boolean fields to determine what to do next:
    ///
    ///   fingerprintReady=false, fingerprintError=false
    ///     → Agent is still initializing. WMI queries are running.
    ///       Poll again in ~1 second.
    ///
    ///   fingerprintReady=true, fingerprintError=false
    ///     → Agent is healthy. Call GET /device to retrieve the fingerprint.
    ///
    ///   fingerprintReady=true, fingerprintError=true
    ///     → Hardware collection failed permanently. GET /device returns HTTP 500.
    ///       Show an error to the user; the service must be restarted to recover.
    ///
    /// The SAMS frontend polls this endpoint to detect agent presence and
    /// readiness before requesting the device fingerprint.
    /// </summary>
    [HttpGet("/health")]
    [Produces("application/json")]
    public ActionResult<HealthResponse> GetHealth()
    {
        return Ok(new HealthResponse
        {
            Status           = "ok",
            Version          = _options.Version,
            Timestamp        = DateTime.UtcNow.ToString("o"),
            FingerprintReady = _cache.IsReady && !_cache.HasError,
            FingerprintError = _cache.HasError,
        });
    }

    // ─── GET /device ──────────────────────────────────────────────────────────

    /// <summary>
    /// Returns the device fingerprint and metadata.
    ///
    /// HTTP 200 — fingerprint is ready, response body contains device info.
    /// HTTP 503 — agent is still computing the fingerprint (retry after 1 s).
    /// HTTP 500 — fingerprint generation failed (WMI unavailable / insufficient sources).
    ///
    /// The SAMS frontend receives this response and forwards:
    ///   { fingerprint, deviceName, computerName, operatingSystem }
    /// to POST /api/devices/validate on the SAMS backend.
    /// agentVersion is checked client-side for minimum version enforcement.
    /// </summary>
    [HttpGet("/device")]
    [Produces("application/json")]
    public ActionResult<DeviceResponse> GetDevice()
    {
        if (!_cache.IsReady)
        {
            // Fingerprint not yet computed — agent is still starting up
            _logger.LogWarning("Device fingerprint requested before it was ready.");
            Response.Headers["Retry-After"] = "1";
            return StatusCode(503, new { error = "Device fingerprint is not yet available. Retry in 1 second." });
        }

        if (_cache.HasError)
        {
            _logger.LogError("Device fingerprint generation failed: {Error}", _cache.ErrorMessage);
            return StatusCode(500, new { error = _cache.ErrorMessage ?? "Fingerprint generation failed." });
        }

        _logger.LogDebug("Device endpoint called — returning cached fingerprint.");

        return Ok(new DeviceResponse
        {
            Fingerprint     = _cache.Fingerprint!,
            DeviceName      = _cache.ComputerName,
            ComputerName    = _cache.ComputerName,
            OperatingSystem = _cache.OperatingSystem,
            AgentVersion    = _options.Version,
            Timestamp       = DateTime.UtcNow.ToString("o"),
        });
    }
}

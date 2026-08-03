namespace SAMSAgent.Services;

/// <summary>
/// Thread-safe in-process cache for the computed device fingerprint and
/// associated metadata.
///
/// The fingerprint is computed ONCE at service startup by AgentWorkerService
/// and stored here.  All subsequent GET /device requests read from this cache
/// without re-querying WMI.
///
/// This design means:
///   • WMI queries run exactly once per service lifetime (very cheap at runtime).
///   • The fingerprint is stable for the lifetime of the Windows Service process.
///   • Restarting the service recomputes the fingerprint from scratch
///     (hardware changes are picked up on next restart).
///
/// Thread safety:
///   • All writes happen exactly once, during startup, before any HTTP request
///     can arrive (Kestrel is not started until after the cache is populated).
///   • Reads are therefore always safe without locking.
///   • volatile fields prevent CPU reordering across the startup/ready boundary.
/// </summary>
public sealed class DeviceFingerprintCache
{
    private volatile string?  _fingerprint;
    private volatile string   _computerName    = string.Empty;
    private volatile string   _operatingSystem = string.Empty;
    private volatile bool     _isReady;
    private volatile bool     _hasError;
    private volatile string?  _errorMessage;

    // ─── Read properties (used by DeviceController) ───────────────────────────

    /// <summary>
    /// True once the fingerprint has been successfully computed and cached.
    /// The Kestrel server starts before this becomes true (to allow /health
    /// polling), but /device returns HTTP 503 until this is true.
    /// </summary>
    public bool IsReady => _isReady;

    /// <summary>True if fingerprint generation encountered a fatal error.</summary>
    public bool HasError => _hasError;

    /// <summary>Error message if <see cref="HasError"/> is true; null otherwise.</summary>
    public string? ErrorMessage => _errorMessage;

    /// <summary>
    /// The 64-character lowercase SHA-256 fingerprint.
    /// Non-null only when <see cref="IsReady"/> is true.
    /// </summary>
    public string? Fingerprint => _fingerprint;

    /// <summary>NetBIOS computer name (empty until ready).</summary>
    public string ComputerName => _computerName;

    /// <summary>OS display string (empty until ready).</summary>
    public string OperatingSystem => _operatingSystem;

    // ─── Write methods (used by AgentWorkerService) ───────────────────────────

    /// <summary>
    /// Stores a successfully generated fingerprint and marks the cache as ready.
    /// Called exactly once by AgentWorkerService during startup.
    /// </summary>
    public void SetFingerprint(string fingerprint, string computerName, string operatingSystem)
    {
        _fingerprint     = fingerprint;
        _computerName    = computerName;
        _operatingSystem = operatingSystem;
        _hasError        = false;
        _errorMessage    = null;
        _isReady         = true;   // volatile write — must be last
    }

    /// <summary>
    /// Records a fingerprint generation failure.
    /// GET /device will return HTTP 500 after this is called.
    /// </summary>
    public void SetError(string errorMessage)
    {
        _errorMessage = errorMessage;
        _hasError     = true;
        _isReady      = true;   // mark ready so the controller can return 500
    }
}

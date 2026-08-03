using System.Runtime.Versioning;
using SAMSAgent.Hardware;
using SAMSAgent.Configuration;

namespace SAMSAgent.Services;

/// <summary>
/// Background worker that runs for the lifetime of the Windows Service.
///
/// Responsibilities:
///   1. Collect hardware identifiers at startup via HardwareCollector.
///   2. Generate the SHA-256 fingerprint via FingerprintEngine.
///   3. Store the fingerprint + device metadata in DeviceFingerprintCache,
///      which is the single shared state read by DeviceController.
///   4. Record a terminal error in DeviceFingerprintCache if generation fails,
///      so GET /device can return HTTP 500 with a diagnostic message rather
///      than silently hanging on HTTP 503 forever.
///   5. Log structured startup/shutdown events to the Windows Event Log.
///
/// The hardware collection happens ONCE at startup and the result is cached
/// in DeviceFingerprintCache for the lifetime of the process.  This avoids
/// repeated WMI queries on every HTTP request (WMI can be slow — 200–500 ms).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class AgentWorkerService : BackgroundService
{
    private readonly ILogger<AgentWorkerService>  _logger;
    private readonly HardwareCollector            _collector;
    private readonly FingerprintEngine            _engine;
    private readonly DeviceFingerprintCache       _cache;
    private readonly AgentOptions                 _options;

    public AgentWorkerService(
        ILogger<AgentWorkerService> logger,
        HardwareCollector           collector,
        FingerprintEngine           engine,
        DeviceFingerprintCache      cache,
        AgentOptions                options)
    {
        _logger    = logger;
        _collector = collector;
        _engine    = engine;
        _cache     = cache;
        _options   = options;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "SAMS Device Agent v{Version} starting on {Url}",
            _options.Version,
            _options.BindUrl);

        // ── Hardware collection + fingerprint generation ───────────────────
        // Run on a thread-pool thread so the service host is not blocked
        // during the potentially slow WMI queries.
        try
        {
            await Task.Run(() =>
            {
                HardwareInfo info        = _collector.Collect();
                string       fingerprint = _engine.Generate(info);

                // Populate the cache that DeviceController reads from.
                // SetFingerprint sets _isReady = true as its final volatile
                // write, ensuring the controller never sees a partial state.
                _cache.SetFingerprint(
                    fingerprint:     fingerprint,
                    computerName:    info.ComputerName,
                    operatingSystem: info.OsVersion);

            }, stoppingToken);

            _logger.LogInformation(
                "Device fingerprint ready. Agent is serving requests on {Url}",
                _options.BindUrl);
        }
        catch (OperationCanceledException)
        {
            // Service was stopped before collection completed — normal shutdown.
            return;
        }
        catch (Exception ex)
        {
            // Record the failure in the cache so GET /device returns HTTP 500
            // with a human-readable message instead of staying on HTTP 503.
            // The service keeps running so GET /health remains reachable and
            // the administrator can diagnose the problem without a restart.
            _cache.SetError(ex.Message);

            _logger.LogError(
                ex,
                "Failed to generate device fingerprint. " +
                "GET /device will return HTTP 500 until the service is restarted. " +
                "Check WMI availability and service account permissions.");
        }

        // ── Keep-alive loop ───────────────────────────────────────────────
        // The service stays running until Windows stops it.
        // Log a periodic heartbeat so Event Viewer shows the service is alive.
        using PeriodicTimer heartbeat = new(TimeSpan.FromMinutes(30));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await heartbeat.WaitForNextTickAsync(stoppingToken);
                _logger.LogInformation(
                    "SAMS Device Agent heartbeat — fingerprint ready: {Ready}, error: {Error}",
                    _cache.IsReady && !_cache.HasError,
                    _cache.HasError ? (_cache.ErrorMessage ?? "unknown error") : "none");
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("SAMS Device Agent stopped.");
    }
}

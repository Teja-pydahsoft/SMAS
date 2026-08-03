using SAMSAgent.Api;
using SAMSAgent.Configuration;
using SAMSAgent.Hardware;
using SAMSAgent.Services;

// ─────────────────────────────────────────────────────────────────────────────
// SAMS Device Agent — entry point
//
// Architecture:
//   • ASP.NET Core minimal API (Kestrel) for the local HTTP endpoints.
//   • Microsoft.Extensions.Hosting.WindowsServices for Windows Service support.
//   • AgentWorkerService (IHostedService) handles startup WMI queries and
//     the heartbeat loop.
//   • DeviceFingerprintCache is the ONLY shared state between the worker
//     and DeviceController — one singleton, written once at startup,
//     read on every HTTP request.
//
// Startup sequence:
//   1. Configuration loaded (appsettings.json + env overrides).
//   2. AgentOptions validated — hard-fail if Host is not localhost.
//   3. DI container built.
//   4. Kestrel bound to 127.0.0.1 only (security constraint).
//   5. AgentWorkerService starts:  WMI → SHA-256 → cache populated.
//   6. GET /health returns { status: "ok", fingerprintReady: true }.
//   7. GET /device returns the fingerprint response.
// ─────────────────────────────────────────────────────────────────────────────

var builder = WebApplication.CreateBuilder(args);

// ─── Windows Service support ──────────────────────────────────────────────────
// Tells the host to integrate with the Windows Service Control Manager
// so the process responds to Start/Stop/Pause commands from services.msc
// and survives user log-off.
builder.Host.UseWindowsService(options =>
{
    options.ServiceName = "SAMS Device Agent";
});

// ─── Configuration ────────────────────────────────────────────────────────────
builder.Configuration
    .SetBasePath(AppContext.BaseDirectory)          // exe directory, not CWD
    .AddJsonFile("appsettings.json",            optional: false, reloadOnChange: false)
    .AddJsonFile("appsettings.Production.json", optional: true,  reloadOnChange: false)
    .AddEnvironmentVariables(prefix: "SAMS_AGENT_");

// Bind and validate AgentOptions early so misconfiguration fails fast
var agentOptions = builder.Configuration
    .GetSection(AgentOptions.Section)
    .Get<AgentOptions>() ?? new AgentOptions();

agentOptions.Validate();    // throws if Host is not localhost

// ─── Logging ──────────────────────────────────────────────────────────────────
builder.Logging.ClearProviders();

if (OperatingSystem.IsWindows())
{
    // Windows Event Log — visible in Event Viewer under Application
    builder.Logging.AddEventLog(settings =>
    {
        settings.SourceName = "SAMS Device Agent";
        settings.LogName    = "Application";
    });
}

// Always add console logging (useful when running interactively during dev)
builder.Logging.AddConsole();

// ─── Kestrel — localhost-only binding ────────────────────────────────────────
// CRITICAL SECURITY: Kestrel MUST bind to 127.0.0.1 only.
// The AgentOptions.Validate() call above already rejects non-localhost hosts,
// but we also set the URL explicitly here so the ASP.NET default (0.0.0.0)
// is never used even if someone changes the config accidentally.
builder.WebHost.UseKestrel(kestrel =>
{
    kestrel.Listen(
        System.Net.IPAddress.Parse(agentOptions.Host),
        agentOptions.Port);
});

// Suppress the default HTTPS redirect middleware — HTTP on localhost is fine
// because traffic never leaves the machine.
builder.WebHost.UseUrls(); // clear any default URLs (overridden by the Listen call above)

// ─── Services ─────────────────────────────────────────────────────────────────

// AgentOptions — singleton for injection into controllers and services
builder.Services.AddSingleton(agentOptions);

// Hardware layer — singleton: collect once, reuse forever
builder.Services.AddSingleton<HardwareCollector>();
builder.Services.AddSingleton<FingerprintEngine>();

// Cache — the single shared state between AgentWorkerService (writer)
// and DeviceController (reader). Registered once; both resolve the same instance.
builder.Services.AddSingleton<DeviceFingerprintCache>();

// Background service — runs WMI queries at startup, then heartbeat loop
builder.Services.AddHostedService<AgentWorkerService>();

// MVC controllers (DeviceController)
builder.Services.AddControllers();

// CORS — allow the configured origins to call the local API from a browser
builder.Services.AddCors(cors =>
{
    cors.AddDefaultPolicy(policy =>
    {
        if (agentOptions.AllowedOrigins.Length > 0)
        {
            policy
                .WithOrigins(agentOptions.AllowedOrigins)
                .AllowAnyMethod()
                .AllowAnyHeader();
        }
        else
        {
            // Production: no CORS (the browser origin must be in AllowedOrigins)
            policy.SetIsOriginAllowed(_ => false);
        }
    });
});

// ─── Build and configure middleware pipeline ──────────────────────────────────
var app = builder.Build();

// CORS must come before routing
app.UseCors();

// Map MVC controller routes (GET /health, GET /device)
app.MapControllers();

// ─── Run ──────────────────────────────────────────────────────────────────────
var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogInformation(
    "SAMS Device Agent starting on {Url} (Windows Service: {IsService})",
    agentOptions.BindUrl,
    WindowsServiceHelpers.IsWindowsService());

await app.RunAsync();

// ─── Helper ───────────────────────────────────────────────────────────────────

/// <summary>Detects whether the process is running as a Windows Service.</summary>
static class WindowsServiceHelpers
{
    public static bool IsWindowsService()
    {
        try
        {
            return !Environment.UserInteractive;
        }
        catch
        {
            return false;
        }
    }
}

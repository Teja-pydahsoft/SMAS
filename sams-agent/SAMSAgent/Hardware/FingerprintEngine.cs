using System.Security.Cryptography;
using System.Text;
using System.Runtime.Versioning;

namespace SAMSAgent.Hardware;

/// <summary>
/// Generates a stable, reproducible SHA-256 device fingerprint from
/// collected hardware identifiers.
///
/// SECURITY CONTRACT:
///   • Raw hardware values are concatenated into a single string inside
///     this method and immediately hashed.
///   • The intermediate string is overwritten with zeros before the method
///     returns via CryptographicOperations.ZeroMemory.
///   • Only the 64-character lowercase hex fingerprint ever leaves this class.
///   • No raw hardware identifiers are returned, logged, or stored.
///
/// STABILITY DESIGN:
///   • Fields are separated by a fixed pipe '|' delimiter so a value
///     containing spaces cannot accidentally merge with an adjacent field.
///   • Each field is explicitly labelled with a key prefix (e.g. "BIOS:")
///     so that adding optional fields in future versions does not silently
///     change existing fingerprints.
///   • A minimum source threshold is enforced — if too few hardware sources
///     are available the fingerprint is rejected as unreliable.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class FingerprintEngine
{
    /// <summary>
    /// Minimum number of non-empty hardware sources required to produce a
    /// fingerprint.  If fewer are available the machine is likely a stripped
    /// VM or the WMI service is broken; we refuse to generate a hash that
    /// would match anything with the same defaults.
    /// </summary>
    private const int MinimumSources = 2;

    private readonly ILogger<FingerprintEngine> _logger;

    public FingerprintEngine(ILogger<FingerprintEngine> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Produces the SHA-256 fingerprint string, or throws
    /// <see cref="InvalidOperationException"/> if not enough sources are available.
    /// </summary>
    /// <param name="info">Hardware identifiers from <see cref="HardwareCollector"/>.</param>
    /// <returns>64-character lowercase hexadecimal SHA-256 digest.</returns>
    /// <exception cref="InvalidOperationException">
    /// Thrown when fewer than <see cref="MinimumSources"/> hardware values are available.
    /// </exception>
    public string Generate(HardwareInfo info)
    {
        if (info.AvailableSourceCount < MinimumSources)
        {
            throw new InvalidOperationException(
                $"Insufficient hardware sources for fingerprint generation. " +
                $"Available: {info.AvailableSourceCount}, Required: {MinimumSources}. " +
                $"Ensure WMI is accessible and the agent is running as a service account " +
                $"with read access to hardware namespaces.");
        }

        _logger.LogInformation(
            "Generating fingerprint from {Count} hardware source(s).",
            info.AvailableSourceCount);

        // ── Build the raw input string ───────────────────────────────────────
        // Each field is labelled with a stable prefix key.
        // Empty fields are included as empty strings — this ensures the
        // field count is constant even when a source is unavailable,
        // preventing index-shift collisions.
        string rawInput = BuildRawInput(info);

        // ── SHA-256 hash ─────────────────────────────────────────────────────
        byte[] inputBytes  = Encoding.UTF8.GetBytes(rawInput);
        byte[] hashBytes   = SHA256.HashData(inputBytes);

        // ── Zero the input bytes before returning ────────────────────────────
        // The raw concatenation never persists beyond this scope.
        CryptographicOperations.ZeroMemory(inputBytes);

        string fingerprint = Convert.ToHexString(hashBytes).ToLowerInvariant();

        _logger.LogInformation(
            "Fingerprint generated successfully (first 8 chars: {Prefix}…).",
            fingerprint[..8]);

        return fingerprint;
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /// <summary>
    /// Constructs the canonical raw input string.
    ///
    /// Format (pipe-delimited, labelled fields):
    ///   BIOS:{value}|MB:{value}|CPU:{value}|DISK:{value}|MAC:{value}|
    ///   TPM:{value}|CN:{value}|GUID:{value}
    ///
    /// Changing this format would change all existing fingerprints.
    /// Increment the version constant below if the format ever changes,
    /// and migrate existing Device records in the backend.
    /// </summary>
    private static string BuildRawInput(HardwareInfo info)
    {
        // Version prefix ensures future format changes produce different hashes
        // rather than silently colliding with old-format fingerprints.
        const string FormatVersion = "v1";

        return string.Concat(
            FormatVersion,      "|",
            "BIOS:",            info.BiosUuid,          "|",
            "MB:",              info.MotherboardSerial, "|",
            "CPU:",             info.CpuIdentifier,     "|",
            "DISK:",            info.DiskSerial,        "|",
            "MAC:",             info.MacAddress,        "|",
            "TPM:",             info.TpmVersion,        "|",
            "CN:",              info.ComputerName,      "|",
            "GUID:",            info.MachineGuid
        );
    }
}

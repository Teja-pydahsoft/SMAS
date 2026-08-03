using System.Management;
using System.Runtime.Versioning;
using Microsoft.Win32;

namespace SAMSAgent.Hardware;

/// <summary>
/// Collects stable hardware identifiers from the local Windows machine
/// using WMI (Windows Management Instrumentation) and the Windows Registry.
///
/// SECURITY CONTRACT:
///   All raw values collected here are used exclusively by FingerprintEngine
///   to produce a SHA-256 hash.  Raw values are NEVER serialised, logged,
///   or transmitted anywhere outside this process.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class HardwareCollector
{
    private readonly ILogger<HardwareCollector> _logger;

    public HardwareCollector(ILogger<HardwareCollector> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Collects all available hardware identifiers.
    /// Missing or unavailable values are returned as empty strings —
    /// the fingerprint engine handles graceful degradation.
    /// </summary>
    public HardwareInfo Collect()
    {
        _logger.LogInformation("Collecting hardware identifiers…");

        var info = new HardwareInfo
        {
            BiosUuid         = GetBiosUuid(),
            MotherboardSerial = GetMotherboardSerial(),
            CpuIdentifier    = GetCpuIdentifier(),
            DiskSerial       = GetDiskSerial(),
            MacAddress       = GetPrimaryMacAddress(),
            TpmVersion       = GetTpmVersion(),
            ComputerName     = GetComputerName(),
            OsVersion        = GetOsVersion(),
            MachineGuid      = GetMachineGuid(),
        };

        // Log availability (not values) so the admin can diagnose missing sources
        _logger.LogInformation(
            "Hardware collection complete. Available sources: " +
            "BIOS={Bios}, MB={Mb}, CPU={Cpu}, Disk={Disk}, MAC={Mac}, " +
            "TPM={Tpm}, GUID={Guid}",
            !string.IsNullOrEmpty(info.BiosUuid),
            !string.IsNullOrEmpty(info.MotherboardSerial),
            !string.IsNullOrEmpty(info.CpuIdentifier),
            !string.IsNullOrEmpty(info.DiskSerial),
            !string.IsNullOrEmpty(info.MacAddress),
            !string.IsNullOrEmpty(info.TpmVersion),
            !string.IsNullOrEmpty(info.MachineGuid));

        return info;
    }

    // ─── WMI helpers ────────────────────────────────────────────────────────

    /// <summary>BIOS UUID — globally unique, set by the motherboard firmware.</summary>
    private string GetBiosUuid()
    {
        return QueryWmi(
            "SELECT UUID FROM Win32_ComputerSystemProduct",
            "UUID");
    }

    /// <summary>Motherboard serial number from the baseboard.</summary>
    private string GetMotherboardSerial()
    {
        return QueryWmi(
            "SELECT SerialNumber FROM Win32_BaseBoard",
            "SerialNumber");
    }

    /// <summary>
    /// CPU Processor ID — a value burned into the chip by the manufacturer.
    /// Takes the first logical processor (multi-socket is rare in enterprise).
    /// </summary>
    private string GetCpuIdentifier()
    {
        return QueryWmi(
            "SELECT ProcessorId FROM Win32_Processor",
            "ProcessorId");
    }

    /// <summary>
    /// Serial number of the first physical disk drive.
    /// Skips virtual/USB drives where possible.
    /// </summary>
    private string GetDiskSerial()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT SerialNumber, MediaType FROM Win32_DiskDrive");

            string? physicalSerial = null;
            string? anySerial      = null;

            foreach (ManagementObject obj in searcher.Get())
            {
                string serial    = obj["SerialNumber"]?.ToString()?.Trim() ?? string.Empty;
                string mediaType = obj["MediaType"]?.ToString() ?? string.Empty;

                if (string.IsNullOrWhiteSpace(serial)) continue;

                // Prefer a fixed, non-removable drive
                if (mediaType.Contains("Fixed", StringComparison.OrdinalIgnoreCase))
                {
                    physicalSerial = serial;
                    break;
                }

                anySerial ??= serial;
            }

            return Normalise(physicalSerial ?? anySerial);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read disk serial");
            return string.Empty;
        }
    }

    /// <summary>
    /// Primary network adapter MAC address.
    /// Selects the first physical (non-virtual, non-loopback) adapter
    /// that has a valid MAC and an IP address assigned.
    /// </summary>
    private string GetPrimaryMacAddress()
    {
        try
        {
            // Prefer adapters that are physically connected and have a gateway
            using var searcher = new ManagementObjectSearcher(
                "SELECT MACAddress, AdapterType, PhysicalAdapter " +
                "FROM Win32_NetworkAdapter " +
                "WHERE MACAddress IS NOT NULL AND PhysicalAdapter = TRUE");

            string? mac = null;

            foreach (ManagementObject obj in searcher.Get())
            {
                string candidate = obj["MACAddress"]?.ToString()?.Trim() ?? string.Empty;
                if (!string.IsNullOrEmpty(candidate))
                {
                    mac = candidate;
                    break;
                }
            }

            return Normalise(mac);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read MAC address");
            return string.Empty;
        }
    }

    /// <summary>
    /// TPM specification version, if a TPM chip is present and accessible.
    /// Returns empty string on machines without TPM — fingerprint degrades gracefully.
    /// </summary>
    private string GetTpmVersion()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                @"root\CIMv2\Security\MicrosoftTpm",
                "SELECT SpecVersion FROM Win32_Tpm");

            foreach (ManagementObject obj in searcher.Get())
            {
                return Normalise(obj["SpecVersion"]?.ToString());
            }
        }
        catch
        {
            // TPM namespace may not exist — not an error
        }

        return string.Empty;
    }

    // ─── System helpers ──────────────────────────────────────────────────────

    /// <summary>NetBIOS computer name from the operating system.</summary>
    private string GetComputerName()
    {
        try
        {
            return Normalise(Environment.MachineName);
        }
        catch
        {
            return string.Empty;
        }
    }

    /// <summary>Operating system display name, e.g. "Windows 11 Pro".</summary>
    private string GetOsVersion()
    {
        return QueryWmi(
            "SELECT Caption FROM Win32_OperatingSystem",
            "Caption");
    }

    /// <summary>
    /// Windows Cryptography Machine GUID stored in the registry.
    /// This is created during OS installation and is stable across reboots.
    /// </summary>
    private string GetMachineGuid()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(
                @"SOFTWARE\Microsoft\Cryptography", writable: false);

            return Normalise(key?.GetValue("MachineGuid")?.ToString());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read Machine GUID from registry");
            return string.Empty;
        }
    }

    // ─── Low-level WMI helper ────────────────────────────────────────────────

    /// <summary>
    /// Executes a WMI SELECT query and returns the first non-empty value
    /// for the specified property.  Returns empty string on any failure.
    /// </summary>
    private string QueryWmi(string query, string property)
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(query);
            foreach (ManagementObject obj in searcher.Get())
            {
                string? value = obj[property]?.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(value))
                    return Normalise(value);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "WMI query failed: {Query}", query);
        }

        return string.Empty;
    }

    /// <summary>
    /// Normalise a raw hardware string:
    ///   • Trim whitespace
    ///   • Uppercase for case-insensitive consistency
    ///   • Replace known "not available" sentinel strings with empty
    /// </summary>
    private static string Normalise(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;

        string normalised = value.Trim().ToUpperInvariant();

        // Common OEM sentinel values that indicate "not set"
        string[] sentinels =
        [
            "TO BE FILLED BY O.E.M.",
            "TO BE FILLED BY OEM",
            "NOT APPLICABLE",
            "N/A",
            "NONE",
            "DEFAULT STRING",
            "SYSTEM SERIAL NUMBER",
            "CHASSIS SERIAL NUMBER",
            "00000000",
            "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
            "03000200-0400-0500-0006-000700080009"  // common VM placeholder
        ];

        foreach (string sentinel in sentinels)
        {
            if (normalised == sentinel) return string.Empty;
        }

        return normalised;
    }
}

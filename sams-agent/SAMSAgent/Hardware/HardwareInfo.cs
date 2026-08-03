namespace SAMSAgent.Hardware;

/// <summary>
/// Plain data record holding raw hardware identifiers collected by HardwareCollector.
///
/// SECURITY: This record exists only inside the agent process.
/// It is NEVER serialised to JSON, written to disk, or transmitted over any network.
/// It is consumed exclusively by FingerprintEngine to produce a SHA-256 hash,
/// after which the hash (not this record) is used for all subsequent operations.
/// </summary>
public sealed record HardwareInfo
{
    /// <summary>BIOS UUID from Win32_ComputerSystemProduct.UUID</summary>
    public string BiosUuid { get; init; } = string.Empty;

    /// <summary>Motherboard serial number from Win32_BaseBoard.SerialNumber</summary>
    public string MotherboardSerial { get; init; } = string.Empty;

    /// <summary>CPU processor ID from Win32_Processor.ProcessorId</summary>
    public string CpuIdentifier { get; init; } = string.Empty;

    /// <summary>First physical disk serial from Win32_DiskDrive.SerialNumber</summary>
    public string DiskSerial { get; init; } = string.Empty;

    /// <summary>Primary physical network adapter MAC address</summary>
    public string MacAddress { get; init; } = string.Empty;

    /// <summary>TPM specification version (empty if no TPM present)</summary>
    public string TpmVersion { get; init; } = string.Empty;

    /// <summary>NetBIOS computer name from Environment.MachineName</summary>
    public string ComputerName { get; init; } = string.Empty;

    /// <summary>OS display string from Win32_OperatingSystem.Caption</summary>
    public string OsVersion { get; init; } = string.Empty;

    /// <summary>
    /// Windows Cryptography Machine GUID from
    /// HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
    /// </summary>
    public string MachineGuid { get; init; } = string.Empty;

    /// <summary>
    /// Returns the count of non-empty hardware sources available.
    /// Used for fingerprint quality assessment: lower = less stable.
    /// </summary>
    public int AvailableSourceCount =>
        (string.IsNullOrEmpty(BiosUuid)          ? 0 : 1) +
        (string.IsNullOrEmpty(MotherboardSerial) ? 0 : 1) +
        (string.IsNullOrEmpty(CpuIdentifier)     ? 0 : 1) +
        (string.IsNullOrEmpty(DiskSerial)        ? 0 : 1) +
        (string.IsNullOrEmpty(MacAddress)        ? 0 : 1) +
        (string.IsNullOrEmpty(TpmVersion)        ? 0 : 1) +
        (string.IsNullOrEmpty(MachineGuid)       ? 0 : 1);
}

#Requires -RunAsAdministrator
<#
.SYNOPSIS
    SAMS Device Agent — Windows Service installer.

.DESCRIPTION
    Installs the SAMS Device Agent as a Windows Service, configures automatic
    startup, starts the service, and verifies it is running by polling the
    health endpoint.

    Handles fresh install and reinstall/upgrade scenarios.

    Exit codes:
        0  — success
        1  — failure (see log for details)

.PARAMETER InstallDir
    Directory where SAMSAgent.exe and its config will be placed.
    Default: C:\Program Files\SAMS\Agent

.PARAMETER FrontendOrigin
    SAMS frontend URL for CORS configuration, e.g. https://sams.yourorg.com
    Leave empty (default) to disable CORS — correct for most production deployments
    where the browser and the agent are on the same machine.

.PARAMETER Port
    TCP port the agent listens on. Must match the SAMS frontend constant.
    Default: 48763

.PARAMETER LogDir
    Directory for installer and service logs.
    Default: C:\ProgramData\SAMS\Agent\Logs

.PARAMETER Silent
    Suppress all console output except errors. Used by the Inno Setup GUI installer.

.EXAMPLE
    # Interactive install with defaults
    .\install.ps1

    # Enterprise silent deploy with custom origin
    .\install.ps1 -FrontendOrigin "https://sams.corp.com" -Silent

    # Custom port
    .\install.ps1 -Port 48764
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $InstallDir    = 'C:\Program Files\SAMS\Agent',
    [string] $FrontendOrigin = '',
    [int]    $Port          = 48763,
    [string] $LogDir        = 'C:\ProgramData\SAMS\Agent\Logs',
    [switch] $Silent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Constants ──────────────────────────────────────────────────────────────────
$ServiceName    = 'SAMSAgent'
$DisplayName    = 'SAMS Device Agent'
$Description    = 'Hardware fingerprint service for SAMS device authentication. Exposes a local HTTP API on localhost used by the SAMS web application.'
$ExeName        = 'SAMSAgent.exe'
$ConfigName     = 'appsettings.Production.json'
$RegistryPath   = 'HKLM:\SOFTWARE\SAMS\Agent'
$HealthUrl      = "http://127.0.0.1:$Port/health"
$HealthRetries  = 15
$HealthDelayMs  = 1000
$ScriptDir      = $PSScriptRoot
$PublishDir     = Join-Path $ScriptDir 'publish'
$LogFile        = Join-Path $LogDir    'install.log'
$Version        = '1.0.0'   # Updated by build-installer.ps1 at build time

# ── Logging ────────────────────────────────────────────────────────────────────
function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $ts   = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "[$ts] [$Level] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    if (-not $Silent) {
        switch ($Level) {
            'ERROR' { Write-Host $line -ForegroundColor Red }
            'WARN'  { Write-Host $line -ForegroundColor Yellow }
            'OK'    { Write-Host $line -ForegroundColor Green }
            default { Write-Host $line }
        }
    } elseif ($Level -eq 'ERROR') {
        Write-Error $Message
    }
}

function Exit-Failure {
    param([string]$Message)
    Write-Log $Message 'ERROR'
    Write-Log "Installation FAILED. See log: $LogFile" 'ERROR'
    exit 1
}

# ── Prerequisites ──────────────────────────────────────────────────────────────
function Test-Prerequisites {
    Write-Log 'Checking prerequisites...'

    # OS version - Windows 10 1809 / Server 2019 minimum
    $os = Get-CimInstance Win32_OperatingSystem
    Write-Log "OS: $($os.Caption) Build $($os.BuildNumber)"
    if ([int]$os.BuildNumber -lt 17763) {
        Exit-Failure "Windows build $($os.BuildNumber) is not supported. Minimum: 17763 (Windows 10 1809 / Server 2019)."
    }

    # Architecture
    if ([System.Environment]::Is64BitOperatingSystem -eq $false) {
        Exit-Failure 'SAMS Device Agent requires a 64-bit operating system.'
    }

    # Source binary exists
    $srcExe = Join-Path $PublishDir $ExeName
    if (-not (Test-Path $srcExe)) {
        Exit-Failure "Source binary not found: $srcExe`nRun build-installer.ps1 first, or place SAMSAgent.exe in the 'publish' subdirectory."
    }

    Write-Log 'Prerequisites OK.' 'OK'
}

# ── Directory setup ────────────────────────────────────────────────────────────
function Initialize-Directories {
    Write-Log "Creating directories..."

    foreach ($dir in @($InstallDir, $LogDir)) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Log "  Created: $dir"
        } else {
            Write-Log "  Exists:  $dir"
        }
    }

    # ACLs - SYSTEM + Administrators full control; Users read on log dir
    $inherit    = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor `
                  [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $propagate  = [System.Security.AccessControl.PropagationFlags]::None
    $allow      = [System.Security.AccessControl.AccessControlType]::Allow
    $fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl
    $readRights  = [System.Security.AccessControl.FileSystemRights]::Read -bor `
                   [System.Security.AccessControl.FileSystemRights]::ReadAndExecute -bor `
                   [System.Security.AccessControl.FileSystemRights]::ListDirectory

    $acl = Get-Acl -Path $InstallDir
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('SYSTEM',        $fullControl, $inherit, $propagate, $allow)))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('Administrators', $fullControl, $inherit, $propagate, $allow)))
    Set-Acl -Path $InstallDir -AclObject $acl

    $logAcl = Get-Acl -Path $LogDir
    $logAcl.SetAccessRuleProtection($true, $false)
    $logAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('SYSTEM',        $fullControl, $inherit, $propagate, $allow)))
    $logAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('Administrators', $fullControl, $inherit, $propagate, $allow)))
    $logAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule('Users',          $readRights,  $inherit, $propagate, $allow)))
    Set-Acl -Path $LogDir -AclObject $logAcl

    Write-Log 'Directories ready.' 'OK'
}

# ── Stop existing service ──────────────────────────────────────────────────────
function Stop-ExistingService {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -eq $svc) { return }

    Write-Log "Existing service found (Status: $($svc.Status)). Stopping..."
    if ($svc.Status -ne 'Stopped') {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        $waited = 0
        while ((Get-Service -Name $ServiceName).Status -ne 'Stopped' -and $waited -lt 12) {
            Start-Sleep -Seconds 1; $waited++
        }
        if ((Get-Service -Name $ServiceName).Status -ne 'Stopped') {
            Write-Log "Service did not stop cleanly in 12 s - force-killing process." 'WARN'
            $proc = Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($ExeName)) -ErrorAction SilentlyContinue
            if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
            Start-Sleep -Seconds 2
        }
    }
    Write-Log 'Existing service stopped.' 'OK'
}

# ── Copy binary ────────────────────────────────────────────────────────────────
function Copy-Binary {
    Write-Log 'Copying files...'

    # ── Copy entire publish output to the install directory ──────────────────
    # This mirrors every file dotnet publish produces without maintaining
    # a hardcoded list. New files added in future builds are copied automatically.
    $publishFiles = Get-ChildItem -Path $PublishDir -File
    foreach ($file in $publishFiles) {
        # Never overwrite appsettings.Production.json with the publish placeholder
        # if one already exists in the install dir and the user has customised it.
        # All other files are always overwritten so upgrades get the new binary.
        $dst = Join-Path $InstallDir $file.Name
        Copy-Item -Path $file.FullName -Destination $dst -Force
        Write-Log ("  Copied: " + $file.Name)
    }

    # Verify the two required config files are present; generate if missing.
    # dotnet publish normally produces both, but guard against stripped builds.
    $dstBaseConfig = Join-Path $InstallDir 'appsettings.json'
    $dstConfig     = Join-Path $InstallDir $ConfigName

    if (-not (Test-Path $dstBaseConfig)) {
        Write-Log "  appsettings.json missing from publish - generating default"
        $baseConfig = @{
            Agent   = @{ Port = $Port; Host = '127.0.0.1'; Version = $Version; AllowedOrigins = @('http://localhost:3000') }
            Logging = @{
                LogLevel = @{ Default = 'Information'; Microsoft = 'Warning'; SAMSAgent = 'Information' }
                EventLog = @{ SourceName = 'SAMS Device Agent'; LogName = 'Application'; LogLevel = @{ Default = 'Warning'; SAMSAgent = 'Information' } }
            }
        }
        $baseConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $dstBaseConfig -Encoding UTF8
    }

    if (-not (Test-Path $dstConfig)) {
        Write-Log "  appsettings.Production.json missing from publish - generating default"
        $prodConfig = @{
            Agent   = @{ Port = $Port; Host = '127.0.0.1'; Version = $Version; AllowedOrigins = @() }
            Logging = @{
                LogLevel = @{ Default = 'Warning'; SAMSAgent = 'Information' }
                EventLog = @{ SourceName = 'SAMS Device Agent'; LogName = 'Application'; LogLevel = @{ Default = 'Warning'; SAMSAgent = 'Information' } }
            }
        }
        $prodConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $dstConfig -Encoding UTF8
    }

    # ── Inject runtime overrides into appsettings.Production.json ────────────
    if ($FrontendOrigin -or $Port -ne 48763) {
        $cfg = Get-Content $dstConfig -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($FrontendOrigin) {
            $cfg.Agent.AllowedOrigins = @($FrontendOrigin)
            Write-Log "  Set AllowedOrigins: $FrontendOrigin"
        }
        if ($Port -ne 48763) {
            $cfg.Agent.Port = $Port
            Write-Log ("  Set Port: " + $Port)
        }
        $cfg | ConvertTo-Json -Depth 10 | Set-Content -Path $dstConfig -Encoding UTF8
    }

    Write-Log 'Files copied.' 'OK'
}

# ── Event Log source ───────────────────────────────────────────────────────────
function Register-EventLogSource {
    try {
        if (-not [System.Diagnostics.EventLog]::SourceExists('SAMS Device Agent')) {
            New-EventLog -LogName Application -Source 'SAMS Device Agent' -ErrorAction Stop
            Write-Log 'Event Log source registered.' 'OK'
        } else {
            Write-Log 'Event Log source already registered.'
        }
    } catch {
        Write-Log "Event Log source registration warning: $_" 'WARN'
    }
}

# ── Install & configure Windows Service ───────────────────────────────────────
function Install-WindowsService {
    Write-Log 'Installing Windows Service...'
    $exePath = Join-Path $InstallDir $ExeName

    # Delete existing service registration if present
    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Log "  Removing previous service registration..."
        & sc.exe delete $ServiceName | Out-Null
        Start-Sleep -Seconds 1
        if ($LASTEXITCODE -ne 0) {
            Exit-Failure "sc.exe delete failed with exit code $LASTEXITCODE"
        }
    }

    # Create service - automatic start, runs as LocalSystem
    & sc.exe create $ServiceName `
        binPath= "`"$exePath`"" `
        start=  auto `
        DisplayName= $DisplayName | Out-Null

    if ($LASTEXITCODE -ne 0) {
        Exit-Failure "sc.exe create failed with exit code $LASTEXITCODE"
    }

    # Set description (separate command - sc.exe create does not accept description)
    & sc.exe description $ServiceName $Description | Out-Null

    # Configure failure actions: restart after 5 s, 10 s, 30 s; reset counter daily
    & sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null

    Write-Log "Windows Service '$ServiceName' installed." 'OK'
}

# ── Start service ──────────────────────────────────────────────────────────────
function Start-AgentService {
    Write-Log 'Starting service...'
    Start-Service -Name $ServiceName -ErrorAction Stop
    Write-Log "Service started." 'OK'
}

# ── Health check ───────────────────────────────────────────────────────────────
function Test-AgentHealth {
    Write-Log "Verifying agent health at $HealthUrl ..."
    for ($i = 1; $i -le $HealthRetries; $i++) {
        Start-Sleep -Milliseconds $HealthDelayMs
        try {
            $resp = Invoke-RestMethod -Uri $HealthUrl -Method GET -TimeoutSec 3 -ErrorAction Stop
            if ($resp.status -eq 'ok') {
                Write-Log "Agent is healthy (fingerprintReady=$($resp.fingerprintReady), version=$($resp.version))." 'OK'
                return
            }
        } catch {
            Write-Log "  Health check attempt $i/$HealthRetries - waiting..." 'WARN'
        }
    }
    Exit-Failure "Agent health check failed after $HealthRetries attempts. Check Event Viewer for errors."
}

# ── Registry metadata ──────────────────────────────────────────────────────────
function Write-RegistryMetadata {
    Write-Log 'Writing registry metadata...'
    $now = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')

    if (-not (Test-Path $RegistryPath)) {
        New-Item -Path $RegistryPath -Force | Out-Null
    }

    # Preserve InstallDate if upgrading
    $existingInstallDateProp = Get-ItemProperty -Path $RegistryPath -Name 'InstallDate' -ErrorAction SilentlyContinue
    $existingInstallDate = $null
    if ($existingInstallDateProp) { $existingInstallDate = $existingInstallDateProp.InstallDate }
    $installDate = if ($existingInstallDate) { $existingInstallDate } else { $now }

    Set-ItemProperty -Path $RegistryPath -Name 'Version'         -Value $Version   -Type String
    Set-ItemProperty -Path $RegistryPath -Name 'InstallDir'      -Value $InstallDir -Type String
    Set-ItemProperty -Path $RegistryPath -Name 'InstallDate'     -Value $installDate -Type String
    Set-ItemProperty -Path $RegistryPath -Name 'LastUpgradeDate' -Value $now        -Type String
    Set-ItemProperty -Path $RegistryPath -Name 'Port'            -Value $Port       -Type DWord
    Set-ItemProperty -Path $RegistryPath -Name 'LogDir'          -Value $LogDir     -Type String

    Write-Log "Registry written: $RegistryPath" 'OK'
}

# ── Main ───────────────────────────────────────────────────────────────────────
function Main {
    # Ensure log directory exists before first Write-Log call
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }

    Write-Log ('=' * 70)
    Write-Log "SAMS Device Agent Installer v$Version"
    Write-Log "Install directory : $InstallDir"
    Write-Log "Port              : $Port"
    Write-Log "Frontend origin   : $(if ($FrontendOrigin) { $FrontendOrigin } else { '(none - CORS disabled)' })"
    Write-Log "Log file          : $LogFile"
    Write-Log ('=' * 70)

    Test-Prerequisites
    Initialize-Directories
    Stop-ExistingService
    Copy-Binary
    Register-EventLogSource
    Install-WindowsService
    Start-AgentService
    Test-AgentHealth
    Write-RegistryMetadata

    Write-Log ('=' * 70)
    Write-Log 'SAMS Device Agent installed and running successfully.' 'OK'
    Write-Log "Service  : $ServiceName"
    Write-Log "Location : $InstallDir"
    Write-Log "Endpoint : http://127.0.0.1:$Port/health"
    Write-Log "Log file : $LogFile"
    Write-Log ('=' * 70)
    exit 0
}

# Trap unexpected errors so they are always logged before exit
trap {
    $msg = $_.Exception.Message
    if (Test-Path (Split-Path $LogFile)) {
        Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [ERROR] Unhandled error: $msg" -Encoding UTF8
    }
    Write-Host "`nFATAL: $msg`nSee log: $LogFile" -ForegroundColor Red
    exit 1
}

Main

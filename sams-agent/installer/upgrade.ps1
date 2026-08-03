#Requires -RunAsAdministrator
<#
.SYNOPSIS
    SAMS Device Agent — in-place upgrade.

.DESCRIPTION
    Stops the running service, backs up the current binary, replaces it with
    the new version, starts the service, and verifies health. Rolls back
    automatically if the new version fails to start.

    Exit codes:
        0  — success
        1  — failure (rollback attempted if applicable)

.PARAMETER FrontendOrigin
    If provided, updates AllowedOrigins in appsettings.Production.json.
    Leave empty to preserve the existing CORS configuration.

.PARAMETER Port
    If provided, updates the Agent.Port in appsettings.Production.json.
    Leave empty to preserve the existing port.

.PARAMETER Force
    Proceed even if the new version is not newer than the installed version.

.PARAMETER Silent
    Suppress all console output except errors.

.EXAMPLE
    .\upgrade.ps1
    .\upgrade.ps1 -FrontendOrigin "https://sams.corp.com"
    .\upgrade.ps1 -Force
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string] $FrontendOrigin = '',
    [int]    $Port           = 0,
    [switch] $Force,
    [switch] $Silent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ServiceName  = 'SAMSAgent'
$ExeName      = 'SAMSAgent.exe'
$ConfigName   = 'appsettings.Production.json'
$RegistryPath = 'HKLM:\SOFTWARE\SAMS\Agent'
$ScriptDir    = $PSScriptRoot
$PublishDir   = Join-Path $ScriptDir 'publish'

# Read current install dir from registry
$InstallDir = 'C:\Program Files\SAMS\Agent'
$LogDir     = 'C:\ProgramData\SAMS\Agent\Logs'
try {
    $reg = Get-ItemProperty -Path $RegistryPath -ErrorAction SilentlyContinue
    if ($reg -and $reg.InstallDir) { $InstallDir = $reg.InstallDir }
    if ($reg -and $reg.LogDir)     { $LogDir     = $reg.LogDir }
} catch {}

$LogFile    = Join-Path $LogDir 'upgrade.log'
$HealthPort = 48763
try {
    $reg2 = Get-ItemProperty -Path $RegistryPath -ErrorAction SilentlyContinue
    if ($reg2 -and $reg2.Port) { $HealthPort = [int]$reg2.Port }
} catch {}
if ($Port -ne 0) { $HealthPort = $Port }
$HealthUrl = "http://127.0.0.1:$HealthPort/health"

$BackupExt = '.bak'
$DstExe    = Join-Path $InstallDir $ExeName
$BakExe    = "$DstExe$BackupExt"
$SrcExe    = Join-Path $PublishDir $ExeName
$SrcConfig = Join-Path $PublishDir $ConfigName
$DstConfig = Join-Path $InstallDir $ConfigName

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $ts   = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "[$ts] [$Level] $Message"
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
    if (-not $Silent) {
        switch ($Level) {
            'ERROR' { Write-Host $line -ForegroundColor Red }
            'WARN'  { Write-Host $line -ForegroundColor Yellow }
            'OK'    { Write-Host $line -ForegroundColor Green }
            default { Write-Host $line }
        }
    }
}

function Get-ExeVersion {
    param([string]$Path)
    try { return [System.Diagnostics.FileVersionInfo]::GetVersionInfo($Path).FileVersion }
    catch { return '0.0.0.0' }
}

function Test-Health {
    for ($i = 1; $i -le 15; $i++) {
        Start-Sleep -Seconds 1
        try {
            $resp = Invoke-RestMethod -Uri $HealthUrl -Method GET -TimeoutSec 3 -ErrorAction Stop
            if ($resp.status -eq 'ok') { return $true }
        } catch {}
    }
    return $false
}

function Stop-Agent {
    Write-Log 'Stopping service...'
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -eq $svc) { Write-Log 'Service not found — nothing to stop.' 'WARN'; return }
    if ($svc.Status -ne 'Stopped') {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        $waited = 0
        while ((Get-Service -Name $ServiceName).Status -ne 'Stopped' -and $waited -lt 12) {
            Start-Sleep -Seconds 1; $waited++
        }
    }
    Write-Log 'Service stopped.' 'OK'
}

function Start-Agent {
    Write-Log 'Starting service...'
    Start-Service -Name $ServiceName -ErrorAction Stop
    Write-Log 'Service started.' 'OK'
}

function Restore-Backup {
    Write-Log 'Rolling back to previous version...' 'WARN'
    Stop-Agent
    if (Test-Path $BakExe) {
        Copy-Item -Path $BakExe -Destination $DstExe -Force
        Remove-Item -Path $BakExe -Force -ErrorAction SilentlyContinue
        Write-Log 'Backup restored.' 'OK'
        Start-Agent
        if (Test-Health) {
            Write-Log 'Previous version running successfully after rollback.' 'OK'
        } else {
            Write-Log 'Previous version also failed health check. Manual intervention required.' 'ERROR'
        }
    } else {
        Write-Log 'No backup found — manual recovery required.' 'ERROR'
    }
}

function Main {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

    Write-Log ('=' * 65)
    Write-Log 'SAMS Device Agent — Upgrade'

    # ── Version check ──────────────────────────────────────────────
    if (-not (Test-Path $SrcExe)) {
        Write-Log "Source binary not found: $SrcExe" 'ERROR'; exit 1
    }

    $newVer      = Get-ExeVersion $SrcExe
    $installedVer = if (Test-Path $DstExe) { Get-ExeVersion $DstExe } else { '0.0.0.0' }

    Write-Log "Installed version : $installedVer"
    Write-Log "New version       : $newVer"

    $cmp = [System.Version]::Parse($newVer).CompareTo([System.Version]::Parse($installedVer))
    if ($cmp -le 0 -and -not $Force) {
        Write-Log "New version ($newVer) is not newer than installed ($installedVer). Use -Force to override." 'WARN'
        exit 0
    }

    Write-Log ('=' * 65)

    # ── Upgrade sequence ───────────────────────────────────────────
    Stop-Agent

    Write-Log 'Backing up current binary...'
    if (Test-Path $DstExe) {
        Copy-Item -Path $DstExe -Destination $BakExe -Force
        Write-Log "  Backup: $BakExe"
    }

    Write-Log 'Copying new binary...'
    Copy-Item -Path $SrcExe -Destination $DstExe -Force
    Write-Log "  Installed: $DstExe" 'OK'

    # Update config if new version ships a config and/or overrides are provided
    if (Test-Path $SrcConfig) {
        Copy-Item -Path $SrcConfig -Destination $DstConfig -Force
        Write-Log "  Updated: $ConfigName"
    }

    if ($FrontendOrigin -or $Port -ne 0) {
        if (Test-Path $DstConfig) {
            $cfg = Get-Content $DstConfig -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($FrontendOrigin) { $cfg.Agent.AllowedOrigins = @($FrontendOrigin); Write-Log "  Set AllowedOrigins: $FrontendOrigin" }
            if ($Port -ne 0)     { $cfg.Agent.Port = $Port; $HealthPort = $Port; Write-Log "  Set Port: $Port" }
            $cfg | ConvertTo-Json -Depth 10 | Set-Content -Path $DstConfig -Encoding UTF8
        }
    }

    Start-Agent

    Write-Log 'Verifying health after upgrade...'
    if (Test-Health) {
        # Clean up backup on success
        Remove-Item -Path $BakExe -Force -ErrorAction SilentlyContinue

        # Update registry
        $now = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')
        if (-not (Test-Path $RegistryPath)) { New-Item -Path $RegistryPath -Force | Out-Null }
        Set-ItemProperty -Path $RegistryPath -Name 'Version'         -Value $newVer -Type String
        Set-ItemProperty -Path $RegistryPath -Name 'LastUpgradeDate' -Value $now    -Type String
        if ($Port -ne 0) { Set-ItemProperty -Path $RegistryPath -Name 'Port' -Value $Port -Type DWord }

        Write-Log ('=' * 65)
        Write-Log "Upgrade from $installedVer to $newVer completed successfully." 'OK'
        Write-Log ('=' * 65)
        exit 0
    } else {
        Write-Log "Health check failed after upgrade to $newVer." 'ERROR'
        Restore-Backup
        exit 1
    }
}

trap {
    Write-Host "`nFATAL: $($_.Exception.Message)" -ForegroundColor Red
    try { Restore-Backup } catch {}
    exit 1
}

Main

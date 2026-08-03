#Requires -RunAsAdministrator
<#
.SYNOPSIS
    SAMS Device Agent — uninstaller.

.DESCRIPTION
    Stops and removes the SAMS Device Agent Windows Service, removes the
    installation directory, and cleans up registry entries.

    Exit codes:
        0  — success
        1  — failure

.PARAMETER RemoveLogs
    Also delete the log directory (C:\ProgramData\SAMS\Agent\Logs).
    Default: keep logs.

.PARAMETER Silent
    Suppress all console output except errors.

.EXAMPLE
    .\uninstall.ps1
    .\uninstall.ps1 -RemoveLogs -Silent
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [switch] $RemoveLogs,
    [switch] $Silent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ServiceName  = 'SAMSAgent'
$ExeName      = 'SAMSAgent.exe'
$RegistryPath = 'HKLM:\SOFTWARE\SAMS\Agent'
$LogDir       = 'C:\ProgramData\SAMS\Agent\Logs'
$LogFile      = Join-Path $LogDir 'uninstall.log'

# Read install dir from registry (falls back to default)
$InstallDir = 'C:\Program Files\SAMS\Agent'
try {
    $reg = Get-ItemProperty -Path $RegistryPath -ErrorAction SilentlyContinue
    if ($reg -and $reg.InstallDir) { $InstallDir = $reg.InstallDir }
} catch {}

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

function Main {
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }

    Write-Log ('=' * 60)
    Write-Log 'SAMS Device Agent — Uninstall'
    Write-Log "Install directory : $InstallDir"
    Write-Log ('=' * 60)

    # ── Stop service ──────────────────────────────────────────────
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Log "Stopping service '$ServiceName' (Status: $($svc.Status))..."
        if ($svc.Status -ne 'Stopped') {
            Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
            $waited = 0
            while ($waited -lt 10) {
                Start-Sleep -Seconds 1
                $waited++
                $svcCheck = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
                if ($null -eq $svcCheck -or $svcCheck.Status -eq 'Stopped') { break }
            }
        }

        # Force-kill if still running
        $proc = Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($ExeName)) -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Log 'Force-stopping residual process...' 'WARN'
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
        Write-Log 'Service stopped.' 'OK'

        # ── Delete service ─────────────────────────────────────────
        Write-Log "Deleting service registration..."
        & sc.exe delete $ServiceName | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Log "sc.exe delete returned $LASTEXITCODE - service may already be removed." 'WARN'
        } else {
            Write-Log 'Service deleted.' 'OK'
        }
    } else {
        Write-Log "Service '$ServiceName' not found - skipping." 'WARN'
    }

    # ── Remove Event Log source ────────────────────────────────────
    try {
        if ([System.Diagnostics.EventLog]::SourceExists('SAMS Device Agent')) {
            Remove-EventLog -Source 'SAMS Device Agent' -ErrorAction SilentlyContinue
            Write-Log 'Event Log source removed.' 'OK'
        }
    } catch {
        Write-Log "Event Log source removal warning: $_" 'WARN'
    }

    # ── Remove install directory ───────────────────────────────────
    if (Test-Path $InstallDir) {
        Write-Log "Removing install directory: $InstallDir"
        # Brief wait so SCM releases the binary
        Start-Sleep -Seconds 2
        Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $InstallDir) {
            Write-Log "Could not fully remove $InstallDir - some files may be locked. Manual cleanup may be required." 'WARN'
        } else {
            Write-Log 'Install directory removed.' 'OK'
        }
    } else {
        Write-Log "Install directory not found: $InstallDir" 'WARN'
    }

    # Remove parent SAMS dir if empty
    $parentDir = Split-Path $InstallDir -Parent
    if ((Test-Path $parentDir) -and (Get-ChildItem $parentDir -ErrorAction SilentlyContinue).Count -eq 0) {
        Remove-Item -Path $parentDir -Force -ErrorAction SilentlyContinue
    }

    # ── Remove log directory (optional) ───────────────────────────
    if ($RemoveLogs -and (Test-Path $LogDir)) {
        Write-Log "Removing log directory: $LogDir"
        Remove-Item -Path $LogDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log 'Log directory removed.' 'OK'
    } else {
        Write-Log "Log directory preserved: $LogDir"
    }

    # ── Remove registry entries ────────────────────────────────────
    if (Test-Path $RegistryPath) {
        Remove-Item -Path $RegistryPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Log 'Registry entries removed.' 'OK'
    }

    # Remove parent SAMS registry key if now empty
    $parentKey = Split-Path $RegistryPath -Parent
    $remaining = (Get-ChildItem -Path $parentKey -ErrorAction SilentlyContinue)
    if ($remaining.Count -eq 0) {
        Remove-Item -Path $parentKey -Force -ErrorAction SilentlyContinue
    }

    Write-Log ('=' * 60)
    Write-Log 'SAMS Device Agent uninstalled successfully.' 'OK'
    Write-Log ('=' * 60)
    exit 0
}

trap {
    Write-Host "`nFATAL: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Main

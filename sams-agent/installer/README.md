# SAMS Device Agent — Installer & Deployment Guide

## Overview

The SAMS Device Agent is a Windows Service that generates a hardware fingerprint
for the machine it runs on and exposes it to the SAMS web application via a local
HTTP API on `http://127.0.0.1:48763`.

## Requirements

| Requirement | Minimum |
|---|---|
| Windows version | Windows 10 1809 (build 17763) or Windows Server 2019 |
| Architecture | x64 |
| Administrator | Required for installation |
| .NET runtime | **Not required** — installer is fully self-contained |
| WMI service | Must be running (default on all Windows editions) |

---

## Building the Installer

```powershell
# Standard build (outputs installer/output/SAMSAgentSetup-{version}.exe)
.\build-installer.ps1

# Signed build (requires Windows SDK with signtool.exe)
.\build-installer.ps1 -CertThumbprint "A1B2C3D4E5F6..."

# Skip dotnet publish (recompile .iss only)
.\build-installer.ps1 -SkipPublish
```

Inno Setup 6 must be installed. Download from https://jrsoftware.org/isdl.php

---

## Deployment Methods

### Method 1 — GUI Installer (recommended for individual machines)

1. Run `SAMSAgentSetup-{version}.exe` as Administrator
2. Follow the wizard. Optionally enter the SAMS frontend URL for CORS configuration
3. The installer starts the service and verifies it is healthy before completing
4. Open the SAMS web application — the login page detects the agent automatically

### Method 2 — Silent Install (MDM / SCCM / Group Policy)

```powershell
# Basic silent install
SAMSAgentSetup-1.0.0.exe /SILENT /SUPPRESSMSGBOXES

# With CORS configuration
SAMSAgentSetup-1.0.0.exe /SILENT /SUPPRESSMSGBOXES /ORIGIN="https://sams.corp.com"
```

Exit code 0 = success, non-zero = failure.

### Method 3 — PowerShell (most flexible, no GUI)

```powershell
# Run as Administrator
.\install.ps1

# With all options
.\install.ps1 `
    -InstallDir    "C:\Program Files\SAMS\Agent" `
    -FrontendOrigin "https://sams.corp.com" `
    -Port          48763 `
    -LogDir        "C:\ProgramData\SAMS\Agent\Logs"

# Headless / CI
.\install.ps1 -FrontendOrigin "https://sams.corp.com" -Silent
```

---

## Upgrade

```powershell
# In-place upgrade (preserves config, rolls back on failure)
.\upgrade.ps1

# With updated frontend origin
.\upgrade.ps1 -FrontendOrigin "https://sams-new.corp.com"

# Force downgrade or re-install same version
.\upgrade.ps1 -Force
```

The upgrade script:
1. Stops the service
2. Backs up the current binary to `SAMSAgent.exe.bak`
3. Replaces the binary
4. Starts the service and verifies health
5. On success: removes backup, updates registry
6. On failure: restores backup, restarts old version

---

## Uninstall

```powershell
# Standard uninstall (preserves logs)
.\uninstall.ps1

# Remove logs too
.\uninstall.ps1 -RemoveLogs
```

Or: **Windows Settings → Apps → SAMS Device Agent → Uninstall**

---

## Verifying Installation

```powershell
# Service status
Get-Service SAMSAgent

# Health endpoint (agent must be running)
Invoke-RestMethod http://127.0.0.1:48763/health

# Device fingerprint (available ~2 s after service start)
Invoke-RestMethod http://127.0.0.1:48763/device

# Last 20 Event Log entries
Get-EventLog -LogName Application -Source "SAMS Device Agent" -Newest 20

# Installation log
Get-Content "C:\ProgramData\SAMS\Agent\Logs\install.log" -Tail 40
```

---

## Registry Metadata

`HKEY_LOCAL_MACHINE\SOFTWARE\SAMS\Agent`

| Value | Type | Description |
|---|---|---|
| `Version` | REG_SZ | Installed version string |
| `InstallDir` | REG_SZ | Installation directory |
| `InstallDate` | REG_SZ | ISO 8601 date of first installation |
| `LastUpgradeDate` | REG_SZ | ISO 8601 date of most recent upgrade |
| `Port` | REG_DWORD | Agent port number |
| `LogDir` | REG_SZ | Log directory path |

---

## File Layout After Installation

```
C:\Program Files\SAMS\Agent\
├── SAMSAgent.exe                 Windows Service binary (self-contained)
├── appsettings.Production.json   Production configuration
├── install.ps1                   PowerShell installer (for reference / re-use)
├── uninstall.ps1                 PowerShell uninstaller
└── upgrade.ps1                   PowerShell upgrade script

C:\ProgramData\SAMS\Agent\Logs\
├── install.log                   Installation log
├── upgrade.log                   Upgrade log(s)
└── uninstall.log                 Uninstall log
```

---

## Configuration Reference

`appsettings.Production.json` controls the agent behaviour at runtime.

```json
{
  "Agent": {
    "Port": 48763,
    "Host": "127.0.0.1",
    "Version": "1.0.0",
    "AllowedOrigins": ["https://sams.yourorg.com"]
  },
  "Logging": {
    "LogLevel": { "Default": "Warning", "SAMSAgent": "Information" }
  }
}
```

After editing this file, restart the service:

```powershell
Restart-Service SAMSAgent
```

---

## Troubleshooting

| Symptom | Resolution |
|---|---|
| Service won't start | Check Event Viewer → Windows Logs → Application, source "SAMS Device Agent" |
| `fingerprintError: true` on `/health` | WMI may be stopped. Run `Start-Service winmgmt` then restart the agent |
| `fingerprintReady: false` stays indefinitely | WMI queries are slow. Wait 30 s, then check Event Log |
| Port conflict | Change `Agent.Port` in `appsettings.Production.json` and restart. Update the SAMS frontend `AGENT_BASE` constant to match |
| CORS error in browser | Set `Agent.AllowedOrigins` to your SAMS frontend URL. Leave empty if the browser and service run on the same machine |
| Login page doesn't detect agent | The SAMS frontend polls every 2 s. Wait up to 5 s after the service starts. If the page never advances, open DevTools → Console for errors |

---

## Code Signing

The installer is prepared for code signing but ships unsigned by default.
To sign for production distribution:

1. Obtain a Code Signing certificate (EV recommended for SmartScreen bypass)
2. Build with: `.\build-installer.ps1 -CertThumbprint "<SHA1_thumbprint>"`
3. Uncomment the `SignTool` lines in `SAMSAgent.iss` for permanent signing

---

## Automatic Detection in the SAMS Frontend

The SAMS login page (`app/login/page.jsx`) uses `lib/device/agent.js` which:

1. Polls `GET http://127.0.0.1:48763/health` every 2 s until the agent responds
2. Once `fingerprintReady = true`, calls `GET /device` for the hardware fingerprint  
3. Posts the fingerprint to `POST /api/devices/validate` on the SAMS backend
4. Shows the login form only if the device status is `approved`

No browser refresh is required after installation.

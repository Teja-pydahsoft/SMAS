<#
.SYNOPSIS
    Build the SAMS Device Agent installer.

.DESCRIPTION
    Runs dotnet publish, extracts the binary version, patches SAMSAgent.iss,
    and compiles it with Inno Setup (ISCC.exe) to produce a single-file
    signed or unsigned Windows installer.

    Output: installer/output/SAMSAgentSetup-{version}.exe

.PARAMETER Configuration
    .NET publish configuration. Default: Release.

.PARAMETER CertThumbprint
    SHA-1 thumbprint of a code-signing certificate in the local certificate
    store. When provided, the installer exe is signed with signtool.exe.
    Leave empty to skip signing (development / internal builds).

.PARAMETER SkipPublish
    Skip the dotnet publish step and use whatever is already in installer/publish/.
    Useful when iterating on the installer script only.

.EXAMPLE
    .\build-installer.ps1
    .\build-installer.ps1 -CertThumbprint "A1B2C3D4E5F6..."
    .\build-installer.ps1 -SkipPublish
#>
[CmdletBinding()]
param(
    [string] $Configuration  = 'Release',
    [string] $CertThumbprint = '',
    [switch] $SkipPublish
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$AgentRoot  = Join-Path (Split-Path $PSScriptRoot -Parent) 'SAMSAgent'
$PublishDir = Join-Path $PSScriptRoot 'publish'
$OutputDir  = Join-Path $PSScriptRoot 'output'
$IssFile    = Join-Path $PSScriptRoot 'SAMSAgent.iss'
$ExeName    = 'SAMSAgent.exe'

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " SAMS Device Agent -- Build Installer" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: dotnet publish ─────────────────────────────────────────────────────
if (-not $SkipPublish) {
    Write-Host '[1/5] Running dotnet publish...' -ForegroundColor Cyan
    & dotnet publish "$AgentRoot\SAMSAgent.csproj" `
        --configuration $Configuration `
        --runtime win-x64 `
        --self-contained true `
        -p:PublishSingleFile=true `
        -p:PublishTrimmed=false `
        --output $PublishDir

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: dotnet publish failed (exit $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Published to: $PublishDir" -ForegroundColor Green
}
else {
    Write-Host '[1/5] Skipping dotnet publish (-SkipPublish).' -ForegroundColor Yellow
}

# ── Step 2: extract version ────────────────────────────────────────────────────
Write-Host '[2/5] Reading binary version...' -ForegroundColor Cyan
$ExePath = Join-Path $PublishDir $ExeName
if (-not (Test-Path $ExePath)) {
    Write-Host "ERROR: Binary not found: $ExePath" -ForegroundColor Red
    exit 1
}
$FileVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($ExePath).FileVersion
if (-not $FileVersion) { $FileVersion = '1.0.0.0' }
$VersionParts = $FileVersion.Split('.')
$SemVer = '{0}.{1}.{2}' -f $VersionParts[0], $VersionParts[1], $VersionParts[2]
Write-Host "  Version: $SemVer" -ForegroundColor Green

# ── Step 3: compute SHA-256 ────────────────────────────────────────────────────
Write-Host '[3/5] Computing SHA-256 checksum...' -ForegroundColor Cyan
$Hash = (Get-FileHash -Path $ExePath -Algorithm SHA256).Hash.ToLower()
Write-Host "  SHA-256: $Hash" -ForegroundColor Green

$ChecksumFile = Join-Path $PublishDir 'SAMSAgent.sha256'
($Hash + '  ' + $ExeName) | Set-Content -Path $ChecksumFile -Encoding ASCII
Write-Host "  Checksum written: $ChecksumFile" -ForegroundColor Green

# ── Step 4: patch AppVersion in SAMSAgent.iss ─────────────────────────────────
Write-Host '[4/5] Patching SAMSAgent.iss with version...' -ForegroundColor Cyan
$issContent = Get-Content -Path $IssFile -Raw -Encoding UTF8
$issContent = $issContent -replace '#define AppVersion\s+"[^"]*"', ('#define AppVersion   "' + $SemVer + '"')
Set-Content -Path $IssFile -Value $issContent -Encoding UTF8
Write-Host "  AppVersion set to $SemVer" -ForegroundColor Green

# ── Step 5: compile with Inno Setup ───────────────────────────────────────────
Write-Host '[5/5] Compiling installer...' -ForegroundColor Cyan

$isccCandidates = @(
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe',
    'C:\Program Files (x86)\Inno Setup 5\ISCC.exe'
)
$iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
    Write-Host ""
    Write-Host "  Inno Setup (ISCC.exe) not found -- skipping GUI installer." -ForegroundColor Yellow
    Write-Host "  The published binary and SHA-256 are in: $PublishDir" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  To also build the .exe GUI installer:" -ForegroundColor Yellow
    Write-Host "    1. Download Inno Setup 6: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    Write-Host "    2. Install it, then re-run: .\build-installer.ps1" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  You can still install the service now using install.ps1" -ForegroundColor Yellow
    Write-Host ""

    if (-not (Test-Path $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }

    $releaseSummary = @{
        version     = $SemVer
        releaseDate = (Get-Date -Format 'yyyy-MM-dd')
        sha256      = $null
        exeSha256   = $Hash
    }
    $releaseSummary | ConvertTo-Json | Set-Content -Path (Join-Path $OutputDir 'release.json') -Encoding UTF8

    Write-Host "===========================================" -ForegroundColor Green
    Write-Host " PARTIAL BUILD -- dotnet publish succeeded" -ForegroundColor Green
    Write-Host "===========================================" -ForegroundColor Green
    Write-Host " Version    : $SemVer"
    Write-Host " Binary     : $ExePath"
    Write-Host " Binary SHA : $Hash"
    Write-Host " Next step  : Run .\install.ps1 as Administrator"
    Write-Host "===========================================" -ForegroundColor Green
    Write-Host ""
    exit 0
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

& $iscc $IssFile "/O$OutputDir"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: ISCC.exe failed (exit $LASTEXITCODE)" -ForegroundColor Red
    exit 1
}

$InstallerExe = Join-Path $OutputDir "SAMSAgentSetup-$SemVer.exe"
if (-not (Test-Path $InstallerExe)) {
    $found = Get-ChildItem -Path $OutputDir -Filter 'SAMSAgentSetup*.exe' |
             Sort-Object LastWriteTime -Descending |
             Select-Object -First 1
    if ($found) { $InstallerExe = $found.FullName }
}

# ── Optional: code sign the installer ─────────────────────────────────────────
if ($CertThumbprint -and $InstallerExe) {
    Write-Host ""
    Write-Host "Signing installer with certificate $CertThumbprint..." -ForegroundColor Cyan

    $signtool = $null
    $signtoolCmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($signtoolCmd) {
        $signtool = $signtoolCmd.Source
    }
    if (-not $signtool) {
        $sdkPaths = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' `
                        -Recurse -Filter 'signtool.exe' -ErrorAction SilentlyContinue
        if ($sdkPaths) {
            $signtool = ($sdkPaths | Sort-Object FullName -Descending | Select-Object -First 1).FullName
        }
    }

    if (-not $signtool) {
        Write-Host 'WARNING: signtool.exe not found -- skipping signing.' -ForegroundColor Yellow
    }
    else {
        & $signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /sha1 $CertThumbprint $InstallerExe
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'ERROR: Code signing failed.' -ForegroundColor Red
            exit 1
        }
        Write-Host 'Installer signed.' -ForegroundColor Green
    }
}

# ── Final output ──────────────────────────────────────────────────────────────
if ($InstallerExe -and (Test-Path $InstallerExe)) {
    $InstallerHash = (Get-FileHash -Path $InstallerExe -Algorithm SHA256).Hash.ToLower()

    Write-Host ""
    Write-Host "===========================================" -ForegroundColor Green
    Write-Host " BUILD SUCCESSFUL" -ForegroundColor Green
    Write-Host "===========================================" -ForegroundColor Green
    Write-Host " Version  : $SemVer"
    Write-Host " Output   : $InstallerExe"
    Write-Host " SHA-256  : $InstallerHash"
    Write-Host "===========================================" -ForegroundColor Green
    Write-Host ""

    $releaseSummary = @{
        version     = $SemVer
        releaseDate = (Get-Date -Format 'yyyy-MM-dd')
        sha256      = $InstallerHash
        exeSha256   = $Hash
    }
    $releaseSummary | ConvertTo-Json | Set-Content -Path (Join-Path $OutputDir 'release.json') -Encoding UTF8
    Write-Host " release.json written for Downloads page." -ForegroundColor Cyan
}
else {
    Write-Host 'WARNING: Could not locate installer output file.' -ForegroundColor Yellow
}

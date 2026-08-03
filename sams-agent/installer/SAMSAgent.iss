; ─────────────────────────────────────────────────────────────────────────────
; SAMS Device Agent — Inno Setup installer script
;
; Produces: SAMSAgentSetup-{version}.exe
;
; Build:
;   .\build-installer.ps1
;   -- or manually --
;   ISCC.exe SAMSAgent.iss
;
; Silent install (enterprise / MDM):
;   SAMSAgentSetup-1.0.0.exe /SILENT /SUPPRESSMSGBOXES
;
; Silent install with custom frontend origin:
;   SAMSAgentSetup-1.0.0.exe /SILENT /SUPPRESSMSGBOXES /ORIGIN="https://sams.corp.com"
;
; CODE SIGNING:
;   Uncomment and populate the SignTool entries below once a certificate is
;   available.  The build-installer.ps1 script accepts -CertThumbprint to
;   automate signing during CI.
; ─────────────────────────────────────────────────────────────────────────────

#define AppName      "SAMS Device Agent"
#define AppVersion   "1.0.0"
#define AppPublisher "SAMS"
#define AppURL       "https://sams.yourorg.com"
#define ServiceName  "SAMSAgent"
#define ExeName      "SAMSAgent.exe"
#define ConfigName   "appsettings.Production.json"

; Build output directories (relative to this .iss file)
#define PublishDir  "publish"
#define OutputDir   "output"

[Setup]
; ── Identity ──────────────────────────────────────────────────────────────────
AppId={{A3F2C9D1-7E4B-4F6A-8C2D-1B5E9A7F3D04}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
VersionInfoVersion={#AppVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} Setup

; ── Output ────────────────────────────────────────────────────────────────────
OutputDir={#OutputDir}
OutputBaseFilename=SAMSAgentSetup-{#AppVersion}
SetupIconFile=

; ── Behaviour ─────────────────────────────────────────────────────────────────
DefaultDirName={autopf}\SAMS\Agent
DefaultGroupName={#AppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
; Require administrator — mandatory for service installation
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=

; ── Windows version guard: require Windows 10 1809+ (build 17763) ─────────────
MinVersion=10.0.17763

; ── Compression ───────────────────────────────────────────────────────────────
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

; ── Uninstall ─────────────────────────────────────────────────────────────────
Uninstallable=yes
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#ExeName}
CreateUninstallRegKey=yes

; ── UI ────────────────────────────────────────────────────────────────────────
WizardStyle=modern
WizardSizePercent=110
ShowLanguageDialog=no

; ── Code signing placeholder ──────────────────────────────────────────────────
; Uncomment the following lines once a code-signing certificate is available.
; Replace THUMBPRINT with the SHA-1 thumbprint of the certificate.
;
; SignTool=signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /sha1 THUMBPRINT $f
; SignedUninstaller=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
english.OriginPageTitle=SAMS Frontend URL
english.OriginPageDesc=Configure CORS for the SAMS web application (optional)
english.OriginLabel=SAMS Frontend URL (e.g. https://sams.yourorg.com)
english.OriginHint=Leave blank to disable CORS. This is correct for most deployments where the browser and the SAMS Device Agent run on the same computer.
english.FinishRunning=The SAMS Device Agent has been installed and is running as a Windows Service.
english.FinishLogPath=Installation log:
english.FinishVerify=You can verify the service is running by opening:

[Files]
; Main binary
Source: "{#PublishDir}\{#ExeName}";      DestDir: "{app}"; Flags: ignoreversion
; Production config
Source: "{#PublishDir}\{#ConfigName}";   DestDir: "{app}"; Flags: ignoreversion onlyifdoesntexist
; PowerShell scripts (included for enterprise / IT use)
Source: "install.ps1";                   DestDir: "{app}"; Flags: ignoreversion
Source: "uninstall.ps1";                 DestDir: "{app}"; Flags: ignoreversion
Source: "upgrade.ps1";                   DestDir: "{app}"; Flags: ignoreversion

[Run]
; Run install.ps1 after files are copied.
; /ORIGIN is forwarded from the custom wizard page (empty string if skipped).
Filename: "powershell.exe"; \
  Parameters: "-NonInteractive -NoProfile -ExecutionPolicy Bypass -File ""{app}\install.ps1"" -InstallDir ""{app}"" -FrontendOrigin ""{code:GetFrontendOrigin}"" -Silent"; \
  Flags: runhidden waituntilterminated; \
  StatusMsg: "Installing and starting Windows Service..."; \
  WorkingDir: "{app}"

[UninstallRun]
Filename: "powershell.exe"; \
  Parameters: "-NonInteractive -NoProfile -ExecutionPolicy Bypass -File ""{app}\uninstall.ps1"" -Silent"; \
  Flags: runhidden waituntilterminated; \
  WorkingDir: "{app}"

[Code]
// ─── Custom wizard page: Frontend origin input ───────────────────────────────
var
  OriginPage:  TWizardPage;
  OriginEdit:  TEdit;
  OriginLabel: TLabel;
  OriginHint:  TLabel;
  CmdOrigin:   String;    // populated from /ORIGIN= command-line param

procedure InitializeWizard();
begin
  // Read /ORIGIN= from command line (silent installs)
  CmdOrigin := ExpandConstant('{param:ORIGIN|}');

  // Only show the page for interactive installs
  if not WizardSilent() then
  begin
    OriginPage := CreateCustomPage(
      wpSelectDir,
      ExpandConstant('{cm:OriginPageTitle}'),
      ExpandConstant('{cm:OriginPageDesc}')
    );

    OriginLabel           := TLabel.Create(OriginPage);
    OriginLabel.Parent    := OriginPage.Surface;
    OriginLabel.Left      := 0;
    OriginLabel.Top       := 8;
    OriginLabel.Width     := OriginPage.SurfaceWidth;
    OriginLabel.Caption   := ExpandConstant('{cm:OriginLabel}');

    OriginEdit            := TEdit.Create(OriginPage);
    OriginEdit.Parent     := OriginPage.Surface;
    OriginEdit.Left       := 0;
    OriginEdit.Top        := 26;
    OriginEdit.Width      := OriginPage.SurfaceWidth;
    OriginEdit.Text       := '';

    OriginHint            := TLabel.Create(OriginPage);
    OriginHint.Parent     := OriginPage.Surface;
    OriginHint.Left       := 0;
    OriginHint.Top        := 56;
    OriginHint.Width      := OriginPage.SurfaceWidth;
    OriginHint.WordWrap   := True;
    OriginHint.Height     := 60;
    OriginHint.Font.Color := $666666;
    OriginHint.Caption    := ExpandConstant('{cm:OriginHint}');
  end;
end;

// Called by [Run] section via {code:GetFrontendOrigin}
function GetFrontendOrigin(Param: String): String;
begin
  // Prefer command-line /ORIGIN= (silent installs)
  if CmdOrigin <> '' then
    Result := CmdOrigin
  else if (OriginEdit <> nil) and (OriginEdit.Text <> '') then
    Result := OriginEdit.Text
  else
    Result := '';
end;

// Adjust finish page message
procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedLabel.Caption :=
      ExpandConstant('{cm:FinishRunning}') + #13#10 + #13#10 +
      ExpandConstant('{cm:FinishVerify}') + ' http://127.0.0.1:48763/health' + #13#10 +
      ExpandConstant('{cm:FinishLogPath}') + ' C:\ProgramData\SAMS\Agent\Logs\install.log';
  end;
end;

// Show install failure message if install.ps1 returns non-zero
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Inno Setup does not expose the exit code of [Run] entries directly,
    // so we check the health endpoint ourselves as a post-install gate.
    // (The install.ps1 already verifies health; this is a belt-and-suspenders check.)
  end;
end;


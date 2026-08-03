'use client';

import { useState } from 'react';
import { CURRENT_RELEASE, VERSION_HISTORY } from '@/lib/device/releaseManifest';

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}

// ─── SHA-256 copy widget ──────────────────────────────────────────────────────

function HashDisplay({ hash }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available — silently ignore
    }
  }

  return (
    <div className="dm-dl-hash">
      <code className="dm-dl-hash__value">{hash}</code>
      <button
        type="button"
        className="dm-dl-hash__copy"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy SHA-256 hash'}
        title={copied ? 'Copied!' : 'Copy to clipboard'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}

// ─── Installation guide ───────────────────────────────────────────────────────

function InstallationGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="dm-dl-guide">
      <button
        type="button"
        className={`dm-dl-guide__toggle${open ? ' dm-dl-guide__toggle--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <InfoIcon />
        Installation Guide
        <span className="dm-dl-guide__chevron" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="dm-dl-guide__body">

          <div className="dm-dl-guide__section">
            <h4>Requirements</h4>
            <ul>
              <li>Windows 10 (version 1809 or later) or Windows Server 2019 or later</li>
              <li>Administrator privileges (required for Windows Service installation)</li>
              <li>.NET runtime is <strong>not</strong> required — the installer is fully self-contained</li>
              <li>WMI service must be running (enabled by default on all Windows editions)</li>
            </ul>
          </div>

          <div className="dm-dl-guide__section">
            <h4>Method 1 — GUI Installer (recommended)</h4>
            <ol>
              <li>Download <code>SAMSAgentSetup-{CURRENT_RELEASE.version}.exe</code></li>
              <li>Right-click → <strong>Run as administrator</strong></li>
              <li>Follow the wizard. Optionally enter the SAMS frontend URL for CORS configuration</li>
              <li>The installer will automatically start the Windows Service and verify it is running</li>
              <li>Return to this browser tab — the login page will detect the agent automatically</li>
            </ol>
          </div>

          <div className="dm-dl-guide__section">
            <h4>Method 2 — Silent / Enterprise Deployment</h4>
            <p>For MDM, SCCM, Group Policy, or scripted rollout:</p>
            <pre className="dm-dl-code">{`# Inno Setup silent install (no UI)
SAMSAgentSetup-${CURRENT_RELEASE.version}.exe /SILENT /SUPPRESSMSGBOXES

# PowerShell direct install (most flexible)
.\\install.ps1 -FrontendOrigin "https://sams.yourorg.com"

# Verify service is running after deployment
Get-Service SAMSAgent | Select-Object Status, StartType`}</pre>
          </div>

          <div className="dm-dl-guide__section">
            <h4>Method 3 — Upgrade</h4>
            <pre className="dm-dl-code">{`.\\upgrade.ps1 -FrontendOrigin "https://sams.yourorg.com"
# Or run the GUI installer over an existing installation — it detects the
# installed version automatically and performs a clean in-place upgrade.`}</pre>
          </div>

          <div className="dm-dl-guide__section">
            <h4>Uninstall</h4>
            <pre className="dm-dl-code">{`# Silent uninstall via PowerShell
.\\uninstall.ps1

# Or via Windows Settings → Apps → SAMS Device Agent → Uninstall
# Logs are preserved in C:\\ProgramData\\SAMS\\Agent\\Logs by default.
# Pass -RemoveLogs to also delete logs.`}</pre>
          </div>

          <div className="dm-dl-guide__section">
            <h4>Verifying installation</h4>
            <pre className="dm-dl-code">{`# Check service status
Get-Service SAMSAgent

# Check health endpoint (agent must be running)
Invoke-RestMethod http://127.0.0.1:48763/health

# View installation log
Get-Content "C:\\ProgramData\\SAMS\\Agent\\Logs\\install.log" -Tail 30

# View Windows Event Log entries
Get-EventLog -LogName Application -Source "SAMS Device Agent" -Newest 20`}</pre>
          </div>

          <div className="dm-dl-guide__section">
            <h4>Registry metadata written by the installer</h4>
            <p><code>HKEY_LOCAL_MACHINE\SOFTWARE\SAMS\Agent</code></p>
            <ul>
              <li><code>Version</code> — installed version string</li>
              <li><code>InstallDir</code> — installation directory path</li>
              <li><code>InstallDate</code> — ISO 8601 date of initial installation</li>
              <li><code>LastUpgradeDate</code> — ISO 8601 date of most recent upgrade</li>
            </ul>
          </div>

          <div className="dm-dl-guide__section">
            <h4>Troubleshooting</h4>
            <ul>
              <li><strong>Service won't start:</strong> Check Event Viewer → Windows Logs → Application for errors from source "SAMS Device Agent"</li>
              <li><strong>fingerprintError = true:</strong> WMI service may be stopped. Run <code>Start-Service winmgmt</code> then restart the agent</li>
              <li><strong>Port 48763 conflict:</strong> Change <code>Agent.Port</code> in <code>appsettings.Production.json</code> and restart the service. Update the frontend <code>AGENT_BASE</code> constant to match</li>
              <li><strong>CORS errors in browser:</strong> Set <code>Agent.AllowedOrigins</code> in <code>appsettings.Production.json</code> to your SAMS frontend URL</li>
            </ul>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DeviceDownloads() {
  const r = CURRENT_RELEASE;
  const hasDownload = Boolean(r.downloadUrl);

  return (
    <div className="dm-downloads">

      {/* ── Current release card ── */}
      <div className="dm-dl-card admin-panel">
        <div className="dm-dl-card__header">
          <div className="dm-dl-card__title-row">
            <div className={`admin-metric-card__icon admin-metric-card__icon--primary`}>
              <ShieldIcon />
            </div>
            <div>
              <h3 className="dm-dl-card__title">SAMS Device Agent</h3>
              <p className="dm-dl-card__sub">Windows Service · x64 · Self-contained</p>
            </div>
          </div>
          <span className="badge badge-success dm-dl-card__version-badge">
            v{r.version}
          </span>
        </div>

        <div className="dm-dl-meta-grid">
          <div className="dm-dl-meta-item">
            <span className="dm-dl-meta-label">Current Version</span>
            <span className="dm-dl-meta-value">{r.version}</span>
          </div>
          <div className="dm-dl-meta-item">
            <span className="dm-dl-meta-label">Release Date</span>
            <span className="dm-dl-meta-value">{r.releaseDate}</span>
          </div>
          <div className="dm-dl-meta-item">
            <span className="dm-dl-meta-label">File Size</span>
            <span className="dm-dl-meta-value">{r.fileSize ?? '—'}</span>
          </div>
          <div className="dm-dl-meta-item">
            <span className="dm-dl-meta-label">Platform</span>
            <span className="dm-dl-meta-value">Windows x64</span>
          </div>
        </div>

        {/* SHA-256 */}
        <div className="dm-dl-section">
          <p className="dm-dl-section-label">SHA-256 Checksum</p>
          {r.sha256 ? (
            <>
              <HashDisplay hash={r.sha256} />
              <p className="dm-dl-hash__hint">
                Verify after download:{' '}
                <code>Get-FileHash SAMSAgentSetup-{r.version}.exe -Algorithm SHA256</code>
              </p>
            </>
          ) : (
            <p className="dm-dl-hash__hint">
              Not yet available. Run <code>.\build-installer.ps1</code> to generate the checksum.
            </p>
          )}
        </div>

        {/* Release notes */}
        <div className="dm-dl-section">
          <p className="dm-dl-section-label">Release Notes</p>
          <ul className="dm-dl-notes">
            {r.releaseNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>

        {/* Download button */}
        <div className="dm-dl-actions">
          {hasDownload ? (
            <a
              href={r.downloadUrl}
              download
              className="btn-primary dm-dl-btn"
            >
              <DownloadIcon />
              Download SAMSAgentSetup-{r.version}.exe
            </a>
          ) : (
            <div className="dm-dl-unavailable">
              <InfoIcon />
              <span>
                No download URL configured. Build the installer using{' '}
                <code>installer/build-installer.ps1</code> and host the output{' '}
                <code>.exe</code>, then set <code>downloadUrl</code> in{' '}
                <code>components/devices/DeviceDownloads.jsx</code>.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Installation guide (collapsible) ── */}
      <InstallationGuide />

      {/* ── Version history ── */}
      <div className="admin-panel">
        <div className="admin-panel__head">
          <h2>Version History</h2>
        </div>
        <div className="table-scroll">
          <table className="reg-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Release Date</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {VERSION_HISTORY.map((v) => (
                <tr key={v.version}>
                  <td>
                    <code className="dm-dl-version-code">{v.version}</code>
                    {v.version === r.version && (
                      <span className="badge badge-success" style={{ marginLeft: 8 }}>Current</span>
                    )}
                  </td>
                  <td>{v.releaseDate}</td>
                  <td>{v.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

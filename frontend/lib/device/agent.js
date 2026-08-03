/**
 * lib/device/agent.js
 *
 * All communication with the local SAMS Device Agent (Windows Service).
 * The agent runs at http://127.0.0.1:48763 and exposes two endpoints:
 *
 *   GET /health  → { status, version, fingerprintReady, fingerprintError, timestamp }
 *   GET /device  → { fingerprint, deviceName, computerName, operatingSystem, agentVersion, timestamp }
 *
 * This module owns:
 *   - runDeviceAgentCheck()  async pipeline, drives caller through phase state machine
 *   - useDeviceAgent()       React hook for the login gate
 *
 * Polling behaviour:
 *   • While the agent is not yet reachable (not_installed), the pipeline
 *     keeps polling every NOT_INSTALLED_POLL_MS so the login page
 *     automatically continues the moment the service starts — no browser
 *     refresh or user interaction required (Requirements 3 & 4).
 *   • While the agent is initialising (fingerprintReady=false), the pipeline
 *     polls every POLL_INTERVAL_MS until ready or MAX_POLL_ATTEMPTS is hit.
 *   • On success (approved) no further polling happens.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_BASE       = 'http://127.0.0.1:48763';
const AGENT_HEALTH_URL = `${AGENT_BASE}/health`;
const AGENT_DEVICE_URL = `${AGENT_BASE}/device`;

/** Timeout for a single fetch to the agent. */
const AGENT_TIMEOUT_MS = 3_000;

/** Poll interval while agent is initialising (fingerprintReady=false). */
const POLL_INTERVAL_MS = 1_200;

/** Max initialisation polls before declaring a soft agent_error. */
const MAX_POLL_ATTEMPTS = 30;

/**
 * Poll interval while the agent is not yet installed/reachable.
 * Kept longer than POLL_INTERVAL_MS to avoid hammering the loopback
 * interface, but short enough that the user sees the login form appear
 * within 2–3 seconds of the service starting.
 */
const NOT_INSTALLED_POLL_MS = 2_000;

/** POST /api/devices/validate — relative path proxied by Next.js. */
const VALIDATE_PATH = '/api/devices/validate';

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {'checking' | 'not_installed' | 'agent_error' | 'fetching_device' |
 *           'validating' | 'approved' | 'pending' | 'rejected' | 'blocked'} AgentPhase
 *
 * @typedef {{ phase: AgentPhase, errorMessage?: string, deviceMessage?: string }} AgentState
 */

// ─── Low-level helpers ────────────────────────────────────────────────────────

/**
 * Fetch with a hard timeout. Returns the parsed JSON body on success.
 * Throws on network error, non-2xx status, or timeout.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = AGENT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res  = await fetch(url, { ...options, signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || body.message || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Call GET /health on the local agent.
 * Returns the parsed body, or throws if unreachable / timed out.
 */
async function fetchAgentHealth() {
  return fetchWithTimeout(AGENT_HEALTH_URL, { method: 'GET' });
}

/**
 * Call GET /device on the local agent.
 * Returns the parsed body, or throws if not ready (503) or failed (500).
 */
async function fetchAgentDevice() {
  return fetchWithTimeout(AGENT_DEVICE_URL, { method: 'GET' });
}

/**
 * POST /api/devices/validate through the Next.js backend proxy.
 * Returns the validation result: { status, message? }
 */
async function validateFingerprint(fingerprint, deviceName, computerName, operatingSystem) {
  const res = await fetch(VALIDATE_PATH, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fingerprint, deviceName, computerName, operatingSystem }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || body.message || `Validation failed: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// ─── Core orchestration ───────────────────────────────────────────────────────

/**
 * Full device agent check pipeline.  Drives the caller through the
 * phase state machine by invoking `onPhase(phase, extra)` at each transition.
 *
 * NOT_INSTALLED behaviour:
 *   When the agent cannot be reached, the pipeline emits 'not_installed' so
 *   the UI can show the installation screen, then keeps polling silently.
 *   The moment the agent responds, the pipeline advances automatically —
 *   no browser refresh or user interaction needed (Requirements 3 & 4).
 *
 * @param {{ onPhase: (phase: AgentPhase, extra?: object) => void,
 *           signal:  AbortSignal }} options
 */
export async function runDeviceAgentCheck({ onPhase, signal }) {
  function aborted() { return signal?.aborted; }

  /** Interruptible sleep helper. */
  function sleep(ms) {
    return new Promise((resolve) => {
      const id = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
    });
  }

  // ── Phase 1: wait for agent to become reachable ────────────────────────────
  // Polls indefinitely (until aborted) so the login page auto-advances once
  // the Windows Service starts after a fresh installation.
  onPhase('checking');

  let healthData = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (aborted()) return;

    try {
      healthData = await fetchAgentHealth();
      // Agent responded — break out of the "not installed" polling loop
      break;
    } catch {
      if (aborted()) return;
      // Agent not reachable — show the install screen and keep waiting
      onPhase('not_installed');
      await sleep(NOT_INSTALLED_POLL_MS);
    }
  }

  if (aborted()) return;

  // ── Phase 2: wait for fingerprint to be ready ─────────────────────────────
  // Agent is running but may still be collecting WMI data at startup.
  let pollAttempts = 0;

  while (true) {
    if (aborted()) return;

    // Agent has a permanent hardware error — surface it and stop
    if (healthData.fingerprintError) {
      onPhase('agent_error', {
        errorMessage:
          'The Device Agent failed to generate a hardware fingerprint. '
          + 'This usually means the WMI service is unavailable or the agent lacks '
          + 'sufficient hardware data sources. Restart the SAMS Device Agent service to retry.',
      });
      return;
    }

    // Agent ready and healthy — proceed
    if (healthData.fingerprintReady) break;

    // Still initialising — show checking screen and poll again
    onPhase('checking');

    if (pollAttempts >= MAX_POLL_ATTEMPTS) {
      onPhase('agent_error', {
        errorMessage:
          'The Device Agent is taking too long to initialize. '
          + 'The WMI service may be slow or unavailable. '
          + 'Restart the SAMS Device Agent service to retry.',
      });
      return;
    }

    pollAttempts += 1;
    await sleep(POLL_INTERVAL_MS);
    if (aborted()) return;

    try {
      healthData = await fetchAgentHealth();
    } catch {
      // Agent disappeared mid-startup — restart outer loop
      onPhase('not_installed');
      await sleep(NOT_INSTALLED_POLL_MS);
      if (aborted()) return;
      // Try to re-enter the ready-wait loop from scratch
      try {
        healthData = await fetchAgentHealth();
      } catch {
        onPhase('not_installed');
        // Restart the entire pipeline via tail-recursion-safe re-entry
        return runDeviceAgentCheck({ onPhase, signal });
      }
    }
  }

  if (aborted()) return;

  // ── Phase 3: retrieve fingerprint ─────────────────────────────────────────
  onPhase('fetching_device');

  let deviceData;
  try {
    deviceData = await fetchAgentDevice();
  } catch (err) {
    if (aborted()) return;
    onPhase('agent_error', {
      errorMessage: err.message || 'Failed to retrieve device fingerprint from the agent.',
    });
    return;
  }

  if (aborted()) return;

  const { fingerprint, deviceName, computerName, operatingSystem } = deviceData;

  if (!fingerprint) {
    onPhase('agent_error', {
      errorMessage: 'The Device Agent returned an empty fingerprint. Restart the service and try again.',
    });
    return;
  }

  // ── Phase 4: validate fingerprint with SAMS backend ───────────────────────
  onPhase('validating');

  let validation;
  try {
    validation = await validateFingerprint(fingerprint, deviceName, computerName, operatingSystem);
  } catch (err) {
    if (aborted()) return;
    onPhase('agent_error', {
      errorMessage: err.message || 'Could not reach the SAMS server to validate this device.',
    });
    return;
  }

  if (aborted()) return;

  // ── Phase 5: map backend status to final UI phase ─────────────────────────
  const { status, message, bootstrapRequired } = validation;

  if (status === 'approved') { onPhase('approved', { fingerprint }); return; }
  if (status === 'pending')  {
    onPhase('pending', {
      deviceMessage:    message,
      bootstrapRequired: Boolean(bootstrapRequired),
      fingerprint:      bootstrapRequired ? fingerprint : '',
    });
    return;
  }
  if (status === 'rejected') { onPhase('rejected', { deviceMessage: message }); return; }
  if (status === 'blocked')  { onPhase('blocked',  { deviceMessage: message }); return; }

  // 'unknown' — device registered but not yet in a known state
  onPhase('pending', {
    deviceMessage: 'This device has not been registered with SAMS. Please contact your administrator.',
  });
}

// ─── React hook ───────────────────────────────────────────────────────────────

/**
 * useDeviceAgent()
 *
 * Runs the device agent check pipeline on mount and exposes the current
 * phase + retry capability.
 *
 * Returns:
 *   phase          — current AgentPhase
 *   errorMessage   — set when phase === 'agent_error'
 *   deviceMessage  — set when phase === 'pending' | 'rejected' | 'blocked'
 *   retry          — function: restarts the full pipeline from scratch
 */
export function useDeviceAgent() {
  const [phase,             setPhase]             = useState(/** @type {AgentPhase} */ ('checking'));
  const [errorMessage,      setErrorMessage]      = useState('');
  const [deviceMessage,     setDeviceMessage]     = useState('');
  const [fingerprint,       setFingerprint]       = useState('');
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const abortRef = useRef(null);

  const run = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setPhase('checking');
    setErrorMessage('');
    setDeviceMessage('');
    setFingerprint('');
    setBootstrapRequired(false);

    runDeviceAgentCheck({
      signal: ctrl.signal,
      onPhase(p, extra = {}) {
        if (ctrl.signal.aborted) return;
        setPhase(p);
        if (extra.errorMessage      !== undefined) setErrorMessage(extra.errorMessage);
        if (extra.deviceMessage     !== undefined) setDeviceMessage(extra.deviceMessage);
        if (extra.fingerprint       !== undefined) setFingerprint(extra.fingerprint);
        if (extra.bootstrapRequired !== undefined) setBootstrapRequired(Boolean(extra.bootstrapRequired));
      },
    });
  }, []);

  useEffect(() => {
    run();
    return () => { abortRef.current?.abort(); };
  }, [run]);

  const retry = useCallback(() => { run(); }, [run]);

  return { phase, errorMessage, deviceMessage, fingerprint, bootstrapRequired, retry };
}

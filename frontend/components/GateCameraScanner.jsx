'use client';

/**
 * GateCameraScanner
 *
 * Single camera window that auto-detects both QR codes and faces.
 *
 * - QR path  : BarcodeDetector runs continuously on every video frame.
 *              The moment a valid Registration Pass QR is found, onQrDetect
 *              fires automatically — no button press needed.
 *
 * - Face path: The operator presses "Capture" to freeze the frame and send
 *              it to face recognition via onFaceCapture.
 *
 * - Flip     : When the device has more than one camera a flip button is
 *              shown inside the viewport (top-left). Tapping it switches
 *              between the front-facing and rear-facing camera.
 *
 * Props:
 *   onFaceCapture(blob: Blob)    – called when operator presses Capture
 *   onQrDetect(passCode: string) – called automatically when a QR is found
 *   captureLabel: string         – label for the Capture button
 *   processing: bool             – true while a scan is in-flight
 *   autoStart: bool              – open camera on mount
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const QR_COOLDOWN_MS = 3000;

function extractPassCode(rawValue) {
  try {
    const url = new URL(rawValue);
    const parts = url.pathname.split('/');
    const idx = parts.indexOf('verify');
    if (idx >= 0 && parts[idx + 1]) {
      return decodeURIComponent(parts[idx + 1]);
    }
  } catch {
    // not a URL — fall through
  }
  if (/^(REG|DAY)-[A-Z0-9]+-[A-Z0-9]+$/i.test(rawValue.trim())) {
    return rawValue.trim().toUpperCase();
  }
  return null;
}

// Flip camera icon (two circular arrows)
function FlipIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 4v6h6" />
      <path d="M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10" />
      <path d="M3.51 15a9 9 0 0 0 14.85 3.36L23 14" />
    </svg>
  );
}

export default function GateCameraScanner({
  onFaceCapture,
  onQrDetect,
  captureLabel = 'Capture for face scan',
  processing = false,
  autoStart = false,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const lastQrRef = useRef(null);
  const qrCooldownRef = useRef(false);

  const [active, setActive] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [qrSupported, setQrSupported] = useState(true);
  const [detectedType, setDetectedType] = useState(null); // 'qr' | 'face' | null
  const [facingMode, setFacingMode] = useState('user');   // 'user' | 'environment'
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [flipping, setFlipping] = useState(false);

  // ── Detect number of cameras ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      })
      .catch(() => {
        // enumerateDevices can fail on insecure origins — ignore
      });
  }, []);

  // ── Init BarcodeDetector ──────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('BarcodeDetector' in window)) {
      setQrSupported(false);
      return;
    }
    try {
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      setQrSupported(false);
    }
  }, []);

  // ── Stop stream + QR loop ─────────────────────────────────────────────────
  const stopStream = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    lastQrRef.current = null;
    qrCooldownRef.current = false;
  }, []);

  const stopCamera = useCallback(() => {
    stopStream();
    setActive(false);
  }, [stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  // ── QR scan loop ──────────────────────────────────────────────────────────
  const qrScanLoop = useCallback(async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;

    if (video && detector && !processing && !qrCooldownRef.current && video.readyState >= 2) {
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const passCode = extractPassCode(barcodes[0].rawValue);
          if (passCode && passCode !== lastQrRef.current) {
            lastQrRef.current = passCode;
            qrCooldownRef.current = true;
            setDetectedType('qr');
            onQrDetect?.(passCode);
            setTimeout(() => {
              qrCooldownRef.current = false;
              lastQrRef.current = null;
              setDetectedType(null);
            }, QR_COOLDOWN_MS);
          }
        }
      } catch {
        // frame not ready — ignore
      }
    }

    rafRef.current = requestAnimationFrame(qrScanLoop);
  }, [processing, onQrDetect]);

  // ── Start camera with a given facingMode ─────────────────────────────────
  const startCamera = useCallback(
    async (facing = facingMode) => {
      setError('');
      setPreview(null);
      setDetectedType(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setActive(true);
        lastQrRef.current = null;
        qrCooldownRef.current = false;
        if (detectorRef.current) {
          rafRef.current = requestAnimationFrame(qrScanLoop);
        }
      } catch {
        setError('Camera access denied or unavailable');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facingMode, qrScanLoop]
  );

  // Restart QR loop when processing finishes
  useEffect(() => {
    if (!active || !detectorRef.current) return;
    if (!processing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(qrScanLoop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing]);

  useEffect(() => {
    if (autoStart) startCamera();
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // ── Flip camera ───────────────────────────────────────────────────────────
  const flipCamera = useCallback(async () => {
    if (flipping || !active) return;
    setFlipping(true);
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    stopStream();
    setFacingMode(nextFacing);
    await startCamera(nextFacing);
    setFlipping(false);
  }, [flipping, active, facingMode, stopStream, startCamera]);

  // ── Face capture ──────────────────────────────────────────────────────────
  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || processing || preview) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    // Mirror the canvas draw for front camera so the saved image isn't flipped
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setPreview(URL.createObjectURL(blob));
        setDetectedType('face');
        await onFaceCapture?.(blob);
      },
      'image/jpeg',
      0.92
    );
  }

  function retake() {
    setPreview(null);
    setDetectedType(null);
    onFaceCapture?.(null);
    if (detectorRef.current && active) {
      rafRef.current = requestAnimationFrame(qrScanLoop);
    }
  }

  // ── Derived render state ──────────────────────────────────────────────────
  const showCapture = active && !preview && !processing;
  const showRetake = preview && !processing;
  const showProcessing = processing;
  // Mirror the live video for front camera (CSS only — the captured blob is un-mirrored above)
  const videoMirrored = facingMode === 'user';

  return (
    <div className="gate-cam-scanner">
      {error && <p className="error-msg">{error}</p>}

      {/* ── Viewport ── */}
      <div className="camera-viewport gate-cam-scanner__viewport">

        {/* Live video */}
        {!preview && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={[
              active ? 'visible' : 'hidden',
              videoMirrored ? 'gate-cam-scanner__video--mirrored' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        )}

        {/* Frozen preview after face capture */}
        {preview && (
          <img src={preview} alt="Captured frame" className="gate-cam-scanner__preview" />
        )}

        {/* QR targeting frame */}
        {active && !preview && qrSupported && (
          <div className="gate-cam-scanner__qr-overlay" aria-hidden="true">
            <div className="gate-cam-scanner__qr-frame" />
          </div>
        )}

        {/* Flip camera button — inside viewport, top-left */}
        {active && !preview && hasMultipleCameras && (
          <button
            type="button"
            className="gate-cam-scanner__flip-btn"
            onClick={flipCamera}
            disabled={flipping || processing}
            aria-label="Switch camera"
            title="Switch camera"
          >
            <FlipIcon />
          </button>
        )}

        {/* Status badge — top-right */}
        {active && detectedType === 'qr' && (
          <div className="gate-cam-scanner__badge gate-cam-scanner__badge--qr" aria-live="polite">
            QR detected
          </div>
        )}
        {active && detectedType === 'face' && (
          <div className="gate-cam-scanner__badge gate-cam-scanner__badge--face" aria-live="polite">
            Face captured
          </div>
        )}

        {/* Placeholder */}
        {!active && !preview && (
          <div className="camera-placeholder">
            <p>Camera not started</p>
            <button type="button" className="btn-primary" onClick={() => startCamera()}>
              Start Camera
            </button>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ── Hint row ── */}
      {active && !preview && !processing && (
        <p className="gate-cam-scanner__hint field-hint">
          {qrSupported
            ? 'QR code is detected automatically · press Capture to use face recognition'
            : 'Press Capture to use face recognition'}
        </p>
      )}

      {/* ── Action row ── */}
      <div className="camera-actions">
        {showCapture && (
          <button type="button" className="btn-primary" onClick={captureFrame}>
            {captureLabel}
          </button>
        )}

        {showProcessing && (
          <button type="button" className="btn-primary" disabled>
            Processing...
          </button>
        )}

        {showRetake && (
          <button type="button" className="btn-secondary" onClick={retake}>
            Retake
          </button>
        )}

        {!active && !processing && (
          <button type="button" className="btn-primary" onClick={() => startCamera()}>
            Start Camera
          </button>
        )}
      </div>

      {!qrSupported && (
        <p
          className="field-hint"
          style={{ color: 'var(--color-warning, #f59e0b)', marginTop: '0.5rem' }}
        >
          QR auto-detection unavailable in this browser — face scan still works.
        </p>
      )}
    </div>
  );
}

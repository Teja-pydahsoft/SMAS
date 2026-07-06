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
 * Props:
 *   onFaceCapture(blob: Blob)    – called when operator presses Capture
 *   onQrDetect(passCode: string) – called automatically when a QR is found
 *   captureLabel: string         – label for the Capture button
 *   processing: bool             – true while a scan is in-flight (disables both paths)
 *   autoStart: bool              – open camera on mount
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const QR_COOLDOWN_MS = 3000; // ms before the same QR code can fire again

function extractPassCode(rawValue) {
  try {
    const url = new URL(rawValue);
    const parts = url.pathname.split('/');
    const idx = parts.indexOf('verify');
    if (idx >= 0 && parts[idx + 1]) {
      return decodeURIComponent(parts[idx + 1]);
    }
  } catch {
    // not a URL
  }
  if (/^(REG|DAY)-[A-Z0-9]+-[A-Z0-9]+$/i.test(rawValue.trim())) {
    return rawValue.trim().toUpperCase();
  }
  return null;
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
  const [preview, setPreview] = useState(null); // data-url after face capture
  const [error, setError] = useState('');
  const [qrSupported, setQrSupported] = useState(true);
  const [detectedType, setDetectedType] = useState(null); // 'qr' | 'face' | null

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

  // ── Camera lifecycle ──────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setActive(false);
    lastQrRef.current = null;
    qrCooldownRef.current = false;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── QR scan loop (runs every animation frame) ─────────────────────────────
  const qrScanLoop = useCallback(async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;

    // skip frame if not ready, processing, or in cooldown
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
        // BarcodeDetector can throw on frames that aren't ready — ignore
      }
    }

    rafRef.current = requestAnimationFrame(qrScanLoop);
  }, [processing, onQrDetect]);

  const startCamera = useCallback(async () => {
    setError('');
    setPreview(null);
    setDetectedType(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setActive(true);
      lastQrRef.current = null;
      qrCooldownRef.current = false;
      // Start QR scan loop only if BarcodeDetector is available
      if (detectorRef.current) {
        rafRef.current = requestAnimationFrame(qrScanLoop);
      }
    } catch {
      setError('Camera access denied or unavailable');
    }
  }, [qrScanLoop]);

  // Restart QR loop when processing finishes (so it can catch the next QR)
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
  }, [autoStart, startCamera]);

  // ── Face capture ──────────────────────────────────────────────────────────
  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || processing || preview) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        // Stop QR loop while face result is shown
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
    // Resume QR loop
    if (detectorRef.current && active) {
      rafRef.current = requestAnimationFrame(qrScanLoop);
    }
  }

  // ── Derived render state ──────────────────────────────────────────────────
  const showCapture = active && !preview && !processing;
  const showRetake = preview && !processing;
  const showProcessing = processing;

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
            className={active ? 'visible' : 'hidden'}
          />
        )}

        {/* Frozen preview after face capture */}
        {preview && (
          <img src={preview} alt="Captured frame" className="gate-cam-scanner__preview" />
        )}

        {/* QR targeting frame (only shown when live and QR-detector is available) */}
        {active && !preview && qrSupported && (
          <div className="gate-cam-scanner__qr-overlay" aria-hidden="true">
            <div className="gate-cam-scanner__qr-frame" />
          </div>
        )}

        {/* Status badge */}
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

        {/* Camera not started placeholder */}
        {!active && !preview && (
          <div className="camera-placeholder">
            <p>Camera not started</p>
            <button type="button" className="btn-primary" onClick={startCamera}>
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
          <button type="button" className="btn-primary" onClick={startCamera}>
            Start Camera
          </button>
        )}
      </div>

      {!qrSupported && (
        <p className="field-hint" style={{ color: 'var(--color-warning, #f59e0b)', marginTop: '0.5rem' }}>
          QR auto-detection unavailable in this browser — face scan still works.
        </p>
      )}
    </div>
  );
}

'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

const MIRROR_STORAGE_KEY = 'smas.cameraCapture.mirrored';

export default function CameraCapture({
  onCapture,
  label = 'Capture Photo',
  autoStart = false,
  processing = false,
  processingLabel = 'Processing...',
  hideRetake = false,
  defaultMirrored = true,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [mirrored, setMirrored] = useState(defaultMirrored);

  // Restore the operator's saved mirror preference for this device/browser.
  // Some cameras (e.g. many external/USB webcams) already output a correctly
  // oriented feed, while laptop front cameras look flipped — so the choice is
  // per-camera and we let the operator toggle it.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MIRROR_STORAGE_KEY);
      if (saved !== null) setMirrored(saved === '1');
    } catch {
      // localStorage unavailable — keep default
    }
  }, []);

  const toggleMirror = useCallback(() => {
    setMirrored((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MIRROR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore persistence errors
      }
      return next;
    });
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setActive(true);
      setPreview(null);
    } catch {
      setError('Camera access denied or unavailable');
    }
  }, []);

  useEffect(() => {
    if (autoStart) {
      startCamera();
    }
  }, [autoStart, startCamera]);

  async function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || processing) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    // Mirror the saved frame so it matches the mirrored (selfie) preview the
    // operator sees — otherwise left/right end up flipped in the stored photo.
    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      async (blob) => {
        if (blob) {
          setPreview(URL.createObjectURL(blob));
          stopCamera();
          await onCapture?.(blob);
        }
      },
      'image/jpeg',
      0.92
    );
  }

  function retake() {
    setPreview(null);
    onCapture?.(null);
    startCamera();
  }

  const showCaptureButton = active && !preview && !processing;
  const showRetakeButton = preview && !hideRetake && !processing;

  return (
    <div className="camera-capture">
      {error && <p className="error-msg">{error}</p>}

      {!preview ? (
        <div className="camera-viewport">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={[
              active ? 'visible' : 'hidden',
              mirrored ? 'camera-viewport__video--mirrored' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
          {active && (
            <button
              type="button"
              className="camera-viewport__mirror-btn"
              onClick={toggleMirror}
              aria-label={mirrored ? 'Turn off mirror' : 'Turn on mirror'}
              title={mirrored ? 'Mirror: On (tap if left/right look swapped)' : 'Mirror: Off (tap if left/right look swapped)'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v18" />
                <path d="M8 7l-4 5 4 5" />
                <path d="M16 7l4 5-4 5" />
              </svg>
              <span>{mirrored ? 'Mirror on' : 'Mirror off'}</span>
            </button>
          )}
          {!active && (
            <div className="camera-placeholder">
              <p>Camera not started</p>
              <button type="button" className="btn-primary" onClick={startCamera}>
                Start Camera
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="camera-preview">
          <img src={preview} alt="Captured" />
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="camera-actions">
        {showCaptureButton && (
          <button type="button" className="btn-primary" onClick={capture}>
            {label}
          </button>
        )}
        {processing && (
          <button type="button" className="btn-primary" disabled>
            {processingLabel}
          </button>
        )}
        {showRetakeButton && (
          <button type="button" className="btn-secondary" onClick={retake}>
            Retake Photo
          </button>
        )}
      </div>
    </div>
  );
}

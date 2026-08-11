'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

const MIRROR_STORAGE_KEY = 'smas.cameraCapture.mirrored';
const FACING_STORAGE_KEY = 'smas.cameraCapture.facingMode';

function FlipIcon() {
  return (
    <svg
      width="20"
      height="20"
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

export default function CameraCapture({
  onCapture,
  label = 'Capture Photo',
  autoStart = false,
  processing = false,
  processingLabel = 'Processing...',
  hideRetake = false,
  defaultMirrored = true,
  /** Show front/rear camera flip control (needed on phones). */
  enableFlip = true,
  defaultFacingMode = 'user',
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [mirrored, setMirrored] = useState(defaultMirrored);
  const [facingMode, setFacingMode] = useState(defaultFacingMode);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [flipping, setFlipping] = useState(false);

  // Restore mirror + facing preferences for this device/browser.
  useEffect(() => {
    try {
      const savedMirror = localStorage.getItem(MIRROR_STORAGE_KEY);
      if (savedMirror !== null) setMirrored(savedMirror === '1');
      const savedFacing = localStorage.getItem(FACING_STORAGE_KEY);
      if (savedFacing === 'user' || savedFacing === 'environment') {
        setFacingMode(savedFacing);
      }
    } catch {
      // localStorage unavailable — keep defaults
    }
  }, []);

  const refreshCameraCount = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setHasMultipleCameras(videoInputs.length > 1);
    } catch {
      // ignore — still allow flip attempts on phones
    }
  }, []);

  useEffect(() => {
    refreshCameraCount();
  }, [refreshCameraCount]);

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

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopStream();
    setActive(false);
  }, [stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  const startCamera = useCallback(
    async (facing = facingMode) => {
      setError('');
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setFacingMode(facing);
        setActive(true);
        setPreview(null);
        // After permission, device labels are available — re-check camera count.
        refreshCameraCount();
      } catch {
        // Fallback without ideal facingMode constraint (older browsers / single cam).
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setFacingMode(facing);
          setActive(true);
          setPreview(null);
          refreshCameraCount();
        } catch {
          setError('Camera access denied or unavailable');
          setActive(false);
        }
      }
    },
    [facingMode, stopStream, refreshCameraCount]
  );

  useEffect(() => {
    if (autoStart) {
      startCamera();
    }
    // only on mount / when autoStart turns on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const flipCamera = useCallback(async () => {
    if (flipping || processing || !active) return;
    setFlipping(true);
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      localStorage.setItem(FACING_STORAGE_KEY, nextFacing);
    } catch {
      // ignore
    }
    // Rear cameras usually should not be mirrored; front often should.
    if (nextFacing === 'environment') {
      setMirrored(false);
    } else if (defaultMirrored) {
      setMirrored(true);
    }
    await startCamera(nextFacing);
    setFlipping(false);
  }, [flipping, processing, active, facingMode, startCamera, defaultMirrored]);

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
    startCamera(facingMode);
  }

  const showCaptureButton = active && !preview && !processing;
  const showRetakeButton = preview && !hideRetake && !processing;
  // Always offer flip when enabled — phones often report 1 camera until after permission.
  const showFlip = enableFlip && active && !preview;

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
          {showFlip && (
            <button
              type="button"
              className="camera-viewport__flip-btn"
              onClick={flipCamera}
              disabled={flipping || processing}
              aria-label={facingMode === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
              title={
                facingMode === 'user'
                  ? 'Switch to rear camera'
                  : 'Switch to front camera'
              }
            >
              <FlipIcon />
              <span className="camera-viewport__flip-label">
                {flipping ? 'Switching…' : facingMode === 'user' ? 'Rear' : 'Front'}
              </span>
            </button>
          )}
          {!active && (
            <div className="camera-placeholder">
              <p>Camera not started</p>
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => startCamera()}>
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
          <button type="button" className="admin-btn admin-btn--primary" onClick={capture}>
            {label}
          </button>
        )}
        {processing && (
          <button type="button" className="admin-btn admin-btn--primary" disabled>
            {processingLabel}
          </button>
        )}
        {showRetakeButton && (
          <button type="button" className="admin-btn admin-btn--secondary" onClick={retake}>
            Retake Photo
          </button>
        )}
      </div>

      {showFlip && hasMultipleCameras && (
        <p className="field-hint camera-capture__flip-hint">
          Tap <strong>Rear</strong> / <strong>Front</strong> to flip the camera
        </p>
      )}
    </div>
  );
}

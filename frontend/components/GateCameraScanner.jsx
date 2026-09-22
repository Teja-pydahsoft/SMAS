'use client';

/**
 * GateCameraScanner
 *
 * Single camera window that auto-detects both QR codes and faces.
 *
 * - QR path  : BarcodeDetector runs continuously. When a valid QR is found,
 *              a "Scan QR" button appears over the viewport. The operator must
 *              tap it to confirm and fire onQrDetect. This prevents accidental
 *              multiple scans (especially on entry/exit gates where each scan
 *              toggles state).
 *
 * - Face path: The operator presses "Capture" to freeze the frame and send
 *              it to face recognition via onFaceCapture.
 *
 * - Flip     : When the device has more than one camera, a flip button is
 *              shown inside the viewport (top-left). Tapping it switches
 *              between the front-facing and rear-facing camera.
 *
 * Props:
 *   onFaceCapture(blob: Blob)    – called when operator presses Capture
 *   onQrDetect(passCode: string) – called when operator confirms QR scan
 *   captureLabel: string         – label for the Capture button
 *   processing: bool             – true while a scan is in-flight
 *   autoStart: bool              – open camera on mount
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

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

// Flip camera icon
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

  const [active, setActive] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [qrSupported, setQrSupported] = useState(true);
  const [detectedType, setDetectedType] = useState(null); // 'qr' | 'face' | null
  const [facingMode, setFacingMode] = useState('user');   // 'user' | 'environment'
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [pendingQr, setPendingQr] = useState(null); // {passCode, raw} when QR detected but not confirmed
  const [blinkPrompt, setBlinkPrompt] = useState(false); // To show 'Please blink' UI
  const [poseWarning, setPoseWarning] = useState(false); // True if shoulders not detected or face wrong size

  const capturingRef = useRef(false);
  const faceLandmarkerRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const lastFaceDetectTimeRef = useRef(0);
  const lastObjDetectTimeRef = useRef(0);
  const poseStatusRef = useRef(false); // true if pose is BAD (warning)
  const blinkPhaseRef = useRef('open'); // 'open' -> 'closed' -> 'open'

  // ── Init Vision Tasks ───────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    async function initVisionTasks() {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });
        if (isMounted) faceLandmarkerRef.current = landmarker;

        const poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numPoses: 1
        });
        if (isMounted) poseLandmarkerRef.current = poseLandmarker;
      } catch (err) {
        console.error("Failed to initialize Vision Tasks", err);
      }
    }
    initVisionTasks();
    return () => { isMounted = false; };
  }, []);

  // ── Detect number of cameras ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      })
      .catch(() => {});
  }, []);

  // Release local capture lock when parent finishes processing / preview clears
  useEffect(() => {
    if (!processing && !preview) {
      capturingRef.current = false;
    }
  }, [processing, preview]);

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
  }, []);

  const stopCamera = useCallback(() => {
    stopStream();
    setActive(false);
    setPendingQr(null);
    setBlinkPrompt(false);
    setPoseWarning(false);
  }, [stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  // ── Main Scan Loop (QR + Blink + Pose) ────────────────────────────────────
  const scanLoop = useCallback(async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    const landmarker = faceLandmarkerRef.current;
    const poseLandmarker = poseLandmarkerRef.current;

    // Only scan if video is ready and not currently processing
    if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !processing) {
      
      // 1. QR Code Detection
      if (detector && !pendingQr && qrSupported) {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            const passCode = extractPassCode(barcodes[0].rawValue);
            if (passCode) {
              setPendingQr({ passCode, raw: barcodes[0].rawValue });
              setDetectedType('qr');
            }
          }
        } catch {
          // frame not ready — ignore
        }
      }

      // 2. Face Blink & Pose Distance Detection
      if (landmarker && poseLandmarker && !pendingQr && !preview && !capturingRef.current) {
        try {
          // Use performance.now() but ensure strictly monotonic increasing timestamps for MediaPipe
          let nowMs = performance.now();
          if (!landmarker.lastTimestamp) landmarker.lastTimestamp = -1;
          if (!poseLandmarker.lastTimestamp) poseLandmarker.lastTimestamp = -1;
          
          if (lastVideoTimeRef.current !== video.currentTime) {
            const timeSinceLastFace = nowMs - lastFaceDetectTimeRef.current;
            const timeSinceLastObj = nowMs - lastObjDetectTimeRef.current;
            
            // Throttle FaceLandmarker to ~20fps (50ms) to reduce mobile lag
            if (timeSinceLastFace > 50) {
              lastVideoTimeRef.current = video.currentTime;
              
              const _log = console.log, _info = console.info, _warn = console.warn, _error = console.error;
              console.log = console.info = console.warn = console.error = () => {};
              
              let results;
              try {
                landmarker.lastTimestamp = nowMs;
                results = landmarker.detectForVideo(video, nowMs);
                lastFaceDetectTimeRef.current = nowMs;

                // Throttle PoseLandmarker to ~3fps (300ms) as it is very heavy
                if (timeSinceLastObj > 300) {
                  poseLandmarker.lastTimestamp = nowMs;
                  const poseResults = poseLandmarker.detectForVideo(video, nowMs);
                  lastObjDetectTimeRef.current = nowMs;
                  
                  let hasPoseWarning = true; // Assume bad pose unless proven otherwise

                  if (poseResults.landmarks && poseResults.landmarks.length > 0) {
                    const landmarks = poseResults.landmarks[0];
                    const leftShoulder = landmarks[11];
                    const rightShoulder = landmarks[12];
                    
                    // Check if both shoulders are within the frame and have high visibility
                    const isLeftShoulderValid = leftShoulder && leftShoulder.visibility > 0.5 && leftShoulder.x >= 0 && leftShoulder.x <= 1 && leftShoulder.y >= 0 && leftShoulder.y <= 1;
                    const isRightShoulderValid = rightShoulder && rightShoulder.visibility > 0.5 && rightShoulder.x >= 0 && rightShoulder.x <= 1 && rightShoulder.y >= 0 && rightShoulder.y <= 1;
                    
                    if (isLeftShoulderValid && isRightShoulderValid) {
                      hasPoseWarning = false; // Shoulders are clearly visible!
                    }
                  }

                  // Also check Face distance (bounding box size)
                  if (!hasPoseWarning && results.faceLandmarks && results.faceLandmarks.length > 0) {
                    const faceMarks = results.faceLandmarks[0];
                    const leftPoint = faceMarks[234];
                    const rightPoint = faceMarks[454];
                    if (leftPoint && rightPoint) {
                      const faceWidth = Math.abs(rightPoint.x - leftPoint.x);
                      // Require face to be a reasonable size relative to screen width (not a huge phone screen held closely)
                      if (faceWidth > 0.40 || faceWidth < 0.10) {
                        hasPoseWarning = true;
                      }
                    }
                  }

                  poseStatusRef.current = hasPoseWarning;
                  setPoseWarning(hasPoseWarning);
                }
              } finally {
                console.log = _log; console.info = _info; console.warn = _warn; console.error = _error;
              }

              // Use the synchronous ref for anti-spoofing check
              if (poseStatusRef.current) {
                setBlinkPrompt(false);
                blinkPhaseRef.current = 'open';
              } else {
                if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
                  setBlinkPrompt(true);
                  const shapes = results.faceBlendshapes[0].categories;
                  const leftBlink = shapes.find(s => s.categoryName === 'eyeBlinkLeft')?.score || 0;
                  const rightBlink = shapes.find(s => s.categoryName === 'eyeBlinkRight')?.score || 0;
                  
                  const isClosed = (leftBlink > 0.4 && rightBlink > 0.4);
                  
                  if (blinkPhaseRef.current === 'open' && isClosed) {
                    blinkPhaseRef.current = 'closed';
                  } else if (blinkPhaseRef.current === 'closed' && !isClosed) {
                    blinkPhaseRef.current = 'open';
                    setBlinkPrompt(false);
                    
                    // Lock capture immediately so we don't trigger multiple times
                    capturingRef.current = true;
                    
                    // Wait 250ms for the eyes to fully open before taking the snapshot
                    setTimeout(() => {
                      capturingRef.current = false; 
                      captureFrame(); 
                    }, 250);
                  }
                } else {
                  setBlinkPrompt(false);
                  blinkPhaseRef.current = 'open';
                }
              }
            }
          }
        } catch (e) {
          console.warn('FaceLandmarker error:', e);
        }
      }
    }

    rafRef.current = requestAnimationFrame(scanLoop);
  }, [pendingQr, processing, preview, qrSupported]); // captureFrame is defined below, so we rely on refs

  // ── Start camera with a given facingMode ─────────────────────────────────
  const startCamera = useCallback(
    async (facing = facingMode) => {
      setError('');
      setPreview(null);
      setDetectedType(null);
      setPendingQr(null);

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
        rafRef.current = requestAnimationFrame(scanLoop);
      } catch {
        setError('Camera access denied or unavailable');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facingMode, scanLoop]
  );

  // Restart loop when processing finishes
  useEffect(() => {
    if (!active) return;
    if (!processing && !pendingQr) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(scanLoop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, pendingQr, active, scanLoop]);

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
    setPendingQr(null); // clear any pending QR when flipping
    await startCamera(nextFacing);
    setFlipping(false);
  }, [flipping, active, facingMode, stopStream, startCamera]);

  // ── Confirm QR scan ───────────────────────────────────────────────────────
  function confirmQrScan() {
    if (!pendingQr || processing) return;
    setDetectedType(null); // clear the badge
    onQrDetect?.(pendingQr.passCode);
    setPendingQr(null); // clear after firing
  }

  function cancelQrScan() {
    setPendingQr(null);
    setDetectedType(null);
    // Resume scan loop
    if (active && !processing) {
      rafRef.current = requestAnimationFrame(scanLoop);
    }
  }

  // ── Face capture ──────────────────────────────────────────────────────────
  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || processing || preview || capturingRef.current) return;
    capturingRef.current = true;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      capturingRef.current = false;
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    // Mirror the canvas draw for front camera so the saved image isn't flipped
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    try {
      ctx.drawImage(video, 0, 0);
    } catch (err) {
      capturingRef.current = false;
      return;
    }

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          capturingRef.current = false;
          return;
        }
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setPreview(URL.createObjectURL(blob));
        setDetectedType('face');
        try {
          await onFaceCapture?.(blob);
        } finally {
          // Parent `processing` usually takes over; keep lock until that clears.
          if (!processing) capturingRef.current = false;
        }
      },
      'image/jpeg',
      0.92
    );
  }

  function retake() {
    capturingRef.current = false;
    blinkPhaseRef.current = 'open';
    setPreview(null);
    setDetectedType(null);
    onFaceCapture?.(null);
    if (active) {
      rafRef.current = requestAnimationFrame(scanLoop);
    }
  }

  // ── Derived render state ──────────────────────────────────────────────────
  const showCapture = active && !preview && !processing && !pendingQr;
  const showRetake = preview && !processing;
  const showProcessing = processing;
  const videoMirrored = facingMode === 'user';

  return (
    <div className="gate-cam-scanner">
      {error && <p className="error-msg">{error}</p>}

      {/* ── Viewport ── */}
      <div className="camera-viewport gate-cam-scanner__viewport">

        {/* Live video */}
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
          style={{ display: preview ? 'none' : 'block' }}
        />

        {/* Frozen preview after face capture */}
        {preview && (
          <img src={preview} alt="Captured frame" className="gate-cam-scanner__preview" />
        )}

        {/* HUD Face Alignment Overlay */}
        {active && !preview && !pendingQr && detectedType !== 'qr' && (
          <div className="gate-cam-scanner__face-overlay" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
            <svg 
              width="100%" 
              height="100%" 
              viewBox="0 0 300 400" 
              fill="none" 
              preserveAspectRatio="xMidYMid slice"
              xmlns="http://www.w3.org/2000/svg"
              style={{ transition: 'all 0.3s ease-in-out' }}
            >
              <g stroke={poseWarning ? "#ef4444" : blinkPrompt ? "#3b82f6" : "#4ade80"}>
                {/* Corner Brackets */}
                <path d="M 20,80 L 20,20 L 80,20" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 280,80 L 280,20 L 220,20" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 20,320 L 20,380 L 80,380" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 280,320 L 280,380 L 220,380" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />

                {/* Vertical Center Line */}
                <line x1="150" y1="20" x2="150" y2="380" strokeWidth="2" strokeDasharray="6 6" opacity="0.5" />
                
                {/* Horizontal Eye Level Line */}
                <line x1="70" y1="140" x2="230" y2="140" strokeWidth="2" strokeDasharray="6 6" opacity="0.6" />
                <circle cx="125" cy="140" r="4" fill={poseWarning ? "#ef4444" : blinkPrompt ? "#3b82f6" : "#4ade80"} stroke="none" />
                <circle cx="175" cy="140" r="4" fill={poseWarning ? "#ef4444" : blinkPrompt ? "#3b82f6" : "#4ade80"} stroke="none" />
                
                {/* Head Oval (Lowered to reduce gap) */}
                <ellipse cx="150" cy="155" rx="55" ry="75" strokeWidth="4" strokeDasharray="12 12" fill="none" />
                
                {/* Shoulders Arc */}
                <path d="M 40,380 C 40,290 90,250 150,250 C 210,250 260,290 260,380" strokeWidth="4" strokeDasharray="12 12" fill="none" />
                
                {/* Smile curve */}
                <path d="M 135,195 C 145,205 155,205 165,195" strokeWidth="3" strokeLinecap="round" fill="none" />
              </g>
            </svg>
          </div>
        )}

        {/* QR targeting frame (only when no QR is pending confirmation) */}
        {active && !preview && qrSupported && !pendingQr && (
          <div className="gate-cam-scanner__qr-overlay" aria-hidden="true">
            <div className="gate-cam-scanner__qr-frame" />
          </div>
        )}

        {/* QR detected — show confirmation overlay */}
        {active && !preview && pendingQr && (
          <div className="gate-cam-scanner__qr-confirm-overlay">
            <div className="gate-cam-scanner__qr-confirm-card">
              <div className="gate-cam-scanner__qr-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="3" height="3" />
                  <rect x="19" y="14" width="2" height="2" />
                  <rect x="14" y="19" width="2" height="2" />
                  <rect x="18" y="18" width="3" height="3" />
                </svg>
              </div>
              <p className="gate-cam-scanner__qr-confirm-title">QR Code Detected</p>
              <p className="gate-cam-scanner__qr-confirm-code">{pendingQr.passCode}</p>
              <div className="gate-cam-scanner__qr-confirm-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={confirmQrScan}
                  disabled={processing}
                >
                  {processing ? 'Processing...' : 'Scan QR'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={cancelQrScan}
                  disabled={processing}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Flip camera button — inside viewport, top-left */}
        {active && !preview && !pendingQr && hasMultipleCameras && (
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

        {/* Status badge — top-right (only for face capture, QR uses overlay) */}
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
      {active && !preview && !processing && !pendingQr && (
        <>
          {poseWarning ? (
            <p className="gate-cam-scanner__hint field-hint" style={{ fontWeight: 'bold', color: 'var(--color-danger, #ef4444)' }}>
              Please stand further back! Align your head and shoulders inside the outline.
            </p>
          ) : (
            <p className="gate-cam-scanner__hint field-hint" style={{ fontWeight: blinkPrompt ? 'bold' : 'normal', color: blinkPrompt ? 'var(--primary)' : 'inherit' }}>
              {blinkPrompt
                ? 'Please blink your eyes to capture...'
                : qrSupported
                  ? 'Show QR code, or align head and shoulders to capture'
                  : 'Align head and shoulders to capture'}
            </p>
          )}
        </>
      )}

      {/* ── Action row ── */}
      <div className="camera-actions">
        {/* Manual capture button removed to enforce liveness blink flow */}
        
        {showProcessing && (
          <button type="button" className="btn-primary" disabled>
            Processing...
          </button>
        )}

        {showRetake && (
          <button type="button" className="btn-secondary" onClick={retake}>
            Capture New Person
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

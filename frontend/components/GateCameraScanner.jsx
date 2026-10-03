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

// Flip camera icon — two-arrow camera switch
function FlipIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Camera body */}
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      {/* Rotation arrows */}
      <path d="M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0" />
      <polyline points="7.5 9.5 9 8 10.5 9.5" />
      <polyline points="16.5 14.5 15 16 13.5 14.5" />
    </svg>
  );
}

export default function GateCameraScanner({
  onFaceCapture,
  onQrDetect,
  captureLabel = 'Capture New Person',
  processing = false,
  autoStart = false,
  eyeBlinkEnabled = true,
  cameraDeviceLabel = 'Camera 1 - Entrance',
  stationLabel = 'Main Gate',
  selectedDeviceId = '',
}) {
  const containerRef = useRef(null);
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
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [pendingQr, setPendingQr] = useState(null); // {passCode, raw} when QR detected but not confirmed
  const [blinkPrompt, setBlinkPrompt] = useState(false); // To show 'Please blink' UI
  const [poseWarning, setPoseWarning] = useState(false); // True if face is severely off-center
  const [faceDetected, setFaceDetected] = useState(false); // True when face is present in frame

  const capturingRef = useRef(false);
  const faceLandmarkerRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const lastFaceDetectTimeRef = useRef(0);
  const lastObjDetectTimeRef = useRef(0);
  const poseStatusRef = useRef(false); // true if pose is BAD (warning)
  const blinkPhaseRef = useRef('open'); // 'open' -> 'closed' -> 'open'
  // When true, startCamera uses facingMode only (ignores selectedDeviceId) — set by flipCamera.
  const useFacingModeRef = useRef(false);

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

  // ── Detect touch device + number of cameras ───────────────────────────────
  useEffect(() => {
    // On mobile, enumerateDevices() before permission may only return 1 device
    // even when front+rear exist. Use touch detection as a reliable fallback
    // so the flip button always appears on phones/tablets.
    if (typeof window !== 'undefined') {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsTouchDevice(isTouch);
    }
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
    setFaceDetected(false);
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

      // 2. Face Alignment & Blink Detection
      if (landmarker && !pendingQr && !preview && !capturingRef.current) {
        try {
          // Use performance.now() but ensure strictly monotonic increasing timestamps for MediaPipe
          let nowMs = performance.now();
          if (!landmarker.lastTimestamp) landmarker.lastTimestamp = -1;
          
          if (lastVideoTimeRef.current !== video.currentTime) {
            const timeSinceLastFace = nowMs - lastFaceDetectTimeRef.current;
            
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

                let isFaceFound = false;
                let isBadlyAligned = false;

                if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
                  const faceMarks = results.faceLandmarks[0];
                  const leftPoint = faceMarks[234];
                  const rightPoint = faceMarks[454];
                  const topPoint = faceMarks[10];
                  const bottomPoint = faceMarks[152];

                  if (leftPoint && rightPoint && topPoint && bottomPoint) {
                    isFaceFound = true;
                    const faceCenterX = (leftPoint.x + rightPoint.x) / 2;
                    const faceCenterY = (topPoint.y + bottomPoint.y) / 2;
                    const faceWidth = Math.abs(rightPoint.x - leftPoint.x);

                    // Generous and realistic tolerances for mobile & desktop cameras:
                    // Face is valid when reasonably inside the camera view.
                    const isXCentered = faceCenterX >= 0.15 && faceCenterX <= 0.85;
                    const isYCentered = faceCenterY >= 0.10 && faceCenterY <= 0.85;
                    const isSizeValid = faceWidth >= 0.08 && faceWidth <= 0.85;

                    if (!isXCentered || !isYCentered || !isSizeValid) {
                      isBadlyAligned = true; // Only warn if face is cut off at the extreme edge
                    }
                  }
                }

                setFaceDetected(isFaceFound);
                poseStatusRef.current = isBadlyAligned;
                setPoseWarning(isBadlyAligned);
              } finally {
                console.log = _log; console.info = _info; console.warn = _warn; console.error = _error;
              }

              // Use the synchronous ref for anti-spoofing check
              if (!isFaceFound || poseStatusRef.current || !eyeBlinkEnabled) {
                setBlinkPrompt(false);
                blinkPhaseRef.current = 'open';
              } else {
                if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
                  setBlinkPrompt(true);
                  const shapes = results.faceBlendshapes[0].categories;
                  const leftBlink = shapes.find(s => s.categoryName === 'eyeBlinkLeft')?.score || 0;
                  const rightBlink = shapes.find(s => s.categoryName === 'eyeBlinkRight')?.score || 0;
                  
                  const isClosed = (leftBlink > 0.35 && rightBlink > 0.35) || ((leftBlink + rightBlink) / 2 > 0.38);
                  
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


  // ── Start camera with a given facingMode or selectedDeviceId ─────────────
  const startCamera = useCallback(
    async (facing = facingMode) => {
      setError('');
      setPreview(null);
      setDetectedType(null);
      setPendingQr(null);

      try {
        // useFacingModeRef is set by flipCamera to force facingMode-based selection.
        // This bypasses selectedDeviceId (desktop dropdown) so the OS can switch
        // front/rear cameras on mobile using the facingMode constraint.
        const bypassDeviceId = useFacingModeRef.current;
        const videoConstraints =
          selectedDeviceId && !bypassDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setActive(true);
        rafRef.current = requestAnimationFrame(scanLoop);
        // Re-enumerate after permission granted — device labels are now available.
        navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          if (videoInputs.length > 1) setHasMultipleCameras(true);
        }).catch(() => {});
      } catch {
        // Fallback: try without ideal wrapper
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
          setActive(true);
          rafRef.current = requestAnimationFrame(scanLoop);
          navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
            const videoInputs = devices.filter((d) => d.kind === 'videoinput');
            if (videoInputs.length > 1) setHasMultipleCameras(true);
          }).catch(() => {});
        } catch {
          setError('Camera access denied or unavailable');
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facingMode, scanLoop, selectedDeviceId]
  );

  // Restart camera if selectedDeviceId changes while active
  useEffect(() => {
    if (active && selectedDeviceId) {
      stopStream();
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId]);

  // Restart loop when processing finishes
  useEffect(() => {
    if (!active) return;
    if (!processing && !pendingQr) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(scanLoop);
    }
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
    // Force facingMode-based selection so the OS switches cameras on mobile,
    // ignoring any selectedDeviceId (desktop dropdown) that would otherwise lock
    // the stream to the same physical device.
    useFacingModeRef.current = true;
    await startCamera(nextFacing);
    useFacingModeRef.current = false;
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

    // Downscale output image to max 640px dimension for 10x faster HTTP upload & instant AI face matching
    const maxDim = 640;
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (width > maxDim) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Mirror the canvas draw for front camera so the saved image isn't flipped
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    try {
      ctx.drawImage(video, 0, 0, width, height);
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
      0.85
    );
  }

  function retake() {
    capturingRef.current = false;
    blinkPhaseRef.current = 'open';
    setPreview(null);
    setDetectedType(null);
    setFaceDetected(false);
    setPoseWarning(false);
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
    <div className="gate-cam-scanner" ref={containerRef}>
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
              preserveAspectRatio="xMidYMid meet"
              xmlns="http://www.w3.org/2000/svg"
              style={{ transition: 'all 0.3s ease-in-out', maxHeight: '100%', maxWidth: '100%' }}
            >
              <g stroke={poseWarning ? "#f59e0b" : blinkPrompt ? "#3b82f6" : faceDetected ? "#4ade80" : "rgba(255,255,255,0.7)"}>
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

        {/* Flip camera button — top-right, shown on mobile (touch) or when multiple cameras detected */}
        {active && !preview && !pendingQr && (isTouchDevice || hasMultipleCameras) && (
          <button
            type="button"
            className="gate-cam-scanner__flip-btn"
            onClick={flipCamera}
            disabled={flipping || processing}
            aria-label={facingMode === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
            title={facingMode === 'user' ? 'Switch to rear camera' : 'Switch to front camera'}
          >
            <FlipIcon />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1 }}>
              {flipping ? '…' : facingMode === 'user' ? 'REAR' : 'FRONT'}
            </span>
          </button>
        )}

        {/* Status badge — top-right (only for face capture, QR uses overlay) */}
        {active && detectedType === 'face' && (
          <div className="gate-cam-scanner__badge gate-cam-scanner__badge--face" aria-live="polite">
            Face captured
          </div>
        )}

        {/* Viewport bottom overlay: Camera name and gate name */}
        {active && !preview && (
          <div className="ee-cam-overlay">
            <span className="ee-cam-overlay__label">
              <span className="ee-cam-overlay__dot" />
              {cameraDeviceLabel || 'Camera 1 - Entrance'} | {stationLabel || 'Main Gate'}
            </span>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ── Hint row ── */}
      {active && !preview && !processing && !pendingQr && (
        <>
          {poseWarning ? (
            <p className="gate-cam-scanner__hint field-hint" style={{ fontWeight: 'bold', color: 'var(--color-warning, #f59e0b)' }}>
              Please center your face inside the frame.
            </p>
          ) : (
            <p className="gate-cam-scanner__hint field-hint" style={{ fontWeight: blinkPrompt || faceDetected ? 'bold' : 'normal', color: blinkPrompt ? 'var(--primary)' : faceDetected ? 'var(--color-success, #16a34a)' : 'inherit' }}>
              {blinkPrompt
                ? 'Please blink your eyes to capture...'
                : faceDetected
                  ? eyeBlinkEnabled
                    ? 'Face aligned — please blink to capture'
                    : 'Face aligned — press Capture to scan'
                  : eyeBlinkEnabled
                    ? 'Position face inside frame to scan'
                    : 'Position face inside frame or press Capture'}
            </p>
          )}
        </>
      )}

      {/* ── Action row ── */}
      <div className="camera-actions">
        {showCapture && (
          <button
            type="button"
            className="btn-primary"
            onClick={captureFrame}
            disabled={processing}
          >
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

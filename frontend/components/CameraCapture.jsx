'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

export default function CameraCapture({
  onCapture,
  label = 'Capture Photo',
  autoStart = false,
  processing = false,
  processingLabel = 'Processing...',
  hideRetake = false,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

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
          <video ref={videoRef} autoPlay playsInline muted className={active ? 'visible' : 'hidden'} />
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

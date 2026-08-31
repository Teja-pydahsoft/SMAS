"use client";

import React, { useState, useEffect, Suspense, useMemo, useRef } from 'react';
import CameraCapture from '../../../components/CameraCapture';
import jsQR from 'jsqr';
import PageTabs from '@/components/PageTabs';
import PageShell from '@/components/PageShell';
import SearchableSelect from '@/components/SearchableSelect';
import { useSearchParams, useRouter } from 'next/navigation';
import AdminIcon from '@/components/admin/AdminIcons';
import { resolvePhotoUrl } from '@/lib/photoUrl';

function MovementsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get('tab') || 'scan'; // 'scan' | 'manual' | 'history'
  
  // Manual Tab State
  const [vehicleId, setVehicleId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [divisions, setDivisions] = useState([]);
  const [divisionId, setDivisionId] = useState('');

  // Scan Tab State
  const [scanDirection, setScanDirection] = useState('Auto');
  const [scanDivisionId, setScanDivisionId] = useState('');
  const [scanDepartmentId, setScanDepartmentId] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [overridePlate, setOverridePlate] = useState('');
  const [scanStatus, setScanStatus] = useState('Waiting for Vehicle');

  // QR Scanning States
  const [scanMethod, setScanMethod] = useState(null); // null | 'camera' | 'qr'
  const [qrError, setQrError] = useState('');
  const qrVideoRef = useRef(null);
  const qrStreamRef = useRef(null);
  const qrRafRef = useRef(null);

  const startQrScanner = async () => {
    setQrError('');
    try {
      if (typeof window === 'undefined') return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access APIs are not available. Please ensure you are using HTTPS or localhost.');
      }

      let stream;
      try {
        // Try high-resolution back camera first
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: { ideal: 'environment' }, 
            width: { ideal: 1920, max: 1920 }, 
            height: { ideal: 1080, max: 1080 } 
          }
        });
      } catch (err) {
        console.warn('Failed to start camera with environment constraints, falling back...', err);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }

      qrStreamRef.current = stream;
      if (qrVideoRef.current) {
        qrVideoRef.current.srcObject = stream;
      }

      // Check if native BarcodeDetector is supported
      const hasNative = 'BarcodeDetector' in window;
      let nativeDetector = null;
      if (hasNative) {
        try {
          nativeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } catch (e) {
          console.warn('Native BarcodeDetector creation failed, using jsQR fallback', e);
        }
      }

      // Create an offscreen canvas for frame extraction
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      let lastScanTime = 0;
      
      const scanLoop = async () => {
        const video = qrVideoRef.current;
        if (video && video.readyState >= 2) {
          const now = Date.now();
          // Rate limit scanning to ~8 frames per second to prevent CPU throttling
          if (now - lastScanTime > 120) {
            lastScanTime = now;
            
            try {
              const videoWidth = video.videoWidth;
              const videoHeight = video.videoHeight;
              
              if (videoWidth && videoHeight) {
                // The video is rendered inside a 1:1 container with object-fit: cover.
                // We crop only the visible 1:1 center scan target region, serving as a digital zoom helper.
                const visibleSize = Math.min(videoWidth, videoHeight);
                // Target box is 180px out of 320px viewport size (approx 56% size).
                // We crop 60% of the visible size to focus the canvas right on the green scanning box.
                const cropSize = Math.round(visibleSize * 0.60);
                
                const sx = Math.max(0, Math.round((videoWidth - cropSize) / 2));
                const sy = Math.max(0, Math.round((videoHeight - cropSize) / 2));
                
                // Downscale cropped area slightly for fast JS decoding, but keep it high enough (360px is optimal)
                const canvasSize = Math.min(cropSize, 360);
                canvas.width = canvasSize;
                canvas.height = canvasSize;
                
                // Draw only the cropped center square of the video frame
                ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, canvasSize, canvasSize);

                if (nativeDetector) {
                  // Use native detector on the cropped high-contrast canvas (extremely accurate, zooms in on far code)
                  const barcodes = await nativeDetector.detect(canvas);
                  if (barcodes.length > 0) {
                    const scannedPlate = barcodes[0].rawValue;
                    if (scannedPlate) {
                      handleQrScanned(scannedPlate);
                      return; // Stop scan loop
                    }
                  }
                } else {
                  // Use jsQR fallback on the cropped canvas (high speed, digital zoom)
                  const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
                  const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert'
                  });
                  
                  if (code && code.data) {
                    const scannedPlate = code.data;
                    handleQrScanned(scannedPlate);
                    return; // Stop scan loop
                  }
                }
              }
            } catch (err) {
              console.error('QR loop error:', err);
            }
          }
        }
        qrRafRef.current = requestAnimationFrame(scanLoop);
      };

      qrRafRef.current = requestAnimationFrame(scanLoop);
    } catch (err) {
      console.error(err);
      setQrError(err.message || 'Failed to start camera for QR scanning');
    }
  };

  const stopQrScanner = () => {
    if (qrRafRef.current) {
      cancelAnimationFrame(qrRafRef.current);
      qrRafRef.current = null;
    }
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach(t => t.stop());
      qrStreamRef.current = null;
    }
  };

  const handleQrScanned = async (plateNumber) => {
    stopQrScanner();
    setScanStatus('Verifying QR Code...');
    setActionLoading(true);
    try {
      const res = await fetch('/api/equipment/movements/qr-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('smas_token') || ''}`
        },
        body: JSON.stringify({ plateNumber })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve vehicle QR');
      
      setAnalysisResult(data);
      if (data.vehicle) {
        setOverridePlate(data.vehicle.plateNumber);
        setScanStatus('Vehicle Found via QR');
      } else {
        setOverridePlate(plateNumber);
        setScanStatus('Unknown Vehicle');
      }
    } catch (err) {
      alert(err.message);
      setScanMethod(null);
      setScanStatus('Waiting for Vehicle');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    if (scanMethod === 'qr') {
      startQrScanner();
    } else {
      stopQrScanner();
    }
    return () => stopQrScanner();
  }, [scanMethod]);

  useEffect(() => {
    setScanMethod(null);
    setAnalysisResult(null);
    setScanStatus('Waiting for Vehicle');
  }, [tab]);

  const scanDivisionDepartments = useMemo(() => {
    return departments.filter((d) =>
      d.divisionIds?.some((div) => (div._id || div) === scanDivisionId)
    );
  }, [departments, scanDivisionId]);

  const selectedScanDepartmentName = useMemo(() => {
    return scanDivisionDepartments.find((d) => d._id === scanDepartmentId)?.name || '';
  }, [scanDivisionDepartments, scanDepartmentId]);

  useEffect(() => {
    const headers = { 'Authorization': `Bearer ${localStorage.getItem('smas_token') || ''}` };
    Promise.all([
      fetch('/api/vehicles', { headers }).then(r => r.json()),
      fetch('/api/departments', { headers }).then(r => r.json()),
      fetch('/api/divisions', { headers }).then(r => r.json())
    ]).then(([vehData, deptData, divData]) => {
      setVehicles(Array.isArray(vehData) ? vehData : []);
      setDepartments(Array.isArray(deptData) ? deptData : []);
      setDivisions(Array.isArray(divData) ? divData : []);
    });
  }, []);

  const handleManualAction = async (type) => {
    if (!vehicleId) return alert('Please select a vehicle');
    if (type === 'entry' && !departmentId) return alert('Please select a department for entry');
    
    setActionLoading(true);
    try {
      const res = await fetch(`/api/equipment/movements/${type}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('smas_token') || ''}`
        },
        body: JSON.stringify({
          vehicleId,
          departmentId: type === 'entry' ? departmentId : undefined,
          divisionId: divisionId,
          movementSource: 'manual'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record movement');
      alert(`Successfully recorded ${type}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCapture = async (blob) => {
    if (!blob) return;
    if (scanDirection === 'Entry' && !scanDepartmentId) {
      return alert('Please select a department first');
    }

    setScanStatus('Running OCR');
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', blob, 'capture.jpg');
      
      const res = await fetch('/api/equipment/movements/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('smas_token') || ''}`
        },
        body: formData
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      
      setAnalysisResult(data);
      if (data.vehicle) {
        setOverridePlate(data.vehicle.plateNumber);
        setScanStatus('Vehicle Found');
      } else {
        setOverridePlate(data.aiResult?.frontPlateNumber || '');
        setScanStatus('Unknown Vehicle');
      }
    } catch (err) {
      alert(err.message);
      setScanStatus('Waiting for Vehicle');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleCapture(file);
      e.target.value = null;
    }
  };

  const handleConfirmScan = async () => {
    setActionLoading(true);
    try {
      const isOverride = overridePlate !== (analysisResult.vehicle?.plateNumber || analysisResult.aiResult?.frontPlateNumber);
      
      let finalVehicleId = analysisResult.vehicle?._id;
      if (isOverride) {
        const matchingVehicle = vehicles.find(v => v.plateNumber.toLowerCase().replace(/\s+/g, '') === overridePlate.toLowerCase().replace(/\s+/g, ''));
        if (!matchingVehicle) {
          throw new Error('Overridden plate does not exist in master. Please register it first.');
        }
        finalVehicleId = matchingVehicle._id;
      }

      if (!finalVehicleId) {
        throw new Error('Cannot proceed without a valid registered vehicle.');
      }

      let resolvedDirection = scanDirection;
      if (scanDirection === 'Auto') {
        if (analysisResult.activeMovement) {
          resolvedDirection = (analysisResult.activeMovement.departmentId._id || analysisResult.activeMovement.departmentId) === scanDepartmentId ? 'Exit' : 'Entry';
        } else {
          resolvedDirection = 'Entry';
        }
      }

      const payload = {
        vehicleId: finalVehicleId,
        divisionId: scanDivisionId,
        departmentId: scanDepartmentId,
        direction: resolvedDirection,
        snapshotUrl: analysisResult.snapshotUrl,
        confidence: analysisResult.aiResult?.confidence?.ocr || 0,
        aiPlate: analysisResult.aiResult?.frontPlateNumber || 'Unknown',
        confirmedPlate: overridePlate,
        isOverride,
        driverId: analysisResult.driver?._id || undefined
      };

      const res = await fetch('/api/equipment/movements/capture', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('smas_token') || ''}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to capture movement');
      
      alert(data.message);
      setAnalysisResult(null);
      setScanMethod(null);
      setScanStatus('Waiting for Vehicle');
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };



  const renderTimelineStatus = (label, active, completed) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', opacity: active || completed ? 1 : 0.4 }}>
      <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: completed ? 'var(--success)' : active ? 'var(--primary)' : 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {completed && <AdminIcon name="check" size={12} style={{ color: '#fff' }} />}
      </div>
      <span style={{ fontWeight: active ? 'bold' : 'normal', color: active ? 'var(--primary)' : 'inherit' }}>{label}</span>
    </div>
  );

  return (
    <PageShell title="Equipment Entry & Exit" description="Manage access control for equipment.">
      <div className="admin-fade-in">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', alignItems: 'start' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* 75% / 25% Grid */}
            <div className="vehicle-entry-grid">
              
              {/* LEFT SIDE: Camera */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="admin-panel glass-panel vehicle-entry-filters">
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem', display: 'block' }}>Division</label>
                    <select 
                      className="admin-input"
                      value={scanDivisionId}
                      onChange={e => {
                        setScanDivisionId(e.target.value);
                        setScanDepartmentId('');
                      }}
                    >
                      <option value="">Select Division...</option>
                      {divisions.map(d => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem', display: 'block' }}>Department *</label>
                    <SearchableSelect
                      options={scanDivisionDepartments.map((d) => d.name)}
                      value={selectedScanDepartmentName}
                      onChange={(name) => {
                        const selectedDepartment = scanDivisionDepartments.find((d) => d.name === name);
                        setScanDepartmentId(selectedDepartment?._id || '');
                      }}
                      placeholder="Select Department..."
                      emptyValue=""
                      className="admin-input"
                      disabled={!scanDivisionId}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem', display: 'block' }}>Direction</label>
                    <select 
                      className="admin-input"
                      value={scanDirection}
                      onChange={e => setScanDirection(e.target.value)}
                    >
                      <option value="Auto">Auto (Smart Detect)</option>
                      <option value="Entry">Entry (Force)</option>
                      <option value="Exit">Exit (Force)</option>
                    </select>
                  </div>
                </div>

                <div className="admin-panel glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                  {!analysisResult ? (
                    scanMethod === null ? (
                      <div style={{ padding: '3rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2rem', minHeight: '320px', backgroundColor: 'var(--surface-sunken)' }}>
                        <div style={{ textAlign: 'center' }}>
                          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Select Scan Method</h3>
                          <p className="text-muted" style={{ fontSize: '0.875rem', margin: 0 }}>Choose how you want to detect the vehicle for entry/exit.</p>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', width: '100%', maxWidth: '500px', justifyContent: 'center' }}>
                          <button 
                            type="button"
                            onClick={() => setScanMethod('camera')}
                            className="scan-method-card"
                          >
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(26, 86, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Take / Upload Image</strong>
                              <span className="text-muted" style={{ fontSize: '0.75rem' }}>Use plate OCR recognition</span>
                            </div>
                          </button>

                          <button 
                            type="button"
                            onClick={() => setScanMethod('qr')}
                            className="scan-method-card"
                          >
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)' }}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Scan QR Pass</strong>
                              <span className="text-muted" style={{ fontSize: '0.75rem' }}>Instant QR pass lookup</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    ) : scanMethod === 'camera' ? (
                      <>
                        <div className="custom-camera-wrapper" style={{ position: 'relative', height: 'min(50vh, 400px)', minHeight: '260px', backgroundColor: '#000', display: 'flex', alignItems: 'stretch' }}>
                          <style dangerouslySetInnerHTML={{__html: `
                            .custom-camera-wrapper .camera-capture {
                              width: 100% !important;
                              height: 100% !important;
                              display: flex !important;
                              flex-direction: column !important;
                              margin: 0 !important;
                              padding: 0 !important;
                              border: none !important;
                              background: #000 !important;
                              max-width: none !important;
                            }
                            .custom-camera-wrapper .camera-viewport {
                              flex: 1 !important;
                              width: 100% !important;
                              height: 100% !important;
                              background: #000 !important;
                              border-radius: 0 !important;
                              margin: 0 !important;
                              padding: 0 !important;
                              max-width: none !important;
                              aspect-ratio: unset !important;
                            }
                            .custom-camera-wrapper .camera-viewport video {
                              width: 100% !important;
                              height: 100% !important;
                              object-fit: cover !important;
                              border-radius: 0 !important;
                            }
                            .custom-camera-wrapper .camera-actions {
                              padding: 1rem !important;
                              background: var(--surface-sunken) !important;
                              display: block !important;
                            }
                            .custom-camera-wrapper .camera-actions button {
                              width: 100% !important;
                              padding: 1rem !important;
                              font-size: 1.125rem !important;
                              font-weight: bold !important;
                              text-transform: uppercase !important;
                              border-radius: 8px !important;
                              background-color: var(--primary) !important;
                              color: white !important;
                              border: none !important;
                              cursor: pointer !important;
                              box-shadow: 0 4px 6px rgba(26, 86, 255, 0.2) !important;
                            }
                            .custom-camera-wrapper .camera-actions button:hover {
                              background-color: var(--primary-dark, #0d3bcf) !important;
                            }
                            .scan-method-card {
                              flex: 1 1 200px;
                              padding: 2.25rem 1.5rem;
                              display: flex;
                              flex-direction: column;
                              align-items: center;
                              gap: 1.25rem;
                              cursor: pointer;
                              border: 1px solid var(--border-color) !important;
                              border-radius: 12px;
                              background: var(--surface-base);
                              text-align: center;
                              transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                            }
                            .scan-method-card:hover {
                              transform: translateY(-4px);
                              border-color: var(--primary) !important;
                              box-shadow: 0 10px 15px -3px rgba(26, 86, 255, 0.1), 0 4px 6px -2px rgba(26, 86, 255, 0.05);
                            }
                          `}} />
                          <div style={{ position: 'absolute', top: '1rem', left: 0, right: 0, textAlign: 'center', zIndex: 10, color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
                            <span style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '4px', fontWeight: 'bold' }}>Align Vehicle Plate Here</span>
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
                            <CameraCapture 
                              onCapture={handleCapture}
                              label="Scan Equipment Plate"
                              processing={actionLoading}
                              processingLabel="Analyzing..."
                            />
                          </div>
                        </div>
                        
                        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-sunken)' }}>
                          <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => setScanMethod(null)}>
                            Go Back
                          </button>
                          
                          <label className="admin-btn admin-btn--sm admin-btn--ghost" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                            Upload Image (Temporary)
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                          </label>
                        </div>
                      </>
                    ) : (
                      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a', overflow: 'hidden' }}>
                        {/* Header bar inside scanner */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#1e293b', zIndex: 10 }}>
                          <button 
                            type="button" 
                            onClick={() => setScanMethod(null)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', padding: '4px 8px', borderRadius: '6px', transition: 'background-color 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                            Back
                          </button>
                          <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#f8fafc', letterSpacing: '0.5px', textTransform: 'uppercase' }}>QR Scanner</span>
                          <div style={{ width: '48px' }}></div> {/* Spacer */}
                        </div>

                        {/* Scanner Viewport */}
                        {qrError ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#f87171', padding: '3rem 2rem', textAlign: 'center', gap: '1rem', minHeight: '260px' }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                            <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>{qrError}</div>
                            <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setScanMethod(null)}>Back to Methods</button>
                          </div>
                        ) : (
                          <div style={{ position: 'relative', width: '100%', maxWidth: '320px', height: '320px', margin: '2rem auto', borderRadius: '16px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}>
                            <video 
                              ref={qrVideoRef} 
                              autoPlay 
                              playsInline 
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                            />
                            
                            {/* Scanning Target frame overlay */}
                            <div style={{ position: 'absolute', width: '180px', height: '180px', border: '3px solid var(--success)', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                              {/* Laser Sweep Line animation */}
                              <div style={{
                                width: '90%',
                                height: '2px',
                                background: 'linear-gradient(to right, transparent, var(--success), transparent)',
                                position: 'absolute',
                                top: 0,
                                animation: 'laser-sweep 2s infinite ease-in-out',
                                boxShadow: '0 0 8px var(--success)'
                              }} />
                            </div>

                            {/* Sweep Animation style definition */}
                            <style dangerouslySetInnerHTML={{__html: `
                              @keyframes laser-sweep {
                                0% { top: 5%; }
                                50% { top: 95%; }
                                100% { top: 5%; }
                              }
                            `}} />

                            {/* Help hint */}
                            <div style={{ position: 'absolute', bottom: '1rem', textAlign: 'center', left: 0, right: 0, zIndex: 10, pointerEvents: 'none' }}>
                              <span style={{ backgroundColor: 'rgba(15,23,42,0.85)', color: '#f8fafc', padding: '0.4rem 0.8rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: '600', border: '1px solid rgba(255,255,255,0.1)' }}>
                                Center the QR code inside the box
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div style={{ position: 'relative', height: '100%', minHeight: '400px', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--surface-base)' }}>
                       <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                         <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Operator Confirmation</h2>
                       </div>
                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', padding: '1.5rem', flex: 1 }}>
                           <div>
                             <div className="text-muted" style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Captured Image</div>
                             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', height: '350px', border: '1px solid var(--border-color)' }}>
                                {analysisResult.snapshotUrl ? (
                                  <img 
                                    src={analysisResult.snapshotUrl.startsWith('http') ? resolvePhotoUrl(analysisResult.snapshotUrl) : resolvePhotoUrl(`/uploads/activity/${analysisResult.snapshotUrl}`)} 
                                    alt="Capture" 
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                                  />
                                ) : analysisResult.vehicle?.metadata?.photos?.front ? (
                                  <img 
                                    src={analysisResult.vehicle.metadata.photos.front.startsWith('http') ? resolvePhotoUrl(analysisResult.vehicle.metadata.photos.front) : resolvePhotoUrl(`/uploads/vehicles/${analysisResult.vehicle.metadata.photos.front}`)} 
                                    alt="Vehicle Front (Master)" 
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                                  />
                                ) : (
                                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No Vehicle Image Available</div>
                                )}
                             </div>
                           </div>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              
                              {analysisResult.driver && (
                                <div style={{ display: 'flex', gap: '1rem', padding: '1rem', backgroundColor: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--success)', flexShrink: 0 }}>
                                    {analysisResult.driver.photos?.photo ? (
                                      <img src={resolvePhotoUrl(`/uploads/photos/${analysisResult.driver.photos.photo}`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                      <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <AdminIcon name="user" size={32} />
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold' }}>Matched Driver</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{analysisResult.driver.formData?.name || analysisResult.driver.registrationCode}</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--success)' }}>Face Match: {(analysisResult.driverMatchScore * 100).toFixed(1)}%</div>
                                  </div>
                                </div>
                              )}
                              
                              <div className="admin-form-group">
                                 <label>Confirm Plate (Manual Override)</label>
                                <input 
                                  type="text" 
                                  className="admin-input"
                                  style={{ fontFamily: 'monospace', fontSize: '1.25rem', textTransform: 'uppercase' }}
                                  value={overridePlate}
                                  onChange={e => setOverridePlate(e.target.value)}
                                />
                             </div>
                             
                             {analysisResult.activeMovement && analysisResult.activeMovement.departmentId?._id !== scanDepartmentId && (
                               <div style={{ backgroundColor: 'rgba(255, 165, 0, 0.1)', border: '1px solid orange', padding: '0.75rem', borderRadius: '6px', color: 'darkorange', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                                 <strong>Warning:</strong> Vehicle is currently active inside <strong>{analysisResult.activeMovement.departmentId?.name}</strong>. An Entry here will automatically Exit it from the previous department.
                               </div>
                             )}
                             
                             {(() => {
                               const isValidOverride = vehicles.some(v => v.plateNumber.toLowerCase().replace(/\s+/g, '') === overridePlate.toLowerCase().replace(/\s+/g, ''));
                               const canProceed = analysisResult.vehicle || isValidOverride;
                               
                               let resolvedLabel = scanDirection;
                               if (scanDirection === 'Auto') {
                                 resolvedLabel = analysisResult.activeMovement && (analysisResult.activeMovement.departmentId._id || analysisResult.activeMovement.departmentId) === scanDepartmentId ? 'Exit' : 'Entry';
                               }

                               return (
                                 <div style={{ marginTop: 'auto', display: 'flex', gap: '1rem' }}>
                                   <button 
                                     onClick={() => { setAnalysisResult(null); setScanMethod(null); setScanStatus('Waiting for Vehicle'); }}
                                     className="admin-btn admin-btn--secondary"
                                     style={{ flex: 1 }}
                                   >
                                     Cancel / Retake
                                   </button>
                                   <button 
                                     onClick={handleConfirmScan}
                                     disabled={actionLoading || !canProceed}
                                     className="admin-btn admin-btn--primary"
                                     style={{ flex: 1, fontWeight: 'bold', opacity: canProceed ? 1 : 0.5, cursor: canProceed ? 'pointer' : 'not-allowed' }}
                                     title={!canProceed ? "Cannot proceed without a valid registered vehicle" : ""}
                                   >
                                     {actionLoading ? 'Processing...' : `Confirm ${resolvedLabel}`}
                                   </button>
                                 </div>
                               );
                             })()}
                             {!analysisResult.vehicle && (
                                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                                  <a href="/vehicles/registrations/new" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 'bold' }}>
                                    Register New Equipment →
                                  </a>
                                </div>
                              )}
                          </div>
                       </div>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT SIDE: Detection Results & Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                <div className="admin-panel glass-panel" style={{ position: 'sticky', top: '1.5rem' }}>
                  <h3 style={{ fontSize: '1rem', textTransform: 'uppercase', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>Live Processing</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                    {renderTimelineStatus('Waiting for Vehicle', scanStatus === 'Waiting for Vehicle', scanStatus !== 'Waiting for Vehicle')}
                    {scanMethod === 'qr' ? (
                      <>
                        {renderTimelineStatus('Reading QR Code', scanStatus === 'Verifying QR Code...', scanStatus === 'Vehicle Found via QR' || scanStatus === 'Unknown Vehicle')}
                        {renderTimelineStatus('Searching Vehicle Master', scanStatus === 'Verifying QR Code...', scanStatus === 'Vehicle Found via QR' || scanStatus === 'Unknown Vehicle')}
                      </>
                    ) : (
                      <>
                        {renderTimelineStatus('Running OCR', scanStatus === 'Running OCR', scanStatus === 'Vehicle Found' || scanStatus === 'Unknown Vehicle')}
                        {renderTimelineStatus('Searching Vehicle Master', scanStatus === 'Running OCR', scanStatus === 'Vehicle Found' || scanStatus === 'Unknown Vehicle')}
                      </>
                    )}
                    {renderTimelineStatus('Vehicle Found', scanStatus === 'Vehicle Found' || scanStatus === 'Vehicle Found via QR', false)}
                    {scanStatus === 'Unknown Vehicle' && renderTimelineStatus('Unknown Vehicle', true, false)}
                  </div>

                  <h3 style={{ fontSize: '1rem', textTransform: 'uppercase', marginBottom: '1rem' }}>Detection Results</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>Status</span>
                      {actionLoading ? <span style={{ width: '60px', height: '16px', backgroundColor: 'var(--surface-sunken)' }} /> : <span className={`admin-badge admin-badge--${analysisResult ? 'primary' : 'secondary'}`}>{scanStatus}</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>Plate Number</span>
                      {actionLoading ? <span style={{ width: '80px', height: '16px', backgroundColor: 'var(--surface-sunken)' }} /> : <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{analysisResult?.aiResult?.frontPlateNumber || 'N/A'}</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>Confidence</span>
                      {actionLoading ? <span style={{ width: '40px', height: '16px', backgroundColor: 'var(--surface-sunken)' }} /> : <span style={{ fontWeight: 'bold' }}>{analysisResult?.aiResult?.confidence?.ocr ? `${analysisResult.aiResult.confidence.ocr}%` : 'N/A'}</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>Vehicle Master</span>
                      {actionLoading ? (
                        <span style={{ width: '60px', height: '16px', backgroundColor: 'var(--surface-sunken)' }} />
                      ) : (
                        analysisResult ? (
                          <span className={`admin-badge admin-badge--${analysisResult.vehicle ? 'success' : 'danger'}`}>
                            {analysisResult.vehicle ? 'Found' : 'Not Found'}
                          </span>
                        ) : (
                          <span className="admin-badge admin-badge--secondary">Waiting</span>
                        )
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>Vehicle Type</span>
                      {actionLoading ? <span style={{ width: '60px', height: '16px', backgroundColor: 'var(--surface-sunken)' }} /> : <span>{analysisResult?.vehicle?.typeId?.name || analysisResult?.aiResult?.vehicleType || 'N/A'}</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>Driver Match</span>
                      {actionLoading ? (
                        <span style={{ width: '60px', height: '16px', backgroundColor: 'var(--surface-sunken)' }} />
                      ) : (
                        analysisResult?.driver ? (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold' }}>{analysisResult.driver.formData?.name || analysisResult.driver.registrationCode}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--success)' }}>Match: {(analysisResult.driverMatchScore * 100).toFixed(1)}%</div>
                          </div>
                        ) : (
                          <span className="text-muted">Not Found</span>
                        )
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted" style={{ fontSize: '0.875rem' }}>Last Scan Time</span>
                      <span>{analysisResult ? new Date().toLocaleTimeString() : 'N/A'}</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* STATUS HEADER */}
      <div className="vehicle-entry-statuses" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginTop: '1.5rem' }}>
        <div className="admin-panel glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="text-muted" style={{ fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Camera Status</div>
          <div><span className="admin-badge admin-badge--success">Online</span></div>
        </div>
        <div className="admin-panel glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="text-muted" style={{ fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>AI OCR Status</div>
          <div><span className="admin-badge admin-badge--success">Active</span></div>
        </div>
        <div className="admin-panel glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="text-muted" style={{ fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Vehicle Master Status</div>
          <div><span className="admin-badge admin-badge--success">Connected</span></div>
        </div>
        <div className="admin-panel glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="text-muted" style={{ fontSize: '0.875rem', textTransform: 'uppercase', fontWeight: '600', letterSpacing: '0.5px' }}>Backend Status</div>
          <div><span className="admin-badge admin-badge--success">Connected</span></div>
        </div>
      </div>
    </PageShell>
  );
}

export default function EquipmentMovementsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
      <MovementsContent />
    </Suspense>
  );
}

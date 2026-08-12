"use client";

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import CameraCapture from '../../../components/CameraCapture';
import PageTabs from '@/components/PageTabs';
import PageShell from '@/components/PageShell';
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
                      onChange={e => { setScanDivisionId(e.target.value); setScanDepartmentId(''); }}
                    >
                      <option value="">Select Division...</option>
                      {divisions.map(d => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem', display: 'block' }}>Department *</label>
                    <select 
                      className="admin-input"
                      value={scanDepartmentId}
                      onChange={e => setScanDepartmentId(e.target.value)}
                      disabled={!scanDivisionId}
                    >
                      <option value="">Select Department...</option>
                      {departments.filter(d => d.divisionIds?.some(div => (div._id || div) === scanDivisionId)).map(d => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
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
                      
                      {/* Temporary Upload Control */}
                      <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center', backgroundColor: 'var(--surface-sunken)' }}>
                        <label className="admin-btn admin-btn--sm admin-btn--ghost" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                          Upload Image (Temporary)
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                        </label>
                      </div>
                    </>
                  ) : (
                    <div style={{ position: 'relative', height: '100%', minHeight: '400px', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--surface-base)' }}>
                       <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                         <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Operator Confirmation</h2>
                       </div>
                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', padding: '1.5rem', flex: 1 }}>
                           <div>
                             <div className="text-muted" style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Captured Image</div>
                             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', height: '350px' }}>
                               <img src={analysisResult.snapshotUrl?.startsWith('http') ? resolvePhotoUrl(analysisResult.snapshotUrl) : resolvePhotoUrl(`/uploads/activity/${analysisResult.snapshotUrl}`)} alt="Capture" style={{ width: '100%', height: '100%', objectFit: 'contain', border: '1px solid var(--border-color)' }} />
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
                                     onClick={() => { setAnalysisResult(null); setScanStatus('Waiting for Vehicle'); }}
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
                    {renderTimelineStatus('Running OCR', scanStatus === 'Running OCR', scanStatus === 'Vehicle Found' || scanStatus === 'Unknown Vehicle')}
                    {renderTimelineStatus('Searching Vehicle Master', scanStatus === 'Running OCR', scanStatus === 'Vehicle Found' || scanStatus === 'Unknown Vehicle')}
                    {renderTimelineStatus('Vehicle Found', scanStatus === 'Vehicle Found', false)}
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

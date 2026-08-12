"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import PageTabs from '@/components/PageTabs';
import CameraCapture from '@/components/CameraCapture';
import AdminIcon from '@/components/admin/AdminIcons';
import { api } from '@/lib/api/client';

const CAPTURE_STEPS = [
  { id: 'front', label: 'Vehicle Photo' },
  { id: 'frontPlate', label: 'Number Plate Photo' },
];

export default function NewVehicleRegistrationPage() {
  const router = useRouter();
  
  // Form State
  const [formData, setFormData] = useState({
    plateNumber: '',
    equipmentName: '',
    typeId: '',
    categoryId: '',
    remarks: ''
  });
  
  const [files, setFiles] = useState({
    front: null,
    frontPlate: null,
  });

  // Camera & Capture Target State
  const [activeTarget, setActiveTarget] = useState('front');
  const [selectedCamera, setSelectedCamera] = useState('');
  const [cameras, setCameras] = useState([]);
  const [previewModal, setPreviewModal] = useState(null); 
  
  // OCR & Submission State
  const [aiStatus, setAiStatus] = useState('idle'); // 'idle', 'processing', 'completed'
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  // Existing Vehicle State
  const [foundInMaster, setFoundInMaster] = useState(false);
  const [existingVehicle, setExistingVehicle] = useState(null);
  
  // Lookups
  const [types, setTypes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isAddingNewType, setIsAddingNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  useEffect(() => {
    Promise.all([
      api.vehicles.types.list().catch(() => []),
      api.vehicles.categories.list().catch(() => [])
    ]).then(([typesData, categoriesData]) => {
      if (Array.isArray(typesData)) setTypes(typesData);
      if (Array.isArray(categoriesData)) setCategories(categoriesData);
    });

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setCameras(videoDevices);
        const lastCamera = localStorage.getItem('smas.lastCamera');
        if (lastCamera && videoDevices.find(d => d.deviceId === lastCamera)) {
          setSelectedCamera(lastCamera);
        } else if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
      });
    }
  }, []);

  const handleCameraChange = (e) => {
    const devId = e.target.value;
    setSelectedCamera(devId);
    localStorage.setItem('smas.lastCamera', devId);
  };

  const handleCapture = (blob) => {
    setFiles(prev => {
      const newFiles = { ...prev, [activeTarget]: blob };
      
      const currentIdx = CAPTURE_STEPS.findIndex(s => s.id === activeTarget);
      if (currentIdx < CAPTURE_STEPS.length - 1) {
        const nextId = CAPTURE_STEPS[currentIdx + 1].id;
        if (!newFiles[nextId]) {
          setActiveTarget(nextId);
        } else {
          const firstEmpty = CAPTURE_STEPS.find(s => !newFiles[s.id]);
          if (firstEmpty) setActiveTarget(firstEmpty.id);
        }
      } else {
        const firstEmpty = CAPTURE_STEPS.find(s => !newFiles[s.id]);
        if (firstEmpty) setActiveTarget(firstEmpty.id);
      }
      
      const allCaptured = Object.values(newFiles).every(f => f !== null);
      if (allCaptured && aiStatus === 'idle') {
        analyzeRegistration(newFiles);
      }
      
      return newFiles;
    });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleCapture(file);
      e.target.value = null;
    }
  };

  const analyzeRegistration = async (currentFiles) => {
    setAiStatus('processing');
    setError(null);
    
    try {
      const formPayload = new FormData();
      Object.entries(currentFiles).forEach(([key, file]) => {
        if (file) {
          formPayload.append(key, file, `${key}.jpg`);
        }
      });
      
      const res = await fetch('/api/vehicles/registrations/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('smas_token') || ''}`
        },
        body: formPayload
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      
      setAiResult(data.ocrDetails);
      setFormData(prev => ({ ...prev, plateNumber: data.plateNumber }));
      
      if (data.foundInMaster) {
        setFoundInMaster(true);
        setExistingVehicle(data.vehicle);
      } else {
        setFoundInMaster(false);
      }
      
      setAiStatus('completed');
    } catch (err) {
      setError(err.message);
      setAiStatus('idle'); // Allow retry
    }
  };

  const handleAddNewType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const res = await fetch('/api/vehicles/types', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('smas_token') || ''}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newTypeName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create type');
      
      setTypes([data, ...types]);
      setFormData({ ...formData, typeId: data._id });
      setIsAddingNewType(false);
      setNewTypeName('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const formPayload = new FormData();
      formPayload.append('formId', '000000000000000000000000'); 
      formPayload.append('plateNumber', formData.plateNumber);
      formPayload.append('data', JSON.stringify({
        typeId: formData.typeId,
        equipmentName: formData.equipmentName,
        remarks: formData.remarks
      }));
      
      Object.entries(files).forEach(([key, file]) => {
        if (file) {
          formPayload.append(key, file, `${key}.jpg`);
        }
      });

      console.log('--- Frontend FormData ---');
      console.log('Keys:', Array.from(formPayload.keys()));
      console.log('Entries:');
      for (let pair of formPayload.entries()) {
        console.log(pair[0], pair[1] instanceof File ? `File (${pair[1].size} bytes, ${pair[1].name})` : pair[1]);
      }
      
      const res = await fetch('/api/vehicles/registrations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('smas_token') || ''}`
        },
        body: formPayload
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to submit registration');
      
      setSubmitSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (submitSuccess) {
    return (
      <PageShell title="Vehicle Registration" description="Step-by-step guided registration for logistics equipment.">
        <div className="admin-panel glass-panel admin-fade-in" style={{ padding: '3rem 2rem', textAlign: 'center', maxWidth: '600px', margin: '4rem auto' }}>
          <div style={{ width: '64px', height: '64px', backgroundColor: 'var(--success)', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Registration Submitted Successfully</h2>
          <p className="text-muted" style={{ marginBottom: '2rem' }}>The registration is now Pending Approval.</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
            <button className="admin-btn admin-btn--ghost" onClick={() => router.push('/vehicles/registrations?status=Pending')}>View Pending</button>
            <button className="admin-btn admin-btn--primary" onClick={() => router.push('/vehicles')}>Go to Vehicle Master</button>
          </div>
        </div>
      </PageShell>
    );
  }

  const isFormComplete = Object.values(files).every(f => f !== null) && formData.plateNumber && !foundInMaster;

  return (
    <PageShell 
      title="Vehicle Registration" 
      description="Live Gate Capture System"
    >
      
      {error && (
        <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '16px', borderRadius: '4px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AdminIcon name="alert" /> {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '6rem' }} className="admin-fade-in">
        
        {/* SECTION 2: Split Layout */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
          
          {/* LEFT COLUMN: Vehicle Details */}
          <div style={{ flex: '1 1 45%', minWidth: 'min(100%, 350px)', display: 'flex', flexDirection: 'column' }}>
            {foundInMaster ? (
              <div className="admin-panel glass-panel" style={{ padding: '2rem', height: '100%', backgroundColor: '#fffbe1', border: '1px solid #fde047' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', color: '#854d0e' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 'bold' }}>Vehicle Already Registered</h2>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.7)', padding: '1.5rem', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '600' }}>Plate Number</span>
                    <span style={{ fontWeight: 'bold' }}>{existingVehicle?.plateNumber}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '600' }}>Vehicle Type</span>
                    <span>{existingVehicle?.type}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '600' }}>Equipment Name</span>
                    <span>{existingVehicle?.equipmentName}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '600' }}>Status</span>
                    <span className={`admin-badge admin-badge--${existingVehicle?.status === 'Active' ? 'success' : 'warning'}`}>{existingVehicle?.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: '600' }}>Registration Date</span>
                    <span>{existingVehicle?.registrationDate ? new Date(existingVehicle.registrationDate).toLocaleDateString() : 'Unknown'}</span>
                  </div>
                </div>

                <div style={{ marginTop: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                  <button className="admin-btn admin-btn--primary" style={{ flex: '1 1 auto', whiteSpace: 'nowrap', minWidth: 'min-content' }} onClick={() => router.push('/vehicles')}>Go to Vehicle Profile</button>
                  <button className="admin-btn admin-btn--ghost" style={{ flex: '1 1 auto', whiteSpace: 'nowrap', minWidth: 'min-content' }} onClick={() => router.push('/equipment/movements')}>Go to Entry / Exit</button>
                </div>
              </div>
            ) : (
              <div className="admin-panel glass-panel" style={{ padding: '1.5rem', height: '100%', backgroundColor: 'var(--surface-sunken)', border: '1px solid var(--border-color)' }}>
                <h2 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                  Vehicle Details
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Plate Number (Auto-filled by AI)</label>
                    <input type="text" className="admin-input" value={formData.plateNumber} onChange={(e) => setFormData({...formData, plateNumber: e.target.value})} style={{ backgroundColor: 'var(--surface-base)', textTransform: 'uppercase' }} placeholder="Auto-filled by OCR" />
                  </div>
                  


                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Equipment Name</label>
                    <input type="text" className="admin-input" value={formData.equipmentName} onChange={(e) => setFormData({...formData, equipmentName: e.target.value})} style={{ backgroundColor: 'var(--surface-base)' }} />
                  </div>

                  
                  <div className="admin-form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: '600' }}>Remarks</label>
                    <textarea className="admin-input" rows="3" value={formData.remarks} onChange={(e) => setFormData({...formData, remarks: e.target.value})} style={{ backgroundColor: 'var(--surface-base)' }}></textarea>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Camera & OCR */}
          <div style={{ flex: '1 1 45%', minWidth: 'min(100%, 350px)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Camera Panel */}
            <div className="admin-panel glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1rem', backgroundColor: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.125rem', margin: 0, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--danger)', animation: 'pulse 2s infinite' }}></div>
                  Live Camera
                </h2>
                <select 
                  className="admin-input" 
                  value={selectedCamera} 
                  onChange={handleCameraChange}
                  style={{ width: '180px', padding: '0.25rem 0.5rem', fontSize: '0.875rem', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #334155' }}
                >
                  {cameras.map(c => (
                    <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${c.deviceId.substring(0,5)}`}</option>
                  ))}
                </select>
              </div>
              
              {/* Camera Feed */}
              <div className="custom-camera-wrapper" style={{ backgroundColor: '#000', position: 'relative', height: '360px', display: 'flex', alignItems: 'stretch' }}>
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <CameraCapture 
                    key={activeTarget}
                    autoStart={true}
                    onCapture={handleCapture}
                    label={`CAPTURE ${CAPTURE_STEPS.find(s => s.id === activeTarget)?.label.toUpperCase()}`}
                  />
                </div>
              </div>
              
              {/* Capture Controls beneath feed */}
              <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-sunken)' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>
                  Target: <span style={{ color: 'var(--primary)', textTransform: 'uppercase' }}>{CAPTURE_STEPS.find(s => s.id === activeTarget)?.label}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label className="admin-btn admin-btn--sm admin-btn--ghost" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    Upload Image
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                  </label>
                </div>
              </div>
            </div>

            {/* OCR Status Panel */}
            <div className="admin-panel glass-panel" style={{ padding: '1.5rem', backgroundColor: aiStatus === 'completed' ? 'rgba(16, 185, 129, 0.05)' : 'var(--surface-sunken)', border: aiStatus === 'completed' ? '1px solid var(--success)' : '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Analysis Status</h2>
              
              {aiStatus === 'idle' && (
                <div style={{ color: 'var(--text-muted)' }}>Waiting for both images to trigger OCR Analysis...</div>
              )}
              {aiStatus === 'processing' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                  <div className="dash-loading__spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                  Extracting...
                </div>
              )}
              {aiStatus === 'completed' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Detected Plate</span>
                    <div style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                      {formData.plateNumber || 'Unknown'}
                    </div>
                    <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Confidence</span>
                    <div style={{ fontSize: '1.25rem', color: aiResult?.confidence?.ocr > 80 ? 'var(--success)' : 'var(--warning)', fontWeight: 'bold' }}>
                      {aiResult?.confidence?.ocr || 0}%
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Master Lookup</span>
                    <div style={{ marginTop: '0.25rem' }}>
                      <span className={`admin-badge admin-badge--${foundInMaster ? 'warning' : 'success'}`}>
                        {foundInMaster ? 'Already Registered' : 'New Vehicle'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
          </div>
        </div>

        {/* SECTION 3: Required Photos Grid */}
        <div className="admin-panel glass-panel" style={{ padding: '1.5rem', backgroundColor: 'var(--surface-base)' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Required Photos</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
            {CAPTURE_STEPS.map((stepInfo) => {
              const file = files[stepInfo.id];
              const imgUrl = file ? URL.createObjectURL(file) : null;
              const isActive = activeTarget === stepInfo.id;
              
              return (
                <div 
                  key={stepInfo.id} 
                  style={{
                    border: isActive ? '3px solid var(--primary)' : (file ? '1px solid var(--success)' : '1px dashed var(--border-color)'),
                    borderRadius: '8px',
                    overflow: 'hidden',
                    backgroundColor: 'var(--surface-sunken)',
                    position: 'relative'
                  }}
                  onClick={() => setActiveTarget(stepInfo.id)}
                >
                  <div style={{ padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isActive ? 'rgba(26, 86, 255, 0.1)' : 'transparent', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: isActive ? 'var(--primary)' : 'var(--text-primary)' }}>
                      {stepInfo.label}
                    </span>
                    {file && (
                      <span style={{ color: 'var(--success)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </span>
                    )}
                  </div>
                  
                  <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {imgUrl ? (
                      <img src={imgUrl} alt={stepInfo.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Missing</span>
                    )}
                  </div>

                  <div style={{ padding: '0.5rem', display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--border-color)' }}>
                    {imgUrl ? (
                      <button className="admin-btn admin-btn--sm admin-btn--ghost" onClick={(e) => { e.stopPropagation(); setActiveTarget(stepInfo.id); }}>
                        Retake
                      </button>
                    ) : (
                      <button className={`admin-btn admin-btn--sm ${isActive ? 'admin-btn--primary' : 'admin-btn--secondary'}`} onClick={(e) => { e.stopPropagation(); setActiveTarget(stepInfo.id); }}>
                        Capture
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 4: Sticky Footer */}
      {!foundInMaster && (
        <>
          <style dangerouslySetInnerHTML={{__html: `
            .registration-sticky-footer {
              left: 280px;
            }
            @media (max-width: 768px) {
              .registration-sticky-footer {
                left: 0 !important;
                padding: 1rem !important;
              }
            }
          `}} />
          <div className="registration-sticky-footer" style={{ 
            position: 'fixed', 
            bottom: 0, 
            right: 0, 
            padding: '1rem 2rem', 
            background: 'var(--surface-base)', 
            borderTop: '1px solid var(--border-color)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            zIndex: 100,
            boxShadow: '0 -4px 12px rgba(0,0,0,0.05)'
          }}>
          <button className="admin-btn admin-btn--ghost" onClick={() => router.back()} style={{ fontWeight: 'bold' }}>Cancel</button>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="admin-btn admin-btn--primary" onClick={handleSubmit} disabled={loading || !isFormComplete} style={{ fontWeight: 'bold', padding: '0.5rem 2rem' }}>
              {loading ? 'Submitting...' : 'Submit Registration'}
            </button>
          </div>
        </div>
        </>
      )}
      {/* Preview Modal */}
      {previewModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPreviewModal(null)}>
           <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
             <button style={{ position: 'absolute', top: '-50px', right: 0, background: 'none', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer' }} onClick={() => setPreviewModal(null)}>✕</button>
             <img src={previewModal} alt="Preview" style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
           </div>
        </div>
      )}
    </PageShell>
  );
}

"use client";

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { resolvePhotoUrl } from '@/lib/photoUrl';
import PageShell from '@/components/PageShell';
import AdminIcon from '@/components/admin/AdminIcons';

export default function RegistrationDetailsPage({ params }) {
  const router = useRouter();
  // Unwrap params using `use()` as required by Next.js 15
  const unwrappedParams = use(params);
  const id = unwrappedParams.id;
  
  const [reg, setReg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState(null);

  useEffect(() => {
    if (id === 'manage') {
      router.replace('/vehicles');
      return;
    }

    api.vehicles.registrations.get(id)
      .then(data => {
        setReg(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to fetch registration');
        setLoading(false);
      });
  }, [id]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await api.vehicles.registrations.approve(id, {
        plateNumber: reg.plateNumber,
        departmentId: reg.data?.departmentId
      });
      router.push('/vehicles/registrations');
    } catch (err) {
      alert(err.message);
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason) return alert('Please provide a reason for rejection');
    
    setActionLoading(true);
    try {
      await api.vehicles.registrations.reject(id, { reason: rejectReason });
      router.push('/vehicles/registrations');
    } catch (err) {
      alert(err.message);
      setActionLoading(false);
    }
  };

  const handleRetake = async (photoKey, file) => {
    setActionLoading(true);
    try {
      await api.vehicles.registrations.updatePhoto(id, photoKey, file);
      // Refresh the registration data to show the new photo
      const updatedData = await api.vehicles.registrations.get(id);
      setReg(updatedData);
    } catch (err) {
      alert(err.message || 'Failed to update photo');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Loading Registration..." description="Fetching details from the server">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <div className="dash-loading__spinner"></div>
        </div>
      </PageShell>
    );
  }

  if (error || !reg) {
    return (
      <PageShell title="Error" description="Registration could not be loaded">
        <div className="admin-panel glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error || 'Not found'}</h2>
          <button className="admin-btn admin-btn--secondary" onClick={() => router.push('/vehicles/registrations')}>Go Back</button>
        </div>
      </PageShell>
    );
  }

  const isPending = reg.status === 'Pending';
  const aiData = reg.aiEnrollmentData && typeof reg.aiEnrollmentData === 'object' ? reg.aiEnrollmentData : {};
  const ocrConfidence = Number(aiData.confidence?.ocr || 0);
  const overallConfidence = Number(aiData.confidence?.overall || ocrConfidence || 0);
  const detectedPlate = aiData.normalizedPlateNumber || aiData.combinedPlate || aiData.frontPlateNumber || null;
  const hasAiSnapshot = Boolean(detectedPlate || ocrConfidence || aiData.validationStatus);
  const validationLabel = aiData.validationStatus === 'success' || aiData.validationStatus === 'Valid'
    ? 'Valid'
    : (aiData.validationStatus || (hasAiSnapshot ? 'Unknown' : 'Not captured'));
  const validationBadge = (aiData.validationStatus === 'success' || aiData.validationStatus === 'Valid')
    ? 'success'
    : (hasAiSnapshot ? 'warning' : 'secondary');
  
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved': return 'success';
      case 'Pending': return 'warning';
      case 'Rejected': return 'danger';
      default: return 'secondary';
    }
  };

  const getConfidenceColor = (conf) => {
    if (!conf) return 'var(--text-muted)';
    if (conf >= 90) return 'var(--success)';
    if (conf >= 70) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <PageShell 
      title="Vehicle Registration Details" 
      description={`ID: ${reg._id}`}
      toolbar={
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className={`admin-badge admin-badge--${getStatusBadge(reg.status)}`} style={{ fontSize: '1rem', padding: '0.25rem 0.75rem' }}>
            Status: {reg.status}
          </div>
          <button className="admin-btn admin-btn--ghost" onClick={() => router.back()}>
            <AdminIcon name="arrowLeft" /> Back
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }} className="admin-fade-in">
        
        {/* SECTION 1: Details and AI Analysis */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', gap: '1.5rem' }}>
          
          {/* Left Card: Vehicle Info */}
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h2 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              Vehicle Information
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>Plate Number</span>
                <span style={{ fontWeight: 'bold', fontSize: '1.125rem' }}>{reg.plateNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>Equipment Name</span>
                <span>{reg.data?.equipmentName || 'N/A'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>Vehicle Type</span>
                <span>{reg.data?.vehicleType || 'N/A'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>Registration Date</span>
                <span>{new Date(reg.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>Remarks</span>
                <span>{reg.data?.remarks || 'None'}</span>
              </div>
            </div>
          </div>

          {/* Right Card: AI Analysis */}
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h2 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              AI Analysis
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {!hasAiSnapshot && (
                <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#92400e' }}>
                  OCR snapshot was not saved with this registration. The plate <strong>{reg.plateNumber}</strong> was submitted without stored confidence data.
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>Detected Plate</span>
                <span style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 'bold' }}>{detectedPlate || 'Not captured'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>Submitted Plate</span>
                <span style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 'bold' }}>{aiData.submittedPlate || reg.plateNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>OCR Confidence</span>
                <span style={{ fontWeight: 'bold', color: getConfidenceColor(ocrConfidence) }}>
                  {hasAiSnapshot ? `${Math.round(ocrConfidence)}%` : 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>Overall Confidence</span>
                <span style={{ fontWeight: 'bold', color: getConfidenceColor(overallConfidence) }}>
                  {hasAiSnapshot ? `${Math.round(overallConfidence)}%` : 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>Validation Status</span>
                <span className={`admin-badge admin-badge--${validationBadge}`}>
                  {validationLabel}
                </span>
              </div>
              {aiData.matchType && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <span className="text-muted" style={{ fontWeight: '600' }}>Master Match</span>
                  <span>{aiData.matchType}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <span className="text-muted" style={{ fontWeight: '600' }}>Processing Time</span>
                <span>{aiData.processingTimeMs ? `${aiData.processingTimeMs}ms` : 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Photos Grid */}
        <div className="admin-panel glass-panel">
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
            Uploaded Images
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {['front', 'frontPlate'].map((key) => {
              const filename = reg.photos?.[key];
              const title = key.replace(/([A-Z])/g, ' $1').trim();
              
              return (
                <div key={key} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--surface-sunken)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.875rem' }}>
                    {title}
                  </div>
                  <div style={{ height: '180px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e2e8f0' }}>
                    {filename ? (
                      <img 
                        src={filename.startsWith('http') ? resolvePhotoUrl(filename) : resolvePhotoUrl(`/uploads/vehicles/${filename}`)} 
                        alt={title} 
                        style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }}
                        onClick={() => setEnlargedImage(filename.startsWith('http') ? resolvePhotoUrl(filename) : resolvePhotoUrl(`/uploads/vehicles/${filename}`))}
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                      />
                    ) : null}
                    <span style={{ display: filename ? 'none' : 'block', color: 'var(--text-muted)' }}>Image missing</span>
                  </div>
                  <div style={{ padding: '0.75rem', display: 'flex', justifyContent: 'center', gap: '0.5rem', backgroundColor: 'var(--surface-base)', borderTop: '1px solid var(--border-color)' }}>
                    {filename && (
                      <button className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => setEnlargedImage(filename.startsWith('http') ? resolvePhotoUrl(filename) : resolvePhotoUrl(`/uploads/vehicles/${filename}`))}>
                        <AdminIcon name="search" size={14} /> Enlarge
                      </button>
                    )}
                    {isPending && (
                      <label className="admin-btn admin-btn--sm admin-btn--ghost" style={{ cursor: 'pointer', margin: 0 }}>
                        Retake
                        <input 
                          type="file" 
                          accept="image/*" 
                          style={{ display: 'none' }} 
                          disabled={actionLoading}
                          onChange={(e) => { 
                            if(e.target.files[0]) handleRetake(key, e.target.files[0]); 
                            e.target.value = null; 
                          }} 
                        />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 4 & 3: Timeline & Approval */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', gap: '1.5rem' }}>
          
          {/* Timeline */}
          <div className="admin-panel glass-panel">
            <h2 style={{ fontSize: '1.125rem', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              Timeline
            </h2>
            <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--border-color)', position: 'relative', display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-21px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--primary)', border: '2px solid var(--surface-base)' }}></div>
                <div style={{ fontWeight: 'bold' }}>Registration Created</div>
                <div className="text-muted" style={{ fontSize: '0.875rem' }}>{new Date(reg.createdAt).toLocaleString()}</div>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-21px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: hasAiSnapshot ? 'var(--primary)' : 'var(--border-color)', border: '2px solid var(--surface-base)' }}></div>
                <div style={{ fontWeight: 'bold' }}>AI Processing</div>
                <div className="text-muted" style={{ fontSize: '0.875rem' }}>{hasAiSnapshot ? 'Completed' : 'Not captured'}</div>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-21px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: reg.status === 'Approved' ? 'var(--success)' : reg.status === 'Rejected' ? 'var(--danger)' : 'var(--warning)', border: '2px solid var(--surface-base)' }}></div>
                <div style={{ fontWeight: 'bold' }}>
                  {reg.status === 'Pending' ? 'Pending Review' : reg.status === 'Approved' ? 'Approved' : 'Rejected'}
                </div>
                <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                  {reg.status !== 'Pending' && reg.reviewedAt ? new Date(reg.reviewedAt).toLocaleString() : 'Awaiting Operator'}
                </div>
              </div>
            </div>
          </div>

          {/* Approval Workflow */}
          <div className="admin-panel glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2 style={{ fontSize: '1.125rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              Approval Workflow
            </h2>
            
            {isPending ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="admin-form-group">
                  <label>Reviewer Remarks (Required for Rejection)</label>
                  <textarea 
                    className="admin-input" 
                    rows="3"
                    placeholder="Enter notes..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  ></textarea>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <button 
                    className="admin-btn admin-btn--primary" 
                    onClick={handleApprove}
                    disabled={actionLoading}
                    style={{ flex: 1, padding: '0.75rem', fontWeight: 'bold' }}
                  >
                    {actionLoading ? 'Processing...' : 'Approve Registration'}
                  </button>
                  <button 
                    className="admin-btn admin-btn--danger" 
                    onClick={handleReject}
                    disabled={actionLoading}
                    style={{ flex: 1, padding: '0.75rem', fontWeight: 'bold' }}
                  >
                    {actionLoading ? 'Processing...' : 'Reject Registration'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className={`admin-badge admin-badge--${getStatusBadge(reg.status)}`} style={{ alignSelf: 'flex-start', fontSize: '1rem', padding: '0.5rem 1rem' }}>
                  Registration {reg.status}
                </div>
                {reg.status === 'Rejected' && (
                  <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid var(--danger)' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--danger)' }}>Rejection Reason</h4>
                    <p style={{ margin: 0 }}>{reg.notes || 'No reason provided.'}</p>
                  </div>
                )}
                {reg.status === 'Approved' && (
                  <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid var(--success)' }}>
                    <p style={{ margin: 0 }}>This vehicle has been moved to the active Vehicle Master registry.</p>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Modal for Enlarged Image */}
      {enlargedImage && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setEnlargedImage(null)}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <button style={{ position: 'absolute', top: '-40px', right: '0', background: 'none', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer' }} onClick={() => setEnlargedImage(null)}>
              &times;
            </button>
            <img src={enlargedImage} alt="Enlarged" style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
          </div>
        </div>
      )}
    </PageShell>
  );
}

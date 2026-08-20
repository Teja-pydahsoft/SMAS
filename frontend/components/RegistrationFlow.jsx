'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { clearGatePhotoForRegistration, loadGatePhotoForRegistration } from '@/lib/gateRegistration';
import DynamicFormFields, { validateMediaFields } from '@/components/DynamicFormFields';
import CameraCapture from '@/components/CameraCapture';
import PassCard from '@/components/PassCard';
import {
  parsePayFrequencySelection,
  serializePayFrequencySelection,
  inferPayFieldsFromLabourType,
  labourTypeFromForm,
} from '@/lib/payFrequency';

const STAGES = [
  { key: 'form', label: '1. Details & Photo' },
  { key: 'review', label: '2. Review' },
];

function resolveStage(registration) {
  if (!registration) return 'form';
  if (registration.status === 'verified' && registration.currentStage === 'completed') {
    return 'edit';
  }
  if (registration.currentStage === 'review' || registration.status === 'pending_verification') {
    return 'review';
  }
  if (registration.currentStage === 'photo' || registration.status === 'in_progress') {
    return registration.photoPath ? 'review' : 'form';
  }
  if (registration.status === 'rejected') {
    return 'form';
  }
  const s = registration.currentStage || 'form';
  return s === 'photo' ? 'form' : s;
}

function photoUrlFromPath(photoPath) {
  if (!photoPath) return null;
  if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
    return photoPath;
  }
  const name = photoPath.replace(/\\/g, '/').split('/').pop();
  return `/uploads/registrations/${name}`;
}

function normalizeDuplicates(result) {
  if (!result) return null;
  const faceMatches = result.faceMatches?.length
    ? result.faceMatches
    : result.faceMatch
      ? [result.faceMatch]
      : [];
  const formMatches = result.formMatches || [];
  return { faceMatches, formMatches, hasDuplicate: faceMatches.length > 0 || formMatches.length > 0 };
}

function DuplicateMatchList({ faceMatches = [], formMatches = [] }) {
  return (
    <>
      {faceMatches.map((m) => (
        <div key={`face-${m.registrationId}`} className="reg-duplicate-match">
          <span className="reg-duplicate-match__badge reg-duplicate-match__badge--face">Face Match</span>
          {m.photoUrl && (
            <img src={m.photoUrl} alt="" className="reg-duplicate-match__photo" />
          )}
          <div className="reg-duplicate-match__info">
            <p className="reg-duplicate-match__name">{m.displayName || '—'}</p>
            <p className="reg-duplicate-match__meta">
              {m.role} · {m.registrationCode || 'No code'}
            </p>
            <p className="reg-duplicate-match__meta">
              Status: {m.status?.replace(/_/g, ' ')}
              {m.matchScore != null && <> · Score: {Math.round(m.matchScore * 100)}%</>}
            </p>
          </div>
        </div>
      ))}
      {formMatches.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <p className="reg-duplicate-warning__desc" style={{ marginBottom: '0.4rem' }}>
            <strong>Name/phone matches:</strong>
          </p>
          {formMatches.map((m) => (
            <div key={`form-${m.registrationId}`} className="reg-duplicate-match">
              <span className="reg-duplicate-match__badge reg-duplicate-match__badge--form">Form Match</span>
              {m.photoUrl && (
                <img src={m.photoUrl} alt="" className="reg-duplicate-match__photo" />
              )}
              <div className="reg-duplicate-match__info">
                <p className="reg-duplicate-match__name">{m.displayName || '—'}</p>
                <p className="reg-duplicate-match__meta">
                  {m.role} · {m.registrationCode || 'No code'}
                </p>
                <p className="reg-duplicate-match__meta">
                  Status: {m.status?.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function RegistrationFlow({
  roleId: initialRoleId,
  roles: availableRoles,
  registrationId,
  onComplete,
  onCancel,
  onRegisterAnother,
  fromGate = false,
  inModal = false,
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(initialRoleId || '');

  // Derive the effective roleId
  const roleId = availableRoles ? selectedRoleId : initialRoleId;
  const activeRoles = availableRoles ? availableRoles.filter((r) => r.isActive) : null;
  const [role, setRole] = useState(null);
  const [form, setForm] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [formData, setFormData] = useState({});
  const [payFrequencySelection, setPayFrequencySelection] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [gender, setGender] = useState('');
  const [pendingMediaFiles, setPendingMediaFiles] = useState({});
  const [photoBlob, setPhotoBlob] = useState(null);
  const [gatePhotoLoaded, setGatePhotoLoaded] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [stage, setStage] = useState('form');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pass, setPass] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [reviewDuplicates, setReviewDuplicates] = useState(null);
  const [checkingReviewDuplicates, setCheckingReviewDuplicates] = useState(false);

  const isEditMode = Boolean(registrationId || registration?._id);

  useEffect(() => {
    setInitialLoading(true);
    setError('');
    setSuccess('');
    if (!fromGate) {
      setPhotoBlob(null);
      setGatePhotoLoaded(false);
    }

    if (registrationId) {
      loadExisting(registrationId);
    } else if (selectedRoleId) {
      setRegistration(null);
      setFormData({});
      setPayFrequencySelection('');
      setPayAmount('');
      setGender('');
      setPendingMediaFiles({});
      setStage('form');
      loadNew(selectedRoleId);
    } else {
      setRole(null);
      setForm(null);
      setRegistration(null);
      setInitialLoading(false);
    }
  }, [selectedRoleId, registrationId]);

  useEffect(() => {
    if (!fromGate || registrationId || (stage !== 'form' && stage !== 'photo') || photoBlob) return;
    let cancelled = false;
    loadGatePhotoForRegistration()
      .then((blob) => {
        if (!cancelled && blob) {
          setPhotoBlob(blob);
          setGatePhotoLoaded(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fromGate, registrationId, stage, photoBlob]);

  useEffect(() => {
    if (!photoBlob) {
      setPhotoPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(photoBlob);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoBlob]);

  // Re-check duplicates whenever the review (pending verification) stage is shown,
  // so reviewers always see duplicate face/form entries before approving.
  useEffect(() => {
    const regId = registration?._id;
    if (stage !== 'review' || !regId || registration?.status === 'verified') {
      setReviewDuplicates(null);
      return undefined;
    }
    let cancelled = false;
    setCheckingReviewDuplicates(true);
    api.registrations
      .getDuplicates(regId)
      .then((result) => {
        if (!cancelled) setReviewDuplicates(normalizeDuplicates(result));
      })
      .catch(() => {
        if (!cancelled) setReviewDuplicates(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingReviewDuplicates(false);
      });
    return () => { cancelled = true; };
  }, [stage, registration?._id, registration?.status, registration?.photoPath]);

  async function loadNew(id) {
    try {
      const r = await api.roles.get(id);
      setRole(r);
      const f = await api.forms.getByRole(id);
      setForm(f);
    } catch (e) {
      setError(e.message);
      setRole(null);
      setForm(null);
    } finally {
      setInitialLoading(false);
    }
  }

  async function loadExisting(id) {
    try {
      const reg = await api.registrations.get(id);
      setRegistration(reg);
      setFormData(reg.formData || {});
      setPayFrequencySelection(
        serializePayFrequencySelection(reg.payFrequency, reg.customPayDays)
      );
      setPayAmount(reg.payAmount != null ? String(reg.payAmount) : '');
      setGender(reg.gender || '');
      setPendingMediaFiles({});
      setStage(resolveStage(reg));

      const roleRef = reg.roleId?._id || reg.roleId;
      const r = reg.roleId?.name ? reg.roleId : await api.roles.get(roleRef);
      setRole(r);
      const f = await api.forms.getByRole(roleRef);
      setForm(f);
    } catch (e) {
      setError(e.message);
    } finally {
      setInitialLoading(false);
    }
  }

  function handleMediaChange(fieldId, file) {
    if (file) {
      setPendingMediaFiles((prev) => ({ ...prev, [fieldId]: file }));
      return;
    }
    setPendingMediaFiles((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
    setFormData((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  async function uploadPendingMedia(reg) {
    let updated = reg;
    const mediaFields = (form?.fields || []).filter((f) => f.type === 'media');
    for (const field of mediaFields) {
      const file = pendingMediaFiles[field.fieldId];
      if (!file) continue;
      const result = await api.registrations.uploadMedia(updated._id, field.fieldId, file);
      updated = result.registration || updated;
    }
    if (mediaFields.some((f) => pendingMediaFiles[f.fieldId])) {
      setPendingMediaFiles({});
      setFormData(updated.formData || {});
      setRegistration(updated);
    }
    return updated;
  }

  async function submitForm(e) {
    e.preventDefault();
    if (!photoBlob && !registration?.photoPath) {
      setError('Please capture a photo before continuing');
      return;
    }
    const mediaError = validateMediaFields(form?.fields || [], formData, pendingMediaFiles);
    if (mediaError) {
      setError(mediaError);
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    setDuplicateWarning(null);
    try {
      const inferred = inferPayFieldsFromLabourType(labourTypeFromForm(form, formData));
      const parsed = parsePayFrequencySelection(payFrequencySelection);
      const allowed = role?.payFrequencies || [];
      const inferredPay =
        inferred.payFrequency && allowed.includes(inferred.payFrequency)
          ? inferred.payFrequency
          : '';
      const payFrequency = parsed.payFrequency || inferredPay;
      const customPayDays = parsed.customPayDays;
      const resolvedGender = gender || inferred.gender;
      const registrationPayload = {
        formData,
        payFrequency: role?.payFrequencies?.length ? payFrequency || undefined : undefined,
        customPayDays:
          role?.payFrequencies?.length && payFrequency === 'custom_days'
            ? customPayDays
            : undefined,
        payAmount: role?.payFrequencies?.length && payAmount !== '' ? Number(payAmount) : undefined,
        gender: role?.payFrequencies?.length ? resolvedGender || undefined : undefined,
      };
      let reg = registration;
      if (reg) {
        reg = await api.registrations.updateForm(reg._id, registrationPayload);
        setRegistration(reg);
        reg = await uploadPendingMedia(reg);
        if (stage === 'edit') {
          setSuccess('Registration details updated successfully');
          onComplete?.(reg);
          setLoading(false);
          return;
        }
      } else {
        reg = await api.registrations.create({
          roleId,
          ...registrationPayload,
        });
        setRegistration(reg);
        reg = await uploadPendingMedia(reg);
      }

      if (photoBlob) {
        const result = await api.registrations.uploadPhoto(reg._id, photoBlob);
        reg = result.registration;
        setRegistration(reg);
        setPhotoBlob(null);
        clearGatePhotoForRegistration();
        setGatePhotoLoaded(false);
        if (reg.status === 'verified') {
          setStage('edit');
          setSuccess('Photo updated successfully');
          onComplete?.(reg);
          setLoading(false);
          return;
        }
      }

      if (!registrationId) {
        try {
          const dupResult = await api.registrations.checkDuplicate({
            photoBlob: photoBlob || null,
            formData,
            roleId,
            excludeId: reg._id,
          });
          if (dupResult.hasDuplicate) {
            setDuplicateWarning(normalizeDuplicates(dupResult));
            setLoading(false);
            return;
          }
        } catch {
          // non-fatal
        }
      }

      setStage('review');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(approved) {
    if (approved && reviewDuplicates?.hasDuplicate) {
      const count = reviewDuplicates.faceMatches.length + reviewDuplicates.formMatches.length;
      const confirmed = confirm(
        `Possible duplicate detected (${count} matching ${count === 1 ? 'entry' : 'entries'} found). Approve this registration anyway?`
      );
      if (!confirmed) return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.registrations.verify(registration._id, {
        approved,
        rejectionReason: approved ? undefined : 'Rejected by reviewer',
      });
      const reg = result.registration || result;
      setRegistration(reg);
      if (approved) {
        setPass(result.pass || null);
        setStage('completed');
        onComplete?.(reg);
      } else {
        setPass(null);
        setStage('form');
        setError('Registration rejected. Update details and resubmit.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!roleId && !registrationId) {
    // When availableRoles is passed, we show an inline role selector — don't bail out
    if (!availableRoles) {
      return (
        <p style={{ color: 'var(--text-muted)' }}>Select a role above to start registration.</p>
      );
    }
  }

  if (initialLoading && (selectedRoleId || registrationId || !availableRoles)) {
    return <p style={{ color: 'var(--text-muted)' }}>Loading registration...</p>;
  }

  if (error && !role && !registration) {
    return (
      <div>
        <p className="error-msg">{error}</p>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} style={{ marginTop: '0.75rem' }}>
            Close
          </button>
        )}
      </div>
    );
  }

  if (!form) {
    // In role-selector mode (availableRoles passed), no role chosen yet — fall through to render
    if (availableRoles && !selectedRoleId) {
      // handled in the JSX below
    } else {
      return (
        <div>
          <p className="error-msg">No registration form configured for {role?.name}.</p>
          <Link href={`/roles/${role?._id || roleId}/form`}>
            <button type="button" className="btn-primary" style={{ marginTop: '0.75rem' }}>
              Create Form
            </button>
          </Link>
        </div>
      );
    }
  }

  const currentStageIndex = stage === 'edit' ? STAGES.length : STAGES.findIndex((s) => s.key === stage);
  const existingPhotoUrl = registration?.photoUrl || photoUrlFromPath(registration?.photoPath);

  const showFlowHeader = !availableRoles && !inModal;
  const useFlowLayout = stage === 'form' || stage === 'edit';

  return (
    <div className={inModal ? 'reg-flow-in-modal' : undefined}>
      {showFlowHeader && (
        <>
          <div style={{ marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '8px', 
                background: '#f8fafc', border: '1px solid #e2e8f0', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', color: '#1e293b' }}>
                  {isEditMode ? 'Update' : 'New Labour Registration'}
                </h3>
                <p style={{ margin: 0, marginTop: '2px', color: '#64748b', fontSize: '0.875rem' }}>
                  {isEditMode
                    ? `Editing registration ${registration?.registrationCode || `#${registration?._id?.slice(-6)}`}`
                    : 'Capture identity details and assign workforce access'}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {(stage === 'form' || stage === 'edit') && (
        <form onSubmit={submitForm} className="reg-flow-form">
          <div className={useFlowLayout ? 'reg-flow-layout' : undefined}>
            {(stage === 'form' || stage === 'edit') && (
              <div className="reg-flow-layout__camera">
                {stage === 'form' ? (
                  <>
                    <h4 className="reg-flow-section-title">Identity Capture</h4>
                    {fromGate && gatePhotoLoaded && photoBlob && (
                      <div className="gate-result gate-result--not-found" style={{ marginBottom: '1rem' }}>
                        <p className="gate-not-found__title">Gate photo loaded</p>
                        <p className="gate-not-found__text">
                          We saved the photo from the gate scan. You can use it below or retake a new one.
                        </p>
                      </div>
                    )}
                    <p className="reg-flow-hint">
                      Face will be processed by the AI server for gate access.
                    </p>
                    {photoPreviewUrl ? (
                      <div className="reg-flow-layout__photo-preview">
                        <img src={photoPreviewUrl} alt="Captured" />
                        <div className="camera-actions">
                          <button type="button" className="btn-secondary" onClick={() => setPhotoBlob(null)}>
                            Retake Photo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <CameraCapture onCapture={setPhotoBlob} label="Capture Photo" />
                    )}
                    {existingPhotoUrl && isEditMode && !photoPreviewUrl && (
                      <div className="reg-flow-current-photo">
                        <label>Current Photo</label>
                        <img src={existingPhotoUrl} alt="Current" className="reg-flow-edit-photo" />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <h4 className="reg-flow-section-title">Current Photo</h4>
                    {existingPhotoUrl ? (
                      <img src={existingPhotoUrl} alt="Registered" className="reg-flow-edit-photo" />
                    ) : (
                      <div className="reg-flow-edit-photo reg-flow-edit-photo--empty">No photo on file</div>
                    )}
                    <button
                      type="button"
                      className="btn-secondary reg-flow-update-photo-btn"
                      onClick={() => setStage('form')}
                    >
                      Update Photo
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="reg-flow-layout__fields">
              <div className="reg-flow-group">
                {form && (
                  <DynamicFormFields
                    fields={form.fields.filter(f => ['name', 'fullname', 'aadhaar', 'aadhaarnumber', 'phone', 'mobile'].includes(f.fieldId.toLowerCase()))}
                    values={formData}
                    onChange={setFormData}
                    pendingMediaFiles={pendingMediaFiles}
                    onMediaChange={handleMediaChange}
                  />
                )}
              </div>

              <div className="reg-flow-group">

                <div className="reg-flow-grid">
                  {/* Role selector — only when availableRoles is provided (modal mode) */}
                  {stage === 'form' && availableRoles && (
                    <div className="form-group">
                      <label htmlFor="reg-flow-role-select">Role</label>
                      <select
                        id="reg-flow-role-select"
                        value={selectedRoleId}
                        onChange={(e) => {
                          setSelectedRoleId(e.target.value);
                          setFormData({});
                          setPayFrequencySelection('');
                          setPayAmount('');
                          setGender('');
                          setPendingMediaFiles({});
                          setError('');
                        }}
                      >
                        <option value="">Choose a role…</option>
                        {activeRoles.map((r) => (
                          <option key={r._id} value={r._id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Shift picker removed as part of Rate Master integration */}
                </div>

                {form && (
                  <DynamicFormFields
                    fields={form.fields.filter(f => !['name', 'fullname', 'aadhaar', 'aadhaarnumber', 'phone', 'mobile'].includes(f.fieldId.toLowerCase()))}
                    values={formData}
                    onChange={setFormData}
                    pendingMediaFiles={pendingMediaFiles}
                    onMediaChange={handleMediaChange}
                  />
                )}
              </div>

              {duplicateWarning && (
                <div className="reg-duplicate-warning">
                  <div className="reg-duplicate-warning__header">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <strong>Possible duplicate detected</strong>
                  </div>
                  <p className="reg-duplicate-warning__desc">
                    An existing registration may match this person. Please review before proceeding.
                  </p>
                  <DuplicateMatchList
                    faceMatches={duplicateWarning.faceMatches}
                    formMatches={duplicateWarning.formMatches}
                  />
                  <div className="reg-duplicate-warning__actions">
                    <button type="button" className="btn-secondary" onClick={() => setDuplicateWarning(null)}>
                      Edit Details / Photo
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => { setDuplicateWarning(null); setStage('review'); }}
                    >
                      Proceed Anyway
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="error-msg">{error}</p>}
              {success && <p className="success-msg">{success}</p>}
              {!duplicateWarning && (
                <div className="reg-flow-footer">
                  {onCancel && (
                    <button type="button" className="btn-enterprise-secondary" onClick={onCancel}>
                      Close
                    </button>
                  )}
                  <button type="submit" className="btn-enterprise-primary" disabled={loading}>
                    {loading ? 'Processing...' : stage === 'edit' ? 'Save Details' : 'Continue to Review'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </form>
      )}

      {stage === 'review' && registration && (
        <div>
          {/* Pay frequency is now hidden from the UI */}
          {registration.payAmount != null && (
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Pay Amount (per day)</label>
              <p style={{ margin: 0 }}>{registration.payAmount}</p>
            </div>
          )}
          <DynamicFormFields fields={form.fields} values={registration.formData} onChange={() => {}} readOnly />
          {registration.photoPath && (
            <div style={{ marginTop: '1rem' }}>
              <label>Captured Photo</label>
              {existingPhotoUrl && (
                <img
                  src={existingPhotoUrl}
                  alt="Captured"
                  style={{ maxWidth: 200, borderRadius: 'var(--radius)', marginTop: '0.5rem', border: '1px solid var(--border)' }}
                />
              )}
              <p style={{ color: 'var(--success)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Photo uploaded and face embedding saved
              </p>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => setStage('form')}>
              Edit Details / Photo
            </button>
          </div>
          {checkingReviewDuplicates && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '1rem' }}>
              Checking for duplicate entries…
            </p>
          )}
          {reviewDuplicates?.hasDuplicate && (
            <div className="reg-duplicate-warning" style={{ marginTop: '1rem' }}>
              <div className="reg-duplicate-warning__header">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <strong>Possible duplicate detected</strong>
              </div>
              <p className="reg-duplicate-warning__desc">
                An existing registration may match this person. Please review carefully before approving.
              </p>
              <DuplicateMatchList
                faceMatches={reviewDuplicates.faceMatches}
                formMatches={reviewDuplicates.formMatches}
              />
            </div>
          )}
          {error && <p className="error-msg">{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
            <button type="button" className="btn-enterprise-secondary" onClick={() => handleVerify(false)} disabled={loading}>
              Reject
            </button>
            <button type="button" className="btn-enterprise-primary" style={{ background: '#10b981', color: '#fff' }} onClick={() => handleVerify(true)} disabled={loading}>
              Approve & Complete
            </button>
          </div>
        </div>
      )}

      {stage === 'completed' && registration && (
        <div>
          <h3 style={{ color: 'var(--success)', marginBottom: '1rem' }}>Registration Complete</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Registration pass has been generated. Print or save it for the employee.
          </p>
          {pass ? (
            <PassCard pass={pass} />
          ) : (
            <p className="error-msg" style={{ marginBottom: '1rem' }}>
              Pass not available yet.{' '}
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: '0.5rem' }}
                onClick={async () => {
                  try {
                    const p = await api.passes.generateRegistrationPass(registration._id);
                    setPass(p);
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                Generate Pass
              </button>
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }} className="no-print">
            <Link href="/gate">
              <button type="button" className="btn-primary">Go to Gate</button>
            </Link>
            {onRegisterAnother && (
              <button type="button" className="btn-secondary" onClick={onRegisterAnother}>
                Register Another
              </button>
            )}
            {onCancel && (
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

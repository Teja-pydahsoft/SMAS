'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { clearGatePhotoForRegistration, loadGatePhotoForRegistration } from '@/lib/gateRegistration';
import DynamicFormFields from '@/components/DynamicFormFields';
import CameraCapture from '@/components/CameraCapture';
import PassCard from '@/components/PassCard';

const STAGES = [
  { key: 'form', label: '1. Form Data' },
  { key: 'photo', label: '2. Photo' },
  { key: 'review', label: '3. Review' },
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
    return registration.photoPath ? 'review' : 'photo';
  }
  if (registration.status === 'rejected') {
    return 'form';
  }
  return registration.currentStage || 'form';
}

function photoUrlFromPath(photoPath) {
  if (!photoPath) return null;
  const name = photoPath.replace(/\\/g, '/').split('/').pop();
  return `/uploads/registrations/${name}`;
}

export default function RegistrationFlow({
  roleId,
  registrationId,
  onComplete,
  onCancel,
  onRegisterAnother,
  fromGate = false,
}) {
  const [role, setRole] = useState(null);
  const [form, setForm] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [formData, setFormData] = useState({});
  const [photoBlob, setPhotoBlob] = useState(null);
  const [gatePhotoLoaded, setGatePhotoLoaded] = useState(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [stage, setStage] = useState('form');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pass, setPass] = useState(null);

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
    } else if (roleId) {
      setRegistration(null);
      setFormData({});
      setStage('form');
      loadNew(roleId);
    } else {
      setRole(null);
      setForm(null);
      setRegistration(null);
      setInitialLoading(false);
    }
  }, [roleId, registrationId]);

  useEffect(() => {
    if (!fromGate || registrationId || stage !== 'photo' || photoBlob) return;
    let cancelled = false;

    loadGatePhotoForRegistration()
      .then((blob) => {
        if (!cancelled && blob) {
          setPhotoBlob(blob);
          setGatePhotoLoaded(true);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
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
      setStage(resolveStage(reg));

      const roleRef = reg.roleId?._id || reg.roleId;
      const r = reg.roleId?.name ? reg.roleId : await api.roles.get(roleRef);
      setRole(r);
      const f = await api.forms.getByRole(roleRef);
      setForm(f);

      if (reg.status === 'verified') {
        try {
          const existingPass = await api.passes.getRegistrationPass(id);
          setPass(existingPass);
        } catch {
          setPass(null);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setInitialLoading(false);
    }
  }

  async function submitForm(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      if (registration) {
        const updated = await api.registrations.updateForm(registration._id, formData);
        setRegistration(updated);
        if (stage === 'edit') {
          setSuccess('Registration details updated successfully');
          onComplete?.(updated);
        } else {
          setStage('photo');
        }
      } else {
        const reg = await api.registrations.create({ roleId, formData });
        setRegistration(reg);
        setStage('photo');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitPhoto() {
    if (!photoBlob || !registration) {
      setError('Please capture a photo first');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.registrations.uploadPhoto(registration._id, photoBlob);
      setRegistration(result.registration);
      setPhotoBlob(null);
      clearGatePhotoForRegistration();
      setGatePhotoLoaded(false);
      if (result.registration.status === 'verified') {
        setStage('edit');
        setSuccess('Photo updated successfully');
        onComplete?.(result.registration);
      } else {
        setStage('review');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(approved) {
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
    return (
      <p style={{ color: 'var(--text-muted)' }}>Select a role above to start registration.</p>
    );
  }

  if (initialLoading) {
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

  const currentStageIndex = stage === 'edit' ? STAGES.length : STAGES.findIndex((s) => s.key === stage);
  const existingPhotoUrl = photoUrlFromPath(registration?.photoPath);

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '0.25rem' }}>
          {isEditMode ? 'Update' : 'Register'} — {role?.name} — {form.title}
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          {isEditMode
            ? `Editing registration ${registration?.registrationCode || `#${registration?._id?.slice(-6)}`}`
            : form.description || 'Complete all steps to register'}
        </p>
      </div>

      {stage !== 'edit' && (
        <div className="stage-indicator">
          {STAGES.map((s, i) => (
            <div
              key={s.key}
              className={`stage ${i === currentStageIndex ? 'active' : ''} ${i < currentStageIndex || stage === 'completed' ? 'done' : ''}`}
            >
              {s.label}
            </div>
          ))}
        </div>
      )}

      {(stage === 'form' || stage === 'edit') && (
        <form onSubmit={submitForm}>
          <DynamicFormFields fields={form.fields} values={formData} onChange={setFormData} />
          {error && <p className="error-msg">{error}</p>}
          {success && <p className="success-msg">{success}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading
                ? 'Saving...'
                : stage === 'edit'
                  ? 'Save Details'
                  : 'Continue to Photo'}
            </button>
            {stage === 'edit' && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStage('photo')}
              >
                Update Photo
              </button>
            )}
            {onCancel && (
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Close
              </button>
            )}
          </div>
        </form>
      )}

      {stage === 'edit' && (
        <>
          {existingPhotoUrl && (
            <div style={{ marginTop: '1.5rem' }}>
              <label>Current Photo</label>
              <img
                src={existingPhotoUrl}
                alt="Registered"
                style={{ maxWidth: 240, borderRadius: 'var(--radius)', marginTop: '0.5rem', border: '1px solid var(--border)' }}
              />
            </div>
          )}

          {registration?.status === 'verified' && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>Registration Pass</h4>
              {pass ? (
                <PassCard pass={pass} />
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={async () => {
                    try {
                      const p = await api.passes.getRegistrationPass(registration._id);
                      setPass(p);
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Load Registration Pass
                </button>
              )}
            </div>
          )}
        </>
      )}

      {stage === 'photo' && (
        <div>
          {fromGate && gatePhotoLoaded && photoBlob && (
            <div className="gate-result gate-result--not-found" style={{ marginBottom: '1rem' }}>
              <p className="gate-not-found__title">Gate photo loaded</p>
              <p className="gate-not-found__text">
                We saved the photo from the gate scan. You can use it below or retake a new one.
              </p>
            </div>
          )}
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Face will be processed by the AI server to generate embeddings for gate access.
          </p>
          {photoPreviewUrl && (
            <div style={{ marginBottom: '1rem' }}>
              <label>{gatePhotoLoaded ? 'Photo ready for registration' : 'Captured photo'}</label>
              <img
                src={photoPreviewUrl}
                alt="Captured"
                style={{ maxWidth: 220, borderRadius: 'var(--radius)', marginTop: '0.5rem', border: '1px solid var(--border)' }}
              />
            </div>
          )}
          {existingPhotoUrl && isEditMode && (
            <div style={{ marginBottom: '1rem' }}>
              <label>Current Photo</label>
              <img
                src={existingPhotoUrl}
                alt="Current"
                style={{ maxWidth: 200, borderRadius: 'var(--radius)', marginTop: '0.5rem', border: '1px solid var(--border)' }}
              />
            </div>
          )}
          <CameraCapture onCapture={setPhotoBlob} label={isEditMode ? 'Capture New Photo' : 'Capture Photo'} />
          {error && <p className="error-msg">{error}</p>}
          {success && <p className="success-msg">{success}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={submitPhoto}
              disabled={loading || !photoBlob}
            >
              {loading ? 'Processing...' : isEditMode && registration?.status === 'verified' ? 'Save Photo' : 'Continue to Review'}
            </button>
            {isEditMode && (
              <button type="button" className="btn-secondary" onClick={() => setStage('edit')}>
                Back to Details
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

      {stage === 'review' && registration && (
        <div>
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
              Edit Details
            </button>
            <button type="button" className="btn-secondary" onClick={() => setStage('photo')}>
              Retake Photo
            </button>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn-success" onClick={() => handleVerify(true)} disabled={loading}>
              Approve & Complete
            </button>
            <button type="button" className="btn-danger" onClick={() => handleVerify(false)} disabled={loading}>
              Reject
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

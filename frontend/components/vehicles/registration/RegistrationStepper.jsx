import React from 'react';

export default function RegistrationStepper({ currentStep = 1 }) {
  const steps = [
    { num: 1, label: 'Vehicle Information' },
    { num: 2, label: 'Images' },
    { num: 3, label: 'Review & Submit' }
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', gap: '1rem' }}>
      {steps.map((step, index) => {
        const isActive = step.num === currentStep;
        const isPast = step.num < currentStep;
        
        return (
          <React.Fragment key={step.num}>
            <div style={{ display: 'flex', alignItems: 'center', opacity: (isActive || isPast) ? 1 : 0.5 }}>
              <div 
                style={{ 
                  width: '28px', height: '28px', borderRadius: '50%', 
                  backgroundColor: isActive ? 'var(--primary-color)' : (isPast ? 'var(--success-color)' : 'var(--border-color)'),
                  color: isActive || isPast ? '#fff' : 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 'bold', fontSize: '12px', marginRight: '8px'
                }}
              >
                {isPast ? '✓' : step.num}
              </div>
              <div style={{ 
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}>
                {step.label}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div style={{ width: '40px', height: '2px', backgroundColor: isPast ? 'var(--success-color)' : 'var(--border-color)', opacity: isPast ? 1 : 0.5 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

import React from 'react';
import AnimatedCounter from '@/components/admin/AnimatedCounter';

export default function VehicleSummaryCard({ title, count, subtitle, icon, iconType = 'primary' }) {
  const iconClass = `admin-metric-card__icon--${iconType}`;

  return (
    <div 
      className={`admin-metric-card admin-hover-lift vehicle-summary-card vehicle-summary-card--${iconType}`} 
      style={{ 
        display: 'flex', 
        flexDirection: 'row', 
        alignItems: 'center', 
        textAlign: 'left',
        gap: '8px', 
        padding: '0.45rem 0.75rem', 
        borderRadius: '10px' 
      }}
    >
      {icon && (
        <div className={`admin-metric-card__icon ${iconClass}`} style={{ margin: 0, width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {React.cloneElement(icon, { style: { width: '15px', height: '15px' } })}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'flex-start', textAlign: 'left', minWidth: 0, flex: 1 }}>
        <div className="admin-metric-card__label" style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>{title}</div>
        <div className="admin-metric-card__value" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, textAlign: 'left' }}>
          {count === '-' ? (
             <span className="admin-skeleton__line admin-skeleton__line--lg" style={{ display: 'inline-block', width: 30, height: 14 }} />
          ) : (
            <AnimatedCounter value={count} />
          )}
        </div>
        {subtitle && (
          <div className="vehicle-summary-card__subtitle" style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px', textAlign: 'left' }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

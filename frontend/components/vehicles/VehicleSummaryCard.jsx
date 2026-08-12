import React from 'react';
import AnimatedCounter from '@/components/admin/AnimatedCounter';

export default function VehicleSummaryCard({ title, count, subtitle, icon, iconType = 'primary' }) {
  const iconClass = `admin-metric-card__icon--${iconType}`;

  return (
    <div className="admin-metric-card admin-hover-lift" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0.75rem 1rem' }}>
      {icon && (
        <div className={`admin-metric-card__icon ${iconClass}`} style={{ margin: 0, flexShrink: 0 }}>
          {icon}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
        <div className="admin-metric-card__label" style={{ margin: 0, lineHeight: 1 }}>{title}</div>
        <div className="admin-metric-card__value" style={{ margin: 0, lineHeight: 1 }}>
          {count === '-' ? (
             <span className="admin-skeleton__line admin-skeleton__line--lg" style={{ display: 'inline-block', width: 40, height: 16 }} />
          ) : (
            <AnimatedCounter value={count} />
          )}
        </div>
      </div>
      {subtitle && (
        <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

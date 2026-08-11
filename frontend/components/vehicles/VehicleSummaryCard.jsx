import React from 'react';
import AnimatedCounter from '@/components/admin/AnimatedCounter';

export default function VehicleSummaryCard({ title, count, subtitle, icon, iconType = 'primary' }) {
  const iconClass = `admin-metric-card__icon--${iconType}`;

  return (
    <div className="admin-metric-card admin-hover-lift">
      <div className="admin-metric-card__head">
        {icon && (
          <span className={`admin-metric-card__icon ${iconClass}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="admin-metric-card__label">{title}</div>
      <div className="admin-metric-card__value">
        {count === '-' ? (
           <span className="admin-skeleton__line admin-skeleton__line--lg" style={{ display: 'inline-block', width: 60 }} />
        ) : (
          <AnimatedCounter value={count} />
        )}
      </div>
      {subtitle && (
        <div style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

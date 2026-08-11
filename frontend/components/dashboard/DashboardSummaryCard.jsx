import React from 'react';

export default function DashboardSummaryCard({ label, value, icon, iconType, trend, trendDir }) {
  const iconClass = iconType ? `admin-metric-card__icon--${iconType}` : 'admin-metric-card__icon--primary';
  const trendClass = trendDir === 'up' ? 'is-up' : (trendDir === 'down' ? 'is-down' : '');

  return (
    <div className="admin-metric-card">
      <div className="admin-metric-card__head">
        <div className="admin-metric-card__label" style={{ marginBottom: 0 }}>{label}</div>
        {icon && (
          <div className={`admin-metric-card__icon ${iconClass}`}>
            {icon}
          </div>
        )}
      </div>
      <div className="admin-metric-card__value">{value}</div>
      {trend && (
        <div>
          <span className={`admin-metric-card__trend ${trendClass}`}>{trend}</span>
        </div>
      )}
    </div>
  );
}

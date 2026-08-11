import React from 'react';

export default function StatusChip({ status, type }) {
  let badgeClass = 'badge-info';
  
  // Auto-determine type from status if not explicitly provided
  const normalizedStatus = (status || '').toLowerCase();
  
  if (type) {
    badgeClass = `badge-${type}`;
  } else if (['working', 'active', 'entry'].includes(normalizedStatus)) {
    badgeClass = 'badge-success';
  } else if (['idle', 'warning', 'idle started'].includes(normalizedStatus)) {
    badgeClass = 'badge-warning';
  } else if (['alert', 'critical', 'idle alert', 'idle alert generated'].includes(normalizedStatus)) {
    badgeClass = 'badge-danger';
  } else if (['cleared', 'exit', 'idle cleared'].includes(normalizedStatus)) {
    badgeClass = 'badge-info';
  }

  return (
    <span className={`badge ${badgeClass}`}>
      {status}
    </span>
  );
}

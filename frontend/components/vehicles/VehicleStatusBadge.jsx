import React from 'react';

export default function VehicleStatusBadge({ status }) {
  let badgeClass = 'admin-badge--info';
  
  const normalizedStatus = (status || '').toLowerCase();
  
  if (['working', 'active'].includes(normalizedStatus)) {
    badgeClass = 'admin-badge--success';
  } else if (['idle'].includes(normalizedStatus)) {
    badgeClass = 'admin-badge--warning';
  } else if (['maintenance', 'alert'].includes(normalizedStatus)) {
    badgeClass = 'admin-badge--danger';
  } else if (['pending', 'pending approval'].includes(normalizedStatus)) {
    badgeClass = 'admin-badge--warning'; // or admin-badge--info
  } else if (['inactive'].includes(normalizedStatus)) {
    badgeClass = 'admin-badge--secondary';
  }

  return (
    <span className={`admin-badge ${badgeClass}`}>
      {status || 'Unknown'}
    </span>
  );
}

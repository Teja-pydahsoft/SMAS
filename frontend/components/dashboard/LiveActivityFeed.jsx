import React from 'react';

export default function LiveActivityFeed({ events }) {
  if (!events || events.length === 0) {
    return (
      <div className="admin-empty-note">
        No recent events
      </div>
    );
  }

  return (
    <ul className="admin-live-list" style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '10px' }}>
      {events.map(event => {
        let alertClass = '';
        switch (event.metadata?.action) {
          case 'department_entry': alertClass = 'admin-live-list__item--success'; break;
          case 'idle_started': alertClass = 'admin-live-list__item--warning'; break;
          case 'idle_alert_generated': alertClass = 'admin-live-list__item--alert'; break;
          case 'idle_cleared': alertClass = 'admin-live-list__item--success'; break;
        }

        return (
          <li key={event._id} className={`admin-live-list__item ${alertClass}`}>
            <div>
              <strong>{event.reason}</strong>
              <span>
                {event.vehicleId?.plateNumber || 'Unknown'} 
                {event.departmentId && ` • ${event.departmentId.name || 'Unknown Dept'}`}
              </span>
            </div>
            <time style={{ textAlign: 'right', flexShrink: 0, marginTop: '2px' }}>
              {new Date(event.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </time>
          </li>
        );
      })}
    </ul>
  );
}

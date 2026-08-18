'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const AuditTimelineMap = dynamic(() => import('./AuditTimelineMap'), { ssr: false });

function getInitials(name) {
  if (!name) return '?';
  return name.substring(0, 2).toUpperCase();
}

export default function UserActivityView({ groupedUsers, locations }) {
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);

  const selectedUser = groupedUsers.find(u => u.userId === selectedUserId) || groupedUsers[0];

  return (
    <div className="user-activity-layout">
      {/* LEFT PANEL: USER LIST */}
      <div className="user-list-panel">
        <div className="panel-header">
          <h3>Active Users</h3>
          <span className="user-count">{groupedUsers.length} Users Found</span>
        </div>
        
        <div className="user-scroll-area">
          {groupedUsers.map(user => {
            const isSelected = selectedUser?.userId === user.userId;
            const total = user.logs.length;
            
            return (
              <div 
                key={user.userId} 
                className={`user-card ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedUserId(user.userId);
                  setSelectedLog(user.logs[0]); // Auto-select their current/most recent location
                }}
              >
                <div className="user-card-header">
                  <div className="user-avatar">{getInitials(user.displayName || user.username)}</div>
                  <div className="user-info">
                    <div className="user-name">{user.displayName || user.username}</div>
                    <div className="user-role">{user.role || 'User'}</div>
                  </div>
                </div>
                <div className="user-stats">
                  <span className="stat-pill neutral">{total} Events</span>
                  {user.stats.allowed > 0 && <span className="stat-pill success">{user.stats.allowed} Login</span>}
                  {user.stats.verified > 0 && <span className="stat-pill success">{user.stats.verified} Verified</span>}
                  {user.stats.denied > 0 && <span className="stat-pill danger">{user.stats.denied} Denied</span>}
                </div>
              </div>
            );
          })}
          {groupedUsers.length === 0 && (
             <div className="empty-users">No user activity found.</div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: MAP & TIMELINE */}
      <div className="user-detail-panel">
        {selectedUser ? (
          <AuditTimelineMap 
            logs={selectedUser.logs} 
            selectedLog={selectedLog} 
            onSelectLog={setSelectedLog} 
            locations={locations}
          />
        ) : (
          <div className="empty-state">
             <div className="empty-state-content">Select a user to view their geographic activity</div>
          </div>
        )}
      </div>

      <style jsx>{`
        .user-activity-layout {
          display: flex;
          width: 100%;
          height: 100%;
          background: #f8fafc;
        }

        /* LEFT PANEL */
        .user-list-panel {
          width: 320px;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-right: 1px solid #e2e8f0;
          flex-shrink: 0;
        }
        .panel-header {
          padding: 16px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .panel-header h3 {
          margin: 0 0 4px 0;
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .user-count {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
        }
        
        .user-scroll-area {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .user-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .user-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .user-card.selected {
          border-color: #3b82f6;
          background: #eff6ff;
          box-shadow: 0 0 0 1px #3b82f6;
        }

        .user-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: #e2e8f0;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 12px;
          flex-shrink: 0;
        }
        .user-card.selected .user-avatar {
          background: #3b82f6;
          color: #ffffff;
        }
        .user-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .user-name {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .user-role {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
        }

        .user-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .stat-pill {
          display: inline-flex;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
        }
        .stat-pill.neutral { background: #f1f5f9; color: #475569; }
        .stat-pill.success { background: #dcfce7; color: #166534; }
        .stat-pill.danger { background: #fee2e2; color: #991b1b; }

        .empty-users {
          padding: 24px;
          text-align: center;
          color: #64748b;
          font-size: 12px;
        }

        /* RIGHT PANEL */
        .user-detail-panel {
          flex: 1;
          min-width: 0;
          height: 100%;
          background: #ffffff;
        }
        
        .empty-state {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
        }
        .empty-state-content {
          padding: 24px;
          background: #ffffff;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          color: #64748b;
          font-size: 13px;
          font-weight: 600;
        }
        
        /* OVERRIDE MAP CONTAINER BORDERS */
        :global(.timeline-map-container) {
          border: none !important;
          border-radius: 0 !important;
        }
      `}</style>
    </div>
  );
}

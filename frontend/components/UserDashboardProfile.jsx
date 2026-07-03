'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { PERMISSION_MODULES } from '@/lib/auth/permissions';
import { getAccessibleModules } from '@/lib/auth/routing';
import { formatDate } from '@/lib/formatDate';

export default function UserDashboardProfile() {
  const { user, can } = useAuth();
  if (!user) return null;

  const quickLinks = getAccessibleModules(user);

  const privilegeRows = user.isSuperAdmin
    ? PERMISSION_MODULES.map(({ key, label }) => ({
        key,
        label,
        read: true,
        write: true,
      }))
    : PERMISSION_MODULES.map(({ key, label }) => {
        const perms = user.systemRoleId?.permissions?.[key] || { read: false, write: false };
        return {
          key,
          label,
          read: Boolean(perms.read || perms.write),
          write: Boolean(perms.write),
        };
      }).filter((row) => row.read || row.write);

  return (
    <div className="dashboard-profile-grid">
      <div className="card dashboard-profile-card">
        <h3 className="section-title">Your Profile</h3>
        <dl className="profile-dl">
          <div>
            <dt>Name</dt>
            <dd>{user.displayName}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{user.username}</dd>
          </div>
          {user.email && (
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
          )}
          <div>
            <dt>Role</dt>
            <dd>
              {user.isSuperAdmin ? (
                <span className="badge badge-info">Super Admin — unrestricted</span>
              ) : (
                user.systemRoleId?.name || '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Last login</dt>
            <dd>{user.lastLoginAt ? formatDate(user.lastLoginAt) : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="card dashboard-profile-card">
        <h3 className="section-title">Access Scope</h3>
        {user.isSuperAdmin ? (
          <p className="section-desc">Full access to all divisions and departments.</p>
        ) : (
          <>
            <p className="field-hint">Divisions you can access</p>
            <div className="scope-badges" style={{ marginBottom: '1rem' }}>
              {(user.divisionIds || []).length > 0
                ? user.divisionIds.map((div) => (
                    <span key={div._id || div} className="badge badge-info">
                      {div.name || div}
                    </span>
                  ))
                : <span className="scope-empty">No division scope assigned</span>}
            </div>
            <p className="field-hint">Departments you can access</p>
            <div className="scope-badges">
              {(user.departmentIds || []).length > 0
                ? user.departmentIds.map((dept) => (
                    <span key={dept._id || dept} className="badge badge-warning">
                      {dept.name || dept}
                    </span>
                  ))
                : <span className="scope-empty">No department scope assigned</span>}
            </div>
          </>
        )}
      </div>

      <div className="card dashboard-profile-card dashboard-privileges-card">
        <h3 className="section-title">Your Privileges</h3>
        <p className="section-desc">Modules and access level assigned to your account</p>
        {privilegeRows.length === 0 ? (
          <p className="scope-empty">No module privileges assigned.</p>
        ) : (
          <div className="table-scroll">
            <table className="reg-table privilege-summary-table">
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Read</th>
                  <th>Write</th>
                </tr>
              </thead>
              <tbody>
                {privilegeRows.map((row) => (
                  <tr key={row.key}>
                    <td className="name-cell">{row.label}</td>
                    <td>
                      <span className={`badge ${row.read ? 'badge-success' : 'badge-danger'}`}>
                        {row.read ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${row.write ? 'badge-success' : 'badge-danger'}`}>
                        {row.write ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {quickLinks.length > 0 && (
        <div className="card dashboard-profile-card dashboard-quick-links">
          <h3 className="section-title">Your Modules</h3>
          <p className="section-desc">Shortcuts to areas you can access</p>
          <div className="dashboard-link-grid">
            {quickLinks.map((link) => (
              <Link key={link.module} href={link.path} className="dashboard-module-link">
                <span>{link.label}</span>
                <span className="dashboard-module-access">
                  {can(link.module, 'write') ? 'Read & write' : 'View only'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

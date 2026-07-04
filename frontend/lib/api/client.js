const BASE = '/api';

function getAuthHeaders(extra = {}) {
  if (typeof window === 'undefined') return extra;
  const token = localStorage.getItem('smas_token');
  if (!token) return extra;
  return { ...extra, Authorization: `Bearer ${token}` };
}

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: getAuthHeaders(
      isFormData ? {} : { 'Content-Type': 'application/json', ...(options.headers || {}) }
    ),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
      const isPublicVerify = path.startsWith('/passes/verify/');
      if (!isPublicVerify) {
        localStorage.removeItem('smas_token');
        localStorage.removeItem('smas_user');
        document.cookie = 'smas_token=; path=/; max-age=0';
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        }
      }
    }
    const err = new Error(data.message || data.error || data.detail || `Request failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('/health'),

  auth: {
    precheck: (username) =>
      request('/auth/precheck', { method: 'POST', body: JSON.stringify({ username }) }),
    login: (username, password) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    verifyPassword: (password) =>
      request('/auth/verify-password', { method: 'POST', body: JSON.stringify({ password }) }),
    me: () => request('/auth/me'),
    accessScope: () => request('/auth/access-scope'),
  },

  systemRoles: {
    list: () => request('/system-roles'),
    get: (id) => request(`/system-roles/${id}`),
    create: (data) => request('/system-roles', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/system-roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updatePermissions: (id, permissions) =>
      request(`/system-roles/${id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }),
    delete: (id) => request(`/system-roles/${id}`, { method: 'DELETE' }),
  },

  systemUsers: {
    list: () => request('/system-users'),
    get: (id) => request(`/system-users/${id}`),
    create: (data) => request('/system-users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/system-users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/system-users/${id}`, { method: 'DELETE' }),
  },

  roles: {
    list: () => request('/roles'),
    get: (id) => request(`/roles/${id}`),
    create: (data) => request('/roles', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/roles/${id}`, { method: 'DELETE' }),
  },

  forms: {
    getByRole: (roleId) => request(`/forms/role/${roleId}`),
    get: (id) => request(`/forms/${id}`),
    create: (data) => request('/forms', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/forms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },

  registrations: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/registrations${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/registrations/${id}`),
    create: (data) => request('/registrations', { method: 'POST', body: JSON.stringify(data) }),
    updateForm: (id, formData) =>
      request(`/registrations/${id}/form`, { method: 'PUT', body: JSON.stringify({ formData }) }),
    uploadPhoto: (id, photoBlob) => {
      const form = new FormData();
      form.append('photo', photoBlob, 'photo.jpg');
      return request(`/registrations/${id}/photo`, { method: 'POST', body: form });
    },
    verify: (id, data) =>
      request(`/registrations/${id}/verify`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => request(`/registrations/${id}`, { method: 'DELETE' }),
  },

  passes: {
    getRegistrationPass: (registrationId) => request(`/passes/registration/${registrationId}`),
    generateRegistrationPass: (registrationId) =>
      request(`/passes/registration/${registrationId}`, { method: 'POST' }),
    syncAllRegistrationPasses: () =>
      request('/passes/registration/sync-all', { method: 'POST' }),
    getDayPassByGateLog: (gateLogId) => request(`/passes/day/gate-log/${gateLogId}`),
    verify: (passCode) => request(`/passes/verify/${passCode}`),
    listByRegistration: (registrationId) => request(`/passes/registration/${registrationId}/list`),
  },

  gate: {
    scan: (photoBlob, eventType, options = {}) => {
      const {
        registrationId = null,
        gateId = null,
        departmentId = null,
        divisionId = null,
        scanType = 'gate',
      } = options;
      const form = new FormData();
      form.append('photo', photoBlob, 'gate-photo.jpg');
      form.append('eventType', eventType);
      form.append('scanType', scanType);
      if (registrationId) form.append('registrationId', registrationId);
      if (gateId) form.append('gateId', gateId);
      if (departmentId) form.append('departmentId', departmentId);
      if (divisionId) form.append('divisionId', divisionId);
      return request('/gate/scan', { method: 'POST', body: form });
    },
    logs: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/gate/logs${qs ? `?${qs}` : ''}`);
    },
    status: (registrationId) => request(`/gate/status/${registrationId}`),
    session: (registrationId, divisionId) =>
      request(`/gate/session/${registrationId}?divisionId=${divisionId}`),
  },

  reports: {
    listRegistrations: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/reports/registrations${qs ? `?${qs}` : ''}`);
    },
    getRegistration: (registrationId) => request(`/reports/registrations/${registrationId}`),
  },

  divisions: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/divisions${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/divisions/${id}`),
    create: (data) => request('/divisions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/divisions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/divisions/${id}`, { method: 'DELETE' }),
  },

  gates: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/gates${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/gates/${id}`),
    create: (data) => request('/gates', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/gates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/gates/${id}`, { method: 'DELETE' }),
  },

  departments: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/departments${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/departments/${id}`),
    create: (data) => request('/departments', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/departments/${id}`, { method: 'DELETE' }),
  },
};

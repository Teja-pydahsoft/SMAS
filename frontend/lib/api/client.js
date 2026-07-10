const BASE = '/api';
// Render free tier can take 30–60 s to wake; retry instead of failing on the first hit.
const AUTH_TIMEOUT_MS = 30_000;
const AUTH_MAX_RETRIES = 4;
const AUTH_RETRY_BASE_MS = 2_000;
const TRANSIENT_STATUSES = new Set([404, 408, 429, 502, 503, 504]);

function getAuthHeaders(extra = {}) {
  if (typeof window === 'undefined') return extra;
  const token = localStorage.getItem('smas_token');
  if (!token) return extra;
  return { ...extra, Authorization: `Bearer ${token}` };
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientFailure(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'TypeError') return true;
  return TRANSIENT_STATUSES.has(err.status);
}

async function requestOnce(path, options = {}, { timeoutMs = null } = {}) {
  const isFormData = options.body instanceof FormData;
  const timeout = timeoutMs ? withTimeout(timeoutMs) : null;

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: timeout?.signal ?? options.signal ?? undefined,
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
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Request timed out. Please check your connection and try again.');
      timeoutErr.status = 408;
      throw timeoutErr;
    }
    throw err;
  } finally {
    timeout?.clear();
  }
}

async function request(path, options = {}) {
  const isAuthPath = path.startsWith('/auth/') || path === '/health';
  if (!isAuthPath) {
    return requestOnce(path, options);
  }

  let lastErr;
  for (let attempt = 0; attempt < AUTH_MAX_RETRIES; attempt += 1) {
    try {
      return await requestOnce(path, options, { timeoutMs: AUTH_TIMEOUT_MS });
    } catch (err) {
      lastErr = err;
      const canRetry = attempt < AUTH_MAX_RETRIES - 1 && isTransientFailure(err);
      if (!canRetry) break;
      await sleep(AUTH_RETRY_BASE_MS * (attempt + 1));
    }
  }

  if (isTransientFailure(lastErr)) {
    const warmupErr = new Error('Server is waking up. Please wait a moment and try again.');
    warmupErr.status = lastErr.status || 503;
    throw warmupErr;
  }
  throw lastErr;
}

/** Fire-and-forget ping to wake a sleeping Render backend before the user submits login. */
export function warmBackend() {
  if (typeof window === 'undefined') return;
  requestOnce('/health').catch(() => {});
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
    checkDuplicate: ({ photoBlob, formData, roleId, excludeId } = {}) => {
      const form = new FormData();
      if (photoBlob) form.append('photo', photoBlob, 'photo.jpg');
      if (formData) form.append('formData', JSON.stringify(formData));
      if (roleId) form.append('roleId', roleId);
      if (excludeId) form.append('excludeId', excludeId);
      return request('/registrations/check-duplicate', { method: 'POST', body: form });
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
    qrScan: (passCode, eventType, options = {}) => {
      const { gateId = null, departmentId = null, divisionId = null } = options;
      return request('/gate/qr-scan', {
        method: 'POST',
        body: JSON.stringify({
          passCode,
          eventType,
          gateId,
          departmentId,
          divisionId,
        }),
      });
    },
    logs: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/gate/logs${qs ? `?${qs}` : ''}`);
    },
    status: (registrationId) => request(`/gate/status/${registrationId}`),
    session: (registrationId, divisionId) =>
      request(`/gate/session/${registrationId}?divisionId=${divisionId}`),
    attachShift: (logId, shiftId, shiftName) =>
      request(`/gate/logs/${logId}/shift`, {
        method: 'PATCH',
        body: JSON.stringify({ shiftId, shiftName }),
      }),
  },

  reports: {
    listRegistrations: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/reports/registrations${qs ? `?${qs}` : ''}`);
    },
    getRegistration: (registrationId) => request(`/reports/registrations/${registrationId}`),
    dailyPasses: () => request('/reports/daily-passes'),
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

  shifts: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/shifts${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/shifts/${id}`),
    create: (data) => request('/shifts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/shifts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/shifts/${id}`, { method: 'DELETE' }),
  },
};

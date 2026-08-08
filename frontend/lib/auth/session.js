const TOKEN_KEY = 'smas_token';
const USER_KEY = 'smas_user';
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60;

export function getToken() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // ignore
    }
    try {
      document.cookie = `smas_token=${encodeURIComponent(token)}; path=/; max-age=${TOKEN_MAX_AGE}; SameSite=Lax`;
    } catch {
      // ignore
    }
  }
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
    try {
      document.cookie = 'smas_token=; path=/; max-age=0';
    } catch {
      // ignore
    }
  }
}

export function hasPermission(user, module, action = 'read') {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const perms = user.systemRoleId?.permissions;
  if (!perms) return false;
  const modulePerms = perms[module];
  if (!modulePerms) return false;
  if (action === 'read') return Boolean(modulePerms.read || modulePerms.write);
  return Boolean(modulePerms.write);
}

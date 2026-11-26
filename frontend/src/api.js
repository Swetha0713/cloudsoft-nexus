export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const SKIP_REFRESH_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/register-tenant',
  '/api/auth/change-password',
  '/api/team/accept-invite',
];

let activeRefreshPromise = null;

const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('csn_refresh_token');
  if (!refreshToken) {
    throw new Error('Session expired. Please sign in again.');
  }

  const response = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.accessToken) {
    localStorage.removeItem('csn_access_token');
    localStorage.removeItem('csn_refresh_token');
    throw new Error(data.message || 'Session expired. Please sign in again.');
  }

  localStorage.setItem('csn_access_token', data.accessToken);
  if (data.refreshToken) {
    localStorage.setItem('csn_refresh_token', data.refreshToken);
  }
  return data.accessToken;
};

export const apiRequest = async (path, options = {}, _retried = false) => {
  const token = localStorage.getItem('csn_access_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const shouldAttemptRefresh =
    response.status === 401 &&
    !_retried &&
    !SKIP_REFRESH_PATHS.some((p) => path.startsWith(p)) &&
    Boolean(localStorage.getItem('csn_refresh_token'));

  if (shouldAttemptRefresh) {
    try {
      if (!activeRefreshPromise) {
        activeRefreshPromise = refreshAccessToken().finally(() => {
          activeRefreshPromise = null;
        });
      }
      await activeRefreshPromise;
      return apiRequest(path, options, true);
    } catch (refreshErr) {
      throw refreshErr;
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
};
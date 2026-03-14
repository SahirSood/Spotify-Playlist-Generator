const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function getLoginUrl() {
  return `${BASE}/login`;
}

export function saveClusters(userId, accessToken, refreshToken) {
  return apiFetch('/save-tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, access_token: accessToken, refresh_token: refreshToken }),
  });
}

export function fetchClusters(userId) {
  return apiFetch(`/clusters?user_id=${encodeURIComponent(userId)}`);
}

export function fetchClusterStatus(userId) {
  return apiFetch(`/cluster-status?user_id=${encodeURIComponent(userId)}`);
}

export function triggerSyncAndCluster(userId, accessToken, refreshToken) {
  return apiFetch('/sync-and-cluster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, access_token: accessToken, refresh_token: refreshToken }),
  });
}

export function generatePlaylist(userId, accessToken, request) {
  return apiFetch('/generate-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, access_token: accessToken, request }),
  });
}

export function refreshToken(refreshTokenVal) {
  return apiFetch('/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshTokenVal }),
  });
}

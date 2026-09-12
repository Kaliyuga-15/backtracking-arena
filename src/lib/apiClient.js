'use client';

import { authHeaders } from './identity';

export const apiFetch = async (path, { method = 'GET', body } = {}) => {
  const response = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // A proxy timeout or a crash can return a non-JSON body.
  }

  if (!response.ok || !payload?.success) {
    const error = new Error(payload?.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return payload.data;
};
